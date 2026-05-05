using Microsoft.AspNetCore.Authentication.JwtBearer;
using ModelContextProtocol.Server;
using ModelContextProtocol.Protocol;

var builder = WebApplication.CreateBuilder(args);

builder.Services.Configure<GatewayAuthOptions>(builder.Configuration.GetSection("Authentication"));
builder.Services.Configure<GatewayConfigDocument>(builder.Configuration);

var auth = builder.Configuration.GetSection("Authentication").Get<GatewayAuthOptions>() ?? new();

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.Authority = auth.Authority;
        options.Audience = auth.Audience;
        options.TokenValidationParameters.ValidAudience = auth.Audience;
        options.RequireHttpsMetadata = true;
    });

builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("GatewayPolicy", policy =>
    {
        policy.RequireAuthenticatedUser();
        policy.RequireAssertion(ctx => auth.Scopes.Any(scope => ctx.User.HasClaim("scope", scope)));
    });
});

builder.Services.AddHttpClient();
builder.Services.AddSingleton<GatewayConfigurationService>();
builder.Services.AddSingleton<SubServerMcpRelayService>();
builder.Services.AddSingleton<GatewayMcpToolService>();

builder.Services
    .AddMcpServer()
    .WithHttpTransport(options => options.Stateless = true)
    .WithListToolsHandler(async (RequestContext<ListToolsRequestParams> request, CancellationToken ct) =>
    {
        var tools = request.Services!.GetRequiredService<GatewayMcpToolService>();
        return await tools.ListToolsAsync(ct);
    })
    .WithCallToolHandler(async (RequestContext<CallToolRequestParams> request, CancellationToken ct) =>
    {
        var tools = request.Services!.GetRequiredService<GatewayMcpToolService>();
        return await tools.CallToolAsync(request.Params!, ct);
    });

var app = builder.Build();
app.UseAuthentication();
app.UseAuthorization();
app.MapGet("/", () => "healthy");
app.MapGet("/favicon.ico", () => Results.NoContent());

var requireGatewayAuth = !app.Environment.IsDevelopment();
var mcpEndpoint = app.MapMcp("/mcp");
if (requireGatewayAuth)
{
    mcpEndpoint.RequireAuthorization("GatewayPolicy");
}

// HTTP relay: forward initialize/tools/list/tools/call to a selected subserver.
var relayEndpoint = app.MapPost("/relay/{serverName}", async (string serverName, HttpRequest request, SubServerMcpRelayService relay, CancellationToken ct) =>
{
    using var reader = new StreamReader(request.Body);
    var body = await reader.ReadToEndAsync(ct);
    var authHeader = request.Headers.Authorization.ToString();
    var responseJson = await relay.ForwardAsync(serverName, body, authHeader, ct);
    return Results.Content(responseJson, "application/json");
});
if (requireGatewayAuth)
{
    relayEndpoint.RequireAuthorization("GatewayPolicy");
}

app.Run();

public sealed class GatewayAuthOptions
{
    public string Authority { get; set; } = "";
    public string Audience { get; set; } = "";
    public List<string> Scopes { get; set; } = new();
}

public sealed class GatewayConfigDocument
{
    public GatewayAuthOptions Authentication { get; set; } = new();
    public List<SubServerConfig> SubServers { get; set; } = new();
}

public sealed class SubServerConfig
{
    public string Name { get; set; } = "";
    public string Url { get; set; } = "";
    public OAuthConfig OAuth { get; set; } = new();
}

public sealed class OAuthConfig
{
    public string Scope { get; set; } = "";
}
