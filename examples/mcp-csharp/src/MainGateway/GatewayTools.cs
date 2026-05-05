using System.ComponentModel;
using ModelContextProtocol.Server;

[McpServerToolType]
public sealed class GatewayTools(GatewayConfigurationService configuration)
{
    [McpServerTool(Name = "gateway.get_configuration")]
    [Description("Returns current subserver configuration from persistent store")]
    public GatewayConfigDocument GetConfiguration() => configuration.Get();

    [McpServerTool(Name = "gateway.add_configuration")]
    [Description("Adds or updates one subserver configuration entry")]
    public GatewayConfigDocument AddConfiguration(SubServerConfig subServer)
        => configuration.AddOrUpdate(subServer);

    [McpServerTool(Name = "gateway.restart")]
    [Description("Requests gateway restart so new configuration is reloaded")]
    public string Restart()
    {
        configuration.RequestRestart();
        return "restart_requested";
    }
}
