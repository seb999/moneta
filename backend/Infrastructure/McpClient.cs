using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Moneta.Api.Infrastructure;

/// <summary>
/// Minimal MCP client (JSON-RPC over Streamable HTTP, 2025-03-26).
/// Ported from discodata-ng's mcp-client.ts. Connects to a remote MCP server,
/// lists tools, and calls them. Degrades gracefully when unavailable.
/// </summary>
public sealed class McpToolDef
{
    public string Name { get; set; } = "";
    public string? Description { get; set; }
    public JsonObject InputSchema { get; set; } = new() { ["type"] = "object" };
}

public sealed class McpSession(HttpClient http, string postUrl)
{
    private int _counter = 1;
    private string? _sessionId;

    public static async Task<McpSession> ConnectAsync(HttpClient http, string baseUrl, CancellationToken ct = default)
    {
        // Use the configured endpoint exactly (e.g. https://host/mcp)
        var session = new McpSession(http, baseUrl);
        await session.RpcAsync("initialize", new JsonObject
        {
            ["protocolVersion"] = "2024-11-05",
            ["capabilities"] = new JsonObject(),
            ["clientInfo"] = new JsonObject { ["name"] = "moneta", ["version"] = "1.0" },
        }, ct);
        await session.NotifyAsync("notifications/initialized", ct);
        return session;
    }

    private async Task<JsonNode?> RpcAsync(string method, JsonNode? prms, CancellationToken ct)
    {
        var id = _counter++;
        var body = new JsonObject { ["jsonrpc"] = "2.0", ["id"] = id, ["method"] = method };
        if (prms is not null) body["params"] = prms;

        using var req = new HttpRequestMessage(HttpMethod.Post, postUrl)
        {
            Content = new StringContent(body.ToJsonString(), Encoding.UTF8, "application/json"),
        };
        req.Headers.TryAddWithoutValidation("Accept", "application/json, text/event-stream");
        if (_sessionId is not null) req.Headers.TryAddWithoutValidation("Mcp-Session-Id", _sessionId);

        using var res = await http.SendAsync(req, ct);

        // Capture the session id handed back on initialize
        if (res.Headers.TryGetValues("Mcp-Session-Id", out var sid))
            _sessionId = sid.FirstOrDefault();

        if ((int)res.StatusCode == 202) return null;
        var text = await res.Content.ReadAsStringAsync(ct);
        if (string.IsNullOrWhiteSpace(text)) return null;

        // The server answers as an SSE event ("data: {...}") or plain JSON
        var json = ExtractJson(text);
        var node = JsonNode.Parse(json);
        if (node?["error"] is JsonNode err)
            throw new InvalidOperationException($"MCP {method}: {err["message"]?.GetValue<string>()}");
        return node?["result"];
    }

    private async Task NotifyAsync(string method, CancellationToken ct)
    {
        var body = new JsonObject { ["jsonrpc"] = "2.0", ["method"] = method };
        using var req = new HttpRequestMessage(HttpMethod.Post, postUrl)
        {
            Content = new StringContent(body.ToJsonString(), Encoding.UTF8, "application/json"),
        };
        req.Headers.TryAddWithoutValidation("Accept", "application/json, text/event-stream");
        if (_sessionId is not null) req.Headers.TryAddWithoutValidation("Mcp-Session-Id", _sessionId);
        try { await http.SendAsync(req, ct); } catch { /* fire and forget */ }
    }

    public async Task<List<McpToolDef>> ListToolsAsync(CancellationToken ct = default)
    {
        var result = await RpcAsync("tools/list", null, ct);
        var tools = result?["tools"]?.AsArray();
        if (tools is null) return [];
        var list = new List<McpToolDef>();
        foreach (var t in tools)
        {
            if (t is null) continue;
            list.Add(new McpToolDef
            {
                Name = t["name"]?.GetValue<string>() ?? "",
                Description = t["description"]?.GetValue<string>(),
                InputSchema = t["inputSchema"]?.AsObject() ?? new JsonObject { ["type"] = "object" },
            });
        }
        return list;
    }

    public async Task<string> CallToolAsync(string name, JsonNode args, CancellationToken ct = default)
    {
        var result = await RpcAsync("tools/call", new JsonObject { ["name"] = name, ["arguments"] = args }, ct);
        var content = result?["content"]?.AsArray();
        if (content is null) return result?.ToJsonString() ?? "null";
        var sb = new StringBuilder();
        foreach (var c in content)
            if (c?["type"]?.GetValue<string>() == "text")
                sb.Append(c["text"]?.GetValue<string>());
        return sb.ToString();
    }

    private static string ExtractJson(string text)
    {
        // Strip SSE "data:" prefixes if present
        if (text.Contains("data:"))
        {
            foreach (var line in text.Split('\n'))
            {
                var t = line.Trim();
                if (t.StartsWith("data:"))
                {
                    var d = t[5..].Trim();
                    if (d.StartsWith('{') || d.StartsWith('[')) return d;
                }
            }
        }
        return text;
    }
}
