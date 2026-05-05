using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

public sealed class GatewayConfigurationService(IConfiguration configuration)
{
    private readonly object _sync = new();
    private GatewayConfigDocument _doc = configuration.Get<GatewayConfigDocument>() ?? new();
    public bool RestartRequested { get; private set; }

    public GatewayConfigDocument Get()
    {
        lock (_sync) return JsonSerializer.Deserialize<GatewayConfigDocument>(JsonSerializer.Serialize(_doc)) ?? new();
    }

    public GatewayConfigDocument AddOrUpdate(SubServerConfig subServer)
    {
        lock (_sync)
        {
            var existing = _doc.SubServers.FirstOrDefault(x => x.Name.Equals(subServer.Name, StringComparison.OrdinalIgnoreCase));
            if (existing is null) _doc.SubServers.Add(subServer);
            else
            {
                existing.Url = subServer.Url;
                existing.OAuth = subServer.OAuth;
            }
            return Get();
        }
    }

    public void RequestRestart()
    {
        lock (_sync) RestartRequested = true;
    }
}

public sealed class SubServerMcpRelayService(IHttpClientFactory httpClientFactory, GatewayConfigurationService config)
{
    public async Task<string> ForwardAsync(string serverName, string jsonRpcBody, string authHeader, CancellationToken ct)
    {
        var server = config.Get().SubServers.FirstOrDefault(s => s.Name.Equals(serverName, StringComparison.OrdinalIgnoreCase))
                     ?? throw new InvalidOperationException($"Unknown subserver '{serverName}'");

        using var req = new HttpRequestMessage(HttpMethod.Post, server.Url)
        {
            Content = new StringContent(jsonRpcBody, Encoding.UTF8, "application/json")
        };

        if (!string.IsNullOrWhiteSpace(authHeader))
        {
            req.Headers.Authorization = AuthenticationHeaderValue.Parse(authHeader);
        }

        var client = httpClientFactory.CreateClient();
        using var resp = await client.SendAsync(req, ct);
        resp.EnsureSuccessStatusCode();
        return await resp.Content.ReadAsStringAsync(ct);
    }
}
