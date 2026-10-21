using Grpc.Core;
using HumanResolve.ArgumentService.Clients;
using HumanResolve.ArgumentService.Domain;
using HumanResolve.ArgumentService.Repositories;
using Proto = HumanResolve.Argument.V1;
using DomainArgumentStatus = HumanResolve.ArgumentService.Domain.ArgumentStatus;
using DomainEvidenceType = HumanResolve.ArgumentService.Domain.EvidenceType;
using HumanResolve.ArgumentService.Messaging;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace HumanResolve.ArgumentService.Services;

public sealed class ArgumentGrpcService(IArgumentRepository repository, RabbitMqAiPublisher publisher,
    AiParticipantRegistry participants, ILogger<ArgumentGrpcService> logger, IBeefClient? beefs = null) : Proto.ArgumentService.ArgumentServiceBase
{
    private const int DefaultPageSize = 20;
    private const int MaximumPageSize = 100;

    // When the dispute service is configured (BEEF_API_URL), a dispute_id must be the id of a real dispute that the
    // caller is a party to. Returns the caller's side (1 = creator, 2 = opponent), or 0 when linking is switched off.
    private async Task<int> LinkToDisputeAsync(string disputeId, string personId, ServerCallContext context, bool requireOpen)
    {
        if (beefs is null) return 0;
        if (!long.TryParse(disputeId, out var beefId) || beefId < 1)
            throw Rpc(StatusCode.InvalidArgument, "dispute_id must be the numeric id of an existing dispute");
        var header = context.GetHttpContext().Request.Headers.Authorization.ToString();
        var token = header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase) ? header[7..] : header;
        BeefLookup lookup;
        try { lookup = await beefs.GetBeefAsync(beefId, token, context.CancellationToken); }
        catch (BeefServiceUnavailableException ex)
        {
            logger.LogWarning("Dispute service check failed: {Message}", ex.Message);
            throw Rpc(StatusCode.Unavailable, "dispute service is unavailable; try again later");
        }
        var beef = lookup.Kind switch
        {
            BeefLookupKind.Found => lookup.Beef!,
            BeefLookupKind.NotFound => throw Rpc(StatusCode.NotFound, "dispute was not found"),
            BeefLookupKind.Forbidden => throw Rpc(StatusCode.PermissionDenied, "you are not a party to this dispute"),
            _ => throw Rpc(StatusCode.FailedPrecondition, "this dispute is not linked to user accounts")
        };
        if (requireOpen && beef.Status == "resolved") throw Rpc(StatusCode.FailedPrecondition, "dispute is already resolved");
        if (string.Equals(beef.PersonAId, personId, StringComparison.OrdinalIgnoreCase)) return 1;
        if (string.Equals(beef.PersonBId, personId, StringComparison.OrdinalIgnoreCase)) return 2;
        throw Rpc(StatusCode.PermissionDenied, "you are not a party to this dispute");
    }

    public override async Task<Proto.SubmitArgumentForAiResponse> SubmitArgumentForAi(
        Proto.SubmitArgumentForAiRequest request, ServerCallContext context)
    {
        var id = ParseGuid(request.ArgumentId, "argument_id");
        var person = CurrentUserId(context);
        var record = repository.Get(id) ?? throw Rpc(StatusCode.NotFound, "argument was not found");
        if (record.PersonId != person) throw Rpc(StatusCode.PermissionDenied, "only the author may submit this argument");
        if (request.ExpectedVersion != record.Version) throw Rpc(StatusCode.Aborted, "argument changed; fetch its latest version");
        if (record.Status != DomainArgumentStatus.Submitted) throw Rpc(StatusCode.FailedPrecondition, "save argument with SUBMITTED status first");
        if (!Regex.IsMatch(record.DisputeId, "\\A[A-Za-z0-9_-]{1,128}\\z"))
            throw Rpc(StatusCode.InvalidArgument, "dispute_id must be compatible with AI sessionId (letters/digits/_/-)");
        // With linked disputes the side comes from the account (creator = 1, opponent = 2) and a mismatching request is refused.
        var derivedSide = await LinkToDisputeAsync(record.DisputeId, person, context, requireOpen: true);
        if (derivedSide != 0 && request.People != 0 && request.People != derivedSide)
            throw Rpc(StatusCode.InvalidArgument, $"people must be {derivedSide} for your role in this dispute (or omitted)");
        var people = derivedSide != 0 ? derivedSide : request.People;
        if (people is not (1 or 2)) throw Rpc(StatusCode.InvalidArgument, "people must be 1 or 2");
        // Evidence references are claims/metadata; the worker does not download files.
        var message = JsonSerializer.Serialize(new
        {
            argumentId = record.ArgumentId, version = record.Version, statement = record.Statement,
            evidence = record.Evidence.Select(x => new { type = x.Type.ToString(), url = x.EvidenceUrl, description = x.Description })
        }, new JsonSerializerOptions { Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping });
        if (message.EnumerateRunes().Count() > 8000)
            throw Rpc(StatusCode.InvalidArgument, "AI message including evidence metadata exceeds 8000 characters");
        if (!participants.TryBind(record.DisputeId, person, people))
            throw Rpc(StatusCode.FailedPrecondition, "side is already assigned to another author or author switched sides");
        var messageId = $"argument_{record.ArgumentId:N}_v{record.Version}";
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(context.CancellationToken);
        timeout.CancelAfter(TimeSpan.FromSeconds(10));
        try
        {
            await publisher.PublishAsync(record.DisputeId, people, message, messageId, timeout.Token);
        }
        catch (Exception ex)
        {
            logger.LogWarning("AI publication failed ({ErrorType}) for argument {ArgumentId}", ex.GetType().Name, id);
            throw Rpc(StatusCode.Unavailable, "AI queue acceptance was not confirmed; retry SubmitArgumentForAi with the same argument/version");
        }
        return new Proto.SubmitArgumentForAiResponse { SessionId = record.DisputeId, MessageId = messageId, Queued = true };
    }

    public override async Task<Proto.Argument> CreateArgument(Proto.CreateArgumentRequest request, ServerCallContext context)
    {
        var disputeId = Required(request.DisputeId, "dispute_id");
        var statement = Required(request.Statement, "statement", 10_000);
        var person = CurrentUserId(context);
        var evidence = ToEvidence(request.Evidence);
        var status = ToDomainStatus(request.Status);
        await LinkToDisputeAsync(disputeId, person, context, requireOpen: true);
        return ToProto(repository.Create(disputeId, person, statement, evidence, status));
    }

    public override async Task<Proto.Argument> GetArgument(Proto.GetArgumentRequest request, ServerCallContext context)
    {
        var id = ParseGuid(request.ArgumentId, "argument_id");
        var record = repository.Get(id) ?? throw Rpc(StatusCode.NotFound, "argument was not found");
        await LinkToDisputeAsync(record.DisputeId, CurrentUserId(context), context, requireOpen: false);
        return ToProto(record);
    }

    public override async Task<Proto.GetAllArgumentsResponse> GetAllArguments(Proto.GetAllArgumentsRequest request, ServerCallContext context)
    {
        var disputeId = Required(request.DisputeId, "dispute_id");
        await LinkToDisputeAsync(disputeId, CurrentUserId(context), context, requireOpen: false);
        var personId = string.IsNullOrWhiteSpace(request.PersonId) ? null : Required(request.PersonId, "person_id");
        var offset = ParsePageToken(request.PageToken);
        var pageSize = request.PageSize == 0 ? DefaultPageSize : request.PageSize;
        if (pageSize is < 1 or > MaximumPageSize) throw Rpc(StatusCode.InvalidArgument, $"page_size must be between 1 and {MaximumPageSize}");
        var records = repository.GetAll(disputeId, personId, offset, pageSize, out var hasNextPage);
        var response = new Proto.GetAllArgumentsResponse { NextPageToken = hasNextPage ? (offset + records.Count).ToString() : string.Empty };
        response.Arguments.AddRange(records.Select(ToProto));
        return response;
    }

    public override Task<Proto.Argument> UpdateArgument(Proto.UpdateArgumentRequest request, ServerCallContext context)
    {
        var id = ParseGuid(request.ArgumentId, "argument_id");
        var statement = Required(request.Statement, "statement", 10_000);
        if (request.ExpectedVersion < 1) throw Rpc(StatusCode.InvalidArgument, "expected_version must be a positive integer");
        var result = repository.Update(id, CurrentUserId(context), statement, ToEvidence(request.Evidence), ToDomainStatus(request.Status), request.ExpectedVersion);
        return result.Kind switch
        {
            UpdateResultKind.Updated => Task.FromResult(ToProto(result.Argument!)),
            UpdateResultKind.NotFound => throw Rpc(StatusCode.NotFound, "argument was not found"),
            UpdateResultKind.Forbidden => throw Rpc(StatusCode.PermissionDenied, "only the argument author may update it"),
            UpdateResultKind.VersionConflict => throw Rpc(StatusCode.Aborted, "argument changed; get it again and retry with its current version"),
            _ => throw Rpc(StatusCode.Internal, "unhandled update result")
        };
    }

    public override Task<Proto.DeleteArgumentResponse> DeleteArgument(Proto.DeleteArgumentRequest request, ServerCallContext context)
    {
        var id = ParseGuid(request.ArgumentId, "argument_id");
        if (request.ExpectedVersion < 1) throw Rpc(StatusCode.InvalidArgument, "expected_version must be a positive integer");
        var result = repository.Delete(id, CurrentUserId(context), request.ExpectedVersion);
        return result.Kind switch
        {
            DeleteResultKind.Deleted => Task.FromResult(new Proto.DeleteArgumentResponse { ArgumentId = id.ToString(), Deleted = true }),
            DeleteResultKind.NotFound => throw Rpc(StatusCode.NotFound, "argument was not found"),
            DeleteResultKind.Forbidden => throw Rpc(StatusCode.PermissionDenied, "only the argument author may delete it"),
            DeleteResultKind.VersionConflict => throw Rpc(StatusCode.Aborted, "argument changed; get it again and retry with its current version"),
            _ => throw Rpc(StatusCode.Internal, "unhandled delete result")
        };
    }

    private static string Required(string value, string field, int maxLength = 100)
    {
        var trimmed = value?.Trim();
        if (string.IsNullOrEmpty(trimmed)) throw Rpc(StatusCode.InvalidArgument, $"{field} is required");
        if (trimmed.Length > maxLength) throw Rpc(StatusCode.InvalidArgument, $"{field} must not exceed {maxLength} characters");
        return trimmed;
    }

    private static Guid ParseGuid(string value, string field) => Guid.TryParse(value, out var id)
        ? id
        : throw Rpc(StatusCode.InvalidArgument, $"{field} must be a UUID");

    private static int ParsePageToken(string token) => string.IsNullOrEmpty(token)
        ? 0
        : int.TryParse(token, out var offset) && offset >= 0
            ? offset
            : throw Rpc(StatusCode.InvalidArgument, "page_token is invalid");

    private static string CurrentUserId(ServerCallContext context)
    {
        var value = context.GetHttpContext().User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        return Guid.TryParse(value, out var personId)
            ? personId.ToString()
            : throw Rpc(StatusCode.Unauthenticated, "a valid bearer token is required");
    }

    private static DomainArgumentStatus ToDomainStatus(Proto.ArgumentStatus status) => status switch
    {
        Proto.ArgumentStatus.Unspecified => DomainArgumentStatus.Draft,
        Proto.ArgumentStatus.Draft => DomainArgumentStatus.Draft,
        Proto.ArgumentStatus.Submitted => DomainArgumentStatus.Submitted,
        _ => throw Rpc(StatusCode.InvalidArgument, "status is invalid")
    };

    private static IReadOnlyList<EvidenceRecord> ToEvidence(IEnumerable<Proto.Evidence> source)
    {
        var evidence = source.ToList();
        if (evidence.Count > 10) throw Rpc(StatusCode.InvalidArgument, "evidence must contain between 0 and 10 items");
        return evidence.Select((item, index) => new EvidenceRecord(
            Guid.NewGuid(),
            ToDomainEvidenceType(item.Type, index),
            ValidateHttpUrl(item.EvidenceUrl, index),
            (item.Description ?? string.Empty).Trim()[..Math.Min((item.Description ?? string.Empty).Trim().Length, 500)],
            DateTimeOffset.UtcNow)).ToList();
    }

    private static DomainEvidenceType ToDomainEvidenceType(Proto.EvidenceType type, int index) => type switch
    {
        Proto.EvidenceType.Image => DomainEvidenceType.Image,
        Proto.EvidenceType.Document => DomainEvidenceType.Document,
        Proto.EvidenceType.Link => DomainEvidenceType.Link,
        Proto.EvidenceType.Other => DomainEvidenceType.Other,
        _ => throw Rpc(StatusCode.InvalidArgument, $"evidence[{index}].type is invalid")
    };

    private static string ValidateHttpUrl(string value, int index)
    {
        var url = Required(value, $"evidence[{index}].evidence_url", 2048);
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri) || (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps))
            throw Rpc(StatusCode.InvalidArgument, $"evidence[{index}].evidence_url must be an HTTP(S) URL");
        return url;
    }

    private static Proto.Argument ToProto(ArgumentRecord record)
    {
        var response = new Proto.Argument
        {
            ArgumentId = record.ArgumentId.ToString(),
            DisputeId = record.DisputeId,
            PersonId = record.PersonId,
            Statement = record.Statement,
            Status = record.Status == DomainArgumentStatus.Draft ? Proto.ArgumentStatus.Draft : Proto.ArgumentStatus.Submitted,
            Version = record.Version,
            CreatedAt = record.CreatedAt.ToString("O"),
            UpdatedAt = record.UpdatedAt.ToString("O")
        };
        response.Evidence.AddRange(record.Evidence.Select(item => new Proto.Evidence
        {
            EvidenceId = item.EvidenceId.ToString(),
            Type = item.Type switch
            {
                DomainEvidenceType.Image => Proto.EvidenceType.Image,
                DomainEvidenceType.Document => Proto.EvidenceType.Document,
                DomainEvidenceType.Link => Proto.EvidenceType.Link,
                _ => Proto.EvidenceType.Other
            },
            EvidenceUrl = item.EvidenceUrl,
            Description = item.Description,
            CreatedAt = item.CreatedAt.ToString("O")
        }));
        return response;
    }

    private static RpcException Rpc(StatusCode code, string details) => new(new Status(code, details));
}
