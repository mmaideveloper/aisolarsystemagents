using System.ComponentModel;
using ModelContextProtocol.Server;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddMcpServer().WithHttpTransport(options => options.Stateless = true).WithTools<SmartRoomTools>();
var app = builder.Build();
app.MapGet("/", () => "healthy");
app.MapGet("/favicon.ico", () => Results.NoContent());
app.MapMcp("/mcp");
app.Run();

[McpServerToolType]
public class SmartRoomTools
{
    [McpServerTool(Name = "get_version")]
    [Description("Returns SmartRoom MCP version")]
    public string GetVersion() => "smartroom_v1";
}
