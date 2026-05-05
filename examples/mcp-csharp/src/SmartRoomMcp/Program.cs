using System.ComponentModel;
using ModelContextProtocol.Server;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddMcpServer().WithHttpTransport().WithTools<SmartRoomTools>();
var app = builder.Build();
app.MapMcp("/mcp");
app.Run();

[McpServerToolType]
public class SmartRoomTools
{
    [McpServerTool(Name = "get_version")]
    [Description("Returns SmartRoom MCP version")]
    public string GetVersion() => "smartroom_v1";
}
