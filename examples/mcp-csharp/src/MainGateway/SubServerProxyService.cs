using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using ModelContextProtocol.Protocol;

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
        var correlationId = CreateCorrelationId();
        Console.WriteLine($"[{DateTimeOffset.UtcNow:O}] correlationId={correlationId} method=relay/{serverName} status=start");
        try
        {
            var server = config.Get().SubServers.FirstOrDefault(s => s.Name.Equals(serverName, StringComparison.OrdinalIgnoreCase))
                         ?? throw new InvalidOperationException($"Unknown subserver '{serverName}'");

            jsonRpcBody = AddCorrelationIdToJsonRpcBody(jsonRpcBody, correlationId);

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
            var body = await resp.Content.ReadAsStringAsync(ct);
            Console.WriteLine($"[{DateTimeOffset.UtcNow:O}] correlationId={correlationId} method=relay/{serverName} status=end");
            return body;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[{DateTimeOffset.UtcNow:O}] correlationId={correlationId} method=relay/{serverName} status=error error=\"{ex.Message}\"");
            throw;
        }
    }

    private static string AddCorrelationIdToJsonRpcBody(string jsonRpcBody, string correlationId)
    {
        var node = JsonNode.Parse(jsonRpcBody)?.AsObject()
            ?? throw new InvalidOperationException("MCP request body was not valid JSON.");

        if (!string.Equals(node["method"]?.GetValue<string>(), "tools/call", StringComparison.OrdinalIgnoreCase))
        {
            return jsonRpcBody;
        }

        if (node["params"] is not JsonObject parameters)
        {
            parameters = new JsonObject();
            node["params"] = parameters;
        }

        if (parameters["arguments"] is not JsonObject arguments)
        {
            arguments = new JsonObject();
            parameters["arguments"] = arguments;
        }

        arguments["correlationId"] = correlationId;
        return JsonSerializer.Serialize(node, GatewayMcpToolService.JsonOptions);
    }

    private static string CreateCorrelationId() => Guid.NewGuid().ToString("N");
}

