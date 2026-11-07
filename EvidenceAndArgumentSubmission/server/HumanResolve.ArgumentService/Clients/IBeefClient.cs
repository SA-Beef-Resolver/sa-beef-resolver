namespace HumanResolve.ArgumentService.Clients;

public sealed record BeefInfo(long Id, string PersonAId, string PersonBId, string Status);

public enum BeefLookupKind { Found, NotFound, Forbidden, NotLinked }

public sealed record BeefLookup(BeefLookupKind Kind, BeefInfo? Beef = null);

/// <summary>Asks the dispute (beef) service about a dispute on behalf of the signed-in user.</summary>
public interface IBeefClient
{
    /// <summary>The caller's bearer token is forwarded, so the dispute service decides whether the caller is a party.
    /// Throws BeefServiceUnavailableException when the dispute service cannot be reached or rejects the token.</summary>
    Task<BeefLookup> GetBeefAsync(long beefId, string bearerToken, CancellationToken cancellationToken);
}

public sealed class BeefServiceUnavailableException(string message, Exception? inner = null) : Exception(message, inner);
