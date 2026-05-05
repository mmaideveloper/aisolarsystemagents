# C# shared MCP architecture: control-plane gateway + independent subservers

This version follows your requested model:

- Main MCP server does **not know any subserver tools/methods**.
- Main MCP server has only:
  - `gateway.get_configuration`
  - `gateway.add_configuration`
  - `gateway.restart`
- Main MCP server relays MCP JSON-RPC to subservers (`/relay/{serverName}`), including `initialize`, `tools/list`, `tools/call`, and other MCP commands.

## Projects

- `src/MainGateway` (public MCP control plane)
- `src/SmartRoomMcp` (subserver with `get_version` => `smartroom_v1`)
- `src/SmartIdentityMcp` (subserver with `get_version` => `smartidentity_v1`)

## Configuration model

`src/MainGateway/appsettings.json` keeps dynamic subservers:

- `name`
- `url`
- `oauth.scope`

Main gateway reads this configuration and uses it for relay target resolution.

## How tool discovery works dynamically

1. Client calls main gateway tool `gateway.get_configuration`.
2. For each configured subserver, client sends MCP `initialize` and `tools/list` through:
   - `POST /relay/smartroom`
   - `POST /relay/smartidentity`
3. Client then calls the selected subserver tools through the same relay endpoint.

This keeps main gateway generic while subservers own their tool definitions.
