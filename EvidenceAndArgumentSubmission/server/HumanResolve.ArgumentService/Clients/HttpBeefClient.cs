using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace HumanResolve.ArgumentService.Clients;

public sealed class HttpBeefClient(HttpClient http) : IBeefClient
{
    private sealed record BeefDto(
        [property: JsonPropertyName("id")] long Id,
        [property: JsonPropertyName("person_a_id")] string? PersonAId,
        [property: JsonPropertyName("person_b_id")] string? PersonBId,
        [property: JsonPropertyName("status")] string Status);

    public async Task<BeefLookup> GetBeefAsync(long beefId, string bearerToken, CancellationToken cancellationToken)
    {
        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, $"api/beefs/{beefId}");
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", bearerToken);
            using var response = await http.SendAsync(request, cancellationToken);
            switch (response.StatusCode)
            {
                case HttpStatusCode.NotFound: return new BeefLookup(BeefLookupKind.NotFound);
                case HttpStatusCode.Forbidden: return new BeefLookup(BeefLookupKind.Forbidden);
                case HttpStatusCode.UnprocessableEntity: return new BeefLookup(BeefLookupKind.NotLinked);
                case HttpStatusCode.Unauthorized:
                    throw new BeefServiceUnavailableException("Dispute service rejected the token (check the shared JWT settings).");
            }
            response.EnsureSuccessStatusCode();
            var dto = await response.Content.ReadFromJsonAsync<BeefDto>(cancellationToken)
                ?? throw new BeefServiceUnavailableException("Dispute service returned an empty response.");
            if (string.IsNullOrEmpty(dto.PersonAId) || string.IsNullOrEmpty(dto.PersonBId)) return new BeefLookup(BeefLookupKind.NotLinked);
            return new BeefLookup(BeefLookupKind.Found, new BeefInfo(dto.Id, dto.PersonAId, dto.PersonBId, dto.Status));
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException)
        {
            throw new BeefServiceUnavailableException("Dispute service is unavailable.", ex);
        }
    }
}