public sealed class GatewayMcpToolService(
    IHttpClientFactory httpClientFactory,
    GatewayConfigurationService configuration)
{
    internal static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public async Task<ListToolsResult> ListToolsAsync(CancellationToken ct)
    {
        var tools = new JsonArray
        {
            CreateTool(
                "gateway_get_configuration",
                "Returns current subserver configuration from persistent store",
                EmptyObjectSchema()),
            CreateTool(
                "gateway_add_configuration",
                "Adds or updates one subserver configuration entry",
                SubServerConfigSchema()),
            CreateTool(
                "gateway_restart",
                "Requests gateway restart so new configuration is reloaded",
                EmptyObjectSchema())
        };

        foreach (var server in configuration.Get().SubServers)
        {
            try
            {
                var result = await SendMcpRequestAsync(
                    server.Url,
                    "tools/list",
                    new JsonObject(),
                    ct);

                if (result["tools"] is not JsonArray subTools)
                {
                    continue;
                }

                foreach (var subToolNode in subTools)
                {
                    if (subToolNode is not JsonObject subTool)
                    {
                        continue;
                    }

                    var originalName = subTool["name"]?.GetValue<string>();
                    if (string.IsNullOrWhiteSpace(originalName))
                    {
                        continue;
                    }

                    var gatewayTool = subTool.DeepClone().AsObject();
                    gatewayTool["name"] = ToGatewayToolName(server.Name, originalName);
                    gatewayTool["description"] = PrefixDescription(server.Name, gatewayTool["description"]?.GetValue<string>());
                    tools.Add(gatewayTool);
                }
            }
            catch (Exception ex)
            {
                tools.Add(CreateTool(
                    ToGatewayToolName(server.Name, "discovery_error"),
                    $"Discovery failed for {server.Name}: {ex.Message}",
                    EmptyObjectSchema()));
            }
        }

        return DeserializeResult<ListToolsResult>(new JsonObject { ["tools"] = tools });
    }

    public async Task<CallToolResult> CallToolAsync(CallToolRequestParams request, CancellationToken ct)
    {
        var correlationId = CreateCorrelationId();
        Console.WriteLine($"[{DateTimeOffset.UtcNow:O}] correlationId={correlationId} method={request.Name} status=start");

        try
        {
            var result = request.Name switch
            {
                "gateway_get_configuration" => CreateTextResult(configuration.Get()),
                "gateway_add_configuration" => AddConfiguration(request),
                "gateway_restart" => RestartGateway(),
                _ => await CallSubServerToolAsync(request, correlationId, ct)
            };

            Console.WriteLine($"[{DateTimeOffset.UtcNow:O}] correlationId={correlationId} method={request.Name} status=end");
            return result;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[{DateTimeOffset.UtcNow:O}] correlationId={correlationId} method={request.Name} status=error error=\"{ex.Message}\"");
            throw;
        }
    }

    private CallToolResult AddConfiguration(CallToolRequestParams request)
    {
        if (request.Arguments is null ||
            !request.Arguments.TryGetValue("subServer", out var subServerJson))
        {
            return CreateErrorResult("Missing required argument 'subServer'.");
        }

        var subServer = subServerJson.Deserialize<SubServerConfig>(JsonOptions);
        if (subServer is null || string.IsNullOrWhiteSpace(subServer.Name) || string.IsNullOrWhiteSpace(subServer.Url))
        {
            return CreateErrorResult("'subServer' must include non-empty 'name' and 'url' values.");
        }

        return CreateTextResult(configuration.AddOrUpdate(subServer));
    }

    private CallToolResult RestartGateway()
    {
        configuration.RequestRestart();
        return CreateTextResult("restart_requested");
    }

    private async Task<CallToolResult> CallSubServerToolAsync(CallToolRequestParams request, string correlationId, CancellationToken ct)
    {
        foreach (var server in configuration.Get().SubServers)
        {
            var listResult = await SendMcpRequestAsync(server.Url, "tools/list", new JsonObject(), ct);
            if (listResult["tools"] is not JsonArray subTools)
            {
                continue;
            }

            foreach (var subToolNode in subTools)
            {
                if (subToolNode is not JsonObject subTool)
                {
                    continue;
                }

                var originalToolName = subTool["name"]?.GetValue<string>();
                if (string.IsNullOrWhiteSpace(originalToolName) ||
                    !string.Equals(ToGatewayToolName(server.Name, originalToolName), request.Name, StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                var arguments = request.Arguments is null
                    ? new JsonObject()
                    : JsonSerializer.SerializeToNode(request.Arguments, JsonOptions)?.AsObject() ?? new JsonObject();
                arguments["correlationId"] = correlationId;

                var result = await SendMcpRequestAsync(
                    server.Url,
                    "tools/call",
                    new JsonObject
                    {
                        ["name"] = originalToolName,
                        ["arguments"] = arguments
                    },
                    ct);

                return DeserializeResult<CallToolResult>(result);
            }
        }

        return CreateErrorResult($"Unknown tool '{request.Name}'.");
    }

    private async Task<JsonObject> SendMcpRequestAsync(
        string url,
        string method,
        JsonObject parameters,
        CancellationToken ct)
    {
        using var req = new HttpRequestMessage(HttpMethod.Post, url)
        {
            Content = new StringContent(
                JsonSerializer.Serialize(new JsonObject
                {
                    ["jsonrpc"] = "2.0",
                    ["id"] = Guid.NewGuid().ToString("N"),
                    ["method"] = method,
                    ["params"] = parameters
                }, JsonOptions),
                Encoding.UTF8,
                "application/json")
        };

        req.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        req.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("text/event-stream"));
        req.Headers.TryAddWithoutValidation("MCP-Protocol-Version", "2025-06-18");

        var client = httpClientFactory.CreateClient();
        using var resp = await client.SendAsync(req, ct);
        resp.EnsureSuccessStatusCode();

        var body = await resp.Content.ReadAsStringAsync(ct);
        var envelope = ParseMcpEnvelope(body);

        if (envelope["error"] is JsonObject error)
        {
            var message = error["message"]?.GetValue<string>() ?? "MCP request failed.";
            throw new InvalidOperationException(message);
        }

        return envelope["result"] as JsonObject
            ?? throw new InvalidOperationException("MCP response did not include a result object.");
    }

    private static JsonObject ParseMcpEnvelope(string body)
    {
        if (body.TrimStart().StartsWith('{'))
        {
            return JsonNode.Parse(body)?.AsObject()
                ?? throw new InvalidOperationException("MCP response was not valid JSON.");
        }

        var data = string.Join(
            Environment.NewLine,
            body.Split(["\r\n", "\n"], StringSplitOptions.None)
                .Where(line => line.StartsWith("data:", StringComparison.OrdinalIgnoreCase))
                .Select(line => line["data:".Length..].Trim()));

        if (string.IsNullOrWhiteSpace(data))
        {
            throw new InvalidOperationException("MCP event-stream response did not include a data event.");
        }

        return JsonNode.Parse(data)?.AsObject()
            ?? throw new InvalidOperationException("MCP event-stream data was not valid JSON.");
    }

    private static T DeserializeResult<T>(JsonObject result)
        => result.Deserialize<T>(JsonOptions)
           ?? throw new InvalidOperationException($"Unable to deserialize MCP {typeof(T).Name}.");

    private static CallToolResult CreateTextResult(object value)
        => DeserializeResult<CallToolResult>(new JsonObject
        {
            ["content"] = new JsonArray
            {
                new JsonObject
                {
                    ["type"] = "text",
                    ["text"] = value is string text ? text : JsonSerializer.Serialize(value, JsonOptions)
                }
            }
        });

    private static CallToolResult CreateErrorResult(string message)
        => DeserializeResult<CallToolResult>(new JsonObject
        {
            ["isError"] = true,
            ["content"] = new JsonArray
            {
                new JsonObject
                {
                    ["type"] = "text",
                    ["text"] = message
                }
            }
        });

    private static JsonObject CreateTool(string name, string description, JsonObject inputSchema)
        => new()
        {
            ["name"] = name,
            ["description"] = description,
            ["inputSchema"] = inputSchema
        };

    private static JsonObject EmptyObjectSchema()
        => new()
        {
            ["type"] = "object",
            ["properties"] = new JsonObject(),
            ["additionalProperties"] = false
        };

    private static JsonObject SubServerConfigSchema()
        => new()
        {
            ["type"] = "object",
            ["properties"] = new JsonObject
            {
                ["subServer"] = new JsonObject
                {
                    ["type"] = "object",
                    ["properties"] = new JsonObject
                    {
                        ["name"] = new JsonObject { ["type"] = "string" },
                        ["url"] = new JsonObject { ["type"] = "string" },
                        ["oauth"] = new JsonObject
                        {
                            ["type"] = "object",
                            ["properties"] = new JsonObject
                            {
                                ["scope"] = new JsonObject { ["type"] = "string" }
                            }
                        }
                    },
                    ["required"] = new JsonArray("name", "url")
                }
            },
            ["required"] = new JsonArray("subServer"),
            ["additionalProperties"] = false
        };

    private static string ToGatewayToolName(string serverName, string toolName)
        => $"{SanitizeName(serverName)}_{SanitizeName(toolName)}";

    private static string SanitizeName(string value)
    {
        var chars = value
            .Select(ch => char.IsLetterOrDigit(ch) ? char.ToLowerInvariant(ch) : '_')
            .ToArray();

        return string.Join("_", new string(chars).Split('_', StringSplitOptions.RemoveEmptyEntries));
    }

    private static string PrefixDescription(string serverName, string? description)
        => string.IsNullOrWhiteSpace(description)
            ? $"Tool from {serverName} MCP server"
            : $"{serverName}: {description}";

    private static string CreateCorrelationId() => Guid.NewGuid().ToString("N");
}
