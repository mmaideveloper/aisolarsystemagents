# C# shared MCP architecture: control-plane gateway + independent subservers

This version follows your requested model:

- Main MCP server does **not know any subserver tools/methods**.
- Main MCP server has only:
  - `gateway_get_configuration`
  - `gateway_add_configuration`
  - `gateway_restart`
- Main MCP server relays MCP JSON-RPC to subservers (`/relay/{serverName}`), including `initialize`, `tools/list`, `tools/call`, and other MCP commands.

## Projects

- `src/MainGateway` (public MCP control plane)
- `src/SmartRoomMcp` (subserver with `get_version` => `smartroom_v1`)
- `src/SmartIdentityMcp` (subserver with `get_version` => `smartidentity_v1`)

## Run all servers

From this folder:

```powershell
.\scripts\run-all-mcp.ps1
```

The runner opens one console window per server, names the window after the server, and mirrors each server's output to a log file.

In `Development`, the gateway `/mcp` and `/relay/*` endpoints are open for local MCP clients such as VS Code workspace MCP configuration. Outside `Development`, the gateway requires the configured JWT authorization policy.

Default endpoints:

- Gateway: `http://localhost:5080/mcp`
- SmartRoom: `http://localhost:5081/mcp`
- SmartIdentity: `http://localhost:5082/mcp`

Server output is written to:

- `.logs/MainGateway.log`
- `.logs/SmartRoomMcp.log`
- `.logs/SmartIdentityMcp.log`

Override ports when needed:

```powershell
.\scripts\run-all-mcp.ps1 `
  -GatewayUrl http://localhost:5180 `
  -SmartRoomUrl http://localhost:5181 `
  -SmartIdentityUrl http://localhost:5182
```

## Configuration model

`src/MainGateway/appsettings.json` keeps dynamic subservers:

- `name`
- `url`
- `oauth.scope`

Main gateway reads this configuration and uses it for relay target resolution.

## How tool discovery works dynamically

1. Client calls main gateway tool `gateway_get_configuration`.
2. For each configured subserver, client sends MCP `initialize` and `tools/list` through:
   - `POST /relay/smartroom`
   - `POST /relay/smartidentity`
3. Client then calls the selected subserver tools through the same relay endpoint.

This keeps main gateway generic while subservers own their tool definitions.
