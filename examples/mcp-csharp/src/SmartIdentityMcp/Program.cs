using System.ComponentModel;
using ModelContextProtocol.Server;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddMcpServer().WithHttpTransport().WithTools<SmartIdentityTools>();
var app = builder.Build();
app.MapMcp("/mcp");
app.Run();

[McpServerToolType]
public class SmartIdentityTools
{
    [McpServerTool(Name = "get_version")]
    [Description("Returns SmartIdentity MCP version")]
    public string GetVersion() => "smartidentity_v1";
}
