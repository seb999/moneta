using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Moneta.Api.Infrastructure;

namespace Moneta.Api.Controllers;

[ApiController]
[Route("api/chat")]
public class ChatController(
    MonetaDbContext db,
    IHttpClientFactory httpFactory,
    IConfiguration config,
    ILogger<ChatController> log) : ControllerBase
{
    private const string SystemPrompt = """
        You are Moneta's AI assistant. Moneta is the EEA's budget-monitoring app:
        it tracks budget vs actuals (appropriations → committed → spent) per payment reference,
        and computes consultant cost from Taskman time entries.

        You have two kinds of tools:
        - Moneta tools (get_budget_overview, get_work_effort) — for budget figures and work effort
          already stored in Moneta. Prefer these for "how much budget / spent / hours" questions.
        - Taskman/Redmine MCP tools — for live operational data (projects, issues, time entries)
          not yet in Moneta. Use these for drill-down into Taskman.

        Rules:
        - Read-only. Never suggest writes/updates to Taskman.
        - Never invent figures — call a tool, then answer from its result.
        - Keep answers concise; show euro amounts and hours clearly.
        """;

    public record ChatRequest(List<JsonObject> Messages, List<JsonObject>? RawHistory);

    /// <summary>Health check: connect to the Taskman MCP server and list its tools.</summary>
    [HttpGet("mcp-tools")]
    public async Task<IActionResult> McpTools(CancellationToken ct)
    {
        var url = config["TaskmanMcp:Url"];
        if (string.IsNullOrWhiteSpace(url)) return Ok(new { connected = false, reason = "TaskmanMcp:Url not configured" });
        try
        {
            var mcp = await McpSession.ConnectAsync(CreateMcpClient(), url, ct);
            var tools = await mcp.ListToolsAsync(ct);
            return Ok(new { connected = true, url, tools = tools.Select(t => new { t.Name, t.Description }) });
        }
        catch (Exception e) { return Ok(new { connected = false, url, error = e.Message }); }
    }

    [HttpPost]
    public async Task Post([FromBody] ChatRequest req, CancellationToken ct)
    {
        Response.ContentType = "application/x-ndjson";
        Response.Headers["Cache-Control"] = "no-cache";

        async Task Send(object ev)
        {
            var line = JsonSerializer.Serialize(ev) + "\n";
            await Response.Body.WriteAsync(Encoding.UTF8.GetBytes(line), ct);
            await Response.Body.FlushAsync(ct);
        }

        var apiKey = config["OpenAI:ApiKey"];
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            await Send(new { type = "error", message = "OpenAI API key not configured (OpenAI:ApiKey)." });
            await Send(new { type = "done" });
            return;
        }
        var baseUrl = (config["OpenAI:BaseUrl"] ?? "https://api.openai.com/v1").TrimEnd('/');
        var model = config["OpenAI:Model"] ?? "gpt-4o";

        // Connect to the Taskman MCP server (graceful degradation)
        McpSession? mcp = null;
        var mcpTools = new List<McpToolDef>();
        var mcpUrl = config["TaskmanMcp:Url"];
        if (!string.IsNullOrWhiteSpace(mcpUrl))
        {
            try
            {
                mcp = await McpSession.ConnectAsync(CreateMcpClient(), mcpUrl, ct);
                mcpTools = await mcp.ListToolsAsync(ct);
                log.LogInformation("[MCP] connected — {Count} tools", mcpTools.Count);
            }
            catch (Exception e) { log.LogWarning("[MCP] connection failed: {Msg}", e.Message); }
        }

        // Tool catalogue: Moneta built-ins + MCP tools
        var tools = new JsonArray();
        foreach (var t in BuiltinTools()) tools.Add(t);
        var builtinNames = BuiltinTools().Select(t => t["function"]!["name"]!.GetValue<string>()).ToHashSet();
        foreach (var t in mcpTools)
        {
            if (builtinNames.Contains(t.Name)) continue;
            tools.Add(new JsonObject
            {
                ["type"] = "function",
                ["function"] = new JsonObject
                {
                    ["name"] = t.Name,
                    ["description"] = t.Description ?? t.Name,
                    ["parameters"] = t.InputSchema.DeepClone(),
                },
            });
        }

        var http = httpFactory.CreateClient();
        http.DefaultRequestHeaders.Authorization = new("Bearer", apiKey);

        try
        {
            // Build running history
            var history = new JsonArray { new JsonObject { ["role"] = "system", ["content"] = SystemPrompt } };
            if (req.RawHistory is { Count: > 0 })
            {
                foreach (var m in req.RawHistory) history.Add(m.DeepClone());
                history.Add(req.Messages[^1].DeepClone());
            }
            else
            {
                foreach (var m in req.Messages) history.Add(m.DeepClone());
            }

            while (true)
            {
                var payload = new JsonObject
                {
                    ["model"] = model,
                    ["messages"] = history.DeepClone(),
                    ["tools"] = tools.DeepClone(),
                    ["tool_choice"] = "auto",
                };

                using var apiRes = await http.PostAsync($"{baseUrl}/chat/completions",
                    new StringContent(payload.ToJsonString(), Encoding.UTF8, "application/json"), ct);
                var bodyText = await apiRes.Content.ReadAsStringAsync(ct);
                if (!apiRes.IsSuccessStatusCode)
                {
                    await Send(new { type = "error", message = $"LLM error {(int)apiRes.StatusCode}: {Truncate(bodyText, 300)}" });
                    break;
                }

                var msg = JsonNode.Parse(bodyText)?["choices"]?[0]?["message"]?.AsObject();
                if (msg is null) { await Send(new { type = "error", message = "Empty LLM response." }); break; }

                history.Add(msg.DeepClone());
                var toolCalls = msg["tool_calls"]?.AsArray();

                if (toolCalls is null || toolCalls.Count == 0)
                {
                    await Send(new { type = "content", text = msg["content"]?.GetValue<string>() ?? "" });
                    // Strip the system prompt before returning history to the client
                    var clientHistory = new JsonArray();
                    foreach (var h in history.Skip(1)) clientHistory.Add(h!.DeepClone());
                    await Send(new { type = "history", messages = clientHistory });
                    break;
                }

                foreach (var tc in toolCalls)
                {
                    var fnName = tc?["function"]?["name"]?.GetValue<string>() ?? "";
                    var argStr = tc?["function"]?["arguments"]?.GetValue<string>() ?? "{}";
                    JsonNode args; try { args = JsonNode.Parse(argStr) ?? new JsonObject(); } catch { args = new JsonObject(); }

                    await Send(new { type = "tool_call", label = LabelFor(fnName, args) });

                    string resultJson;
                    try
                    {
                        if (builtinNames.Contains(fnName))
                            resultJson = await RunBuiltin(fnName, args.AsObject(), ct);
                        else if (mcp is not null)
                            resultJson = await mcp.CallToolAsync(fnName, args, ct);
                        else
                            resultJson = $"{{\"error\":\"Tool '{fnName}' unavailable (MCP not connected)\"}}";
                    }
                    catch (Exception e) { resultJson = $"{{\"error\":{JsonSerializer.Serialize(e.Message)}}}"; }

                    history.Add(new JsonObject
                    {
                        ["role"] = "tool",
                        ["tool_call_id"] = tc?["id"]?.GetValue<string>(),
                        ["content"] = resultJson,
                    });
                }
            }
        }
        catch (Exception e)
        {
            await Send(new { type = "error", message = e.Message });
        }

        await Send(new { type = "done" });
    }

    /// <summary>
    /// MCP HttpClient with bearer auth. Uses the per-user key from the
    /// X-Taskman-Key header when present; otherwise falls back to the configured key.
    /// </summary>
    private HttpClient CreateMcpClient()
    {
        var client = httpFactory.CreateClient("mcp");
        var userKey = Request.Headers["X-Taskman-Key"].FirstOrDefault();
        var token = !string.IsNullOrWhiteSpace(userKey)
            ? userKey
            : config["TaskmanMcp:ApiKey"] ?? config["Taskman:ApiKey"];
        if (!string.IsNullOrWhiteSpace(token))
            client.DefaultRequestHeaders.Authorization = new("Bearer", token);
        return client;
    }

    private static string LabelFor(string fn, JsonNode args) => fn switch
    {
        "get_budget_overview" => "Reading budget overview…",
        "get_work_effort"     => "Computing work effort…",
        _ => $"{fn.Replace('_', ' ')}…",
    };

    // ── Built-in Moneta tools ─────────────────────────────────────────────

    private static List<JsonObject> BuiltinTools() =>
    [
        new JsonObject
        {
            ["type"] = "function",
            ["function"] = new JsonObject
            {
                ["name"] = "get_budget_overview",
                ["description"] = "Budget vs actuals per payment ref for a fiscal year: CA/PA budget, committed, spent, available.",
                ["parameters"] = new JsonObject
                {
                    ["type"] = "object",
                    ["properties"] = new JsonObject { ["year"] = new JsonObject { ["type"] = "integer", ["description"] = "Fiscal year, e.g. 2026" } },
                    ["required"] = new JsonArray { "year" },
                },
            },
        },
        new JsonObject
        {
            ["type"] = "function",
            ["function"] = new JsonObject
            {
                ["name"] = "get_work_effort",
                ["description"] = "Monthly hours and computed cost per developer for a payment ref code (Taskman cost data ingested into Moneta).",
                ["parameters"] = new JsonObject
                {
                    ["type"] = "object",
                    ["properties"] = new JsonObject
                    {
                        ["year"] = new JsonObject { ["type"] = "integer" },
                        ["paymentRefCode"] = new JsonObject { ["type"] = "string", ["description"] = "The payment_ref_id string, e.g. es_bilbomatica-Natura2000-..." },
                    },
                    ["required"] = new JsonArray { "year", "paymentRefCode" },
                },
            },
        },
    ];

    private async Task<string> RunBuiltin(string name, JsonObject args, CancellationToken ct)
    {
        if (name == "get_budget_overview")
        {
            int year = args["year"]?.GetValue<int>() ?? DateTime.Today.Year;
            var refs = await db.PaymentRefs.Where(p => p.FiscalYear == year).ToListAsync(ct);
            var rows = new List<object>();
            foreach (var p in refs)
            {
                long ca = await db.Appropriations.Where(a => a.PaymentRefId == p.Id).SumAsync(a => (long?)a.CaAmountCents, ct) ?? 0;
                long pa = await db.Appropriations.Where(a => a.PaymentRefId == p.Id).SumAsync(a => (long?)a.PaAmountCents, ct) ?? 0;
                long com = await db.Commitments.Where(c => c.PaymentRefId == p.Id && c.Status != "cancelled").SumAsync(c => (long?)c.AmountCents, ct) ?? 0;
                long sp = await db.Actuals.Where(a => a.PaymentRefId == p.Id).SumAsync(a => (long?)a.AmountCents, ct) ?? 0;
                rows.Add(new
                {
                    paymentRef = p.PaymentRefId, p.Description,
                    caEur = ca / 100m, paEur = pa / 100m,
                    committedEur = com / 100m, spentEur = sp / 100m,
                    availableToPayEur = (pa - sp) / 100m,
                });
            }
            return JsonSerializer.Serialize(new { year, paymentRefs = rows });
        }

        if (name == "get_work_effort")
        {
            int year = args["year"]?.GetValue<int>() ?? DateTime.Today.Year;
            string code = args["paymentRefCode"]?.GetValue<string>() ?? "";
            var pref = await db.PaymentRefs.FirstOrDefaultAsync(p => p.FiscalYear == year && p.PaymentRefId == code, ct);
            if (pref is null) return JsonSerializer.Serialize(new { error = $"No payment ref '{code}' in {year}." });

            var rows = await db.TaskmanCosts
                .Where(t => t.PaymentRefId == pref.Id)
                .GroupBy(t => new { t.Developer, t.Period })
                .Select(g => new { g.Key.Developer, g.Key.Period, Hours = g.Sum(x => x.Hours), Cents = g.Sum(x => x.ComputedAmountCents) })
                .ToListAsync(ct);

            return JsonSerializer.Serialize(new
            {
                year, paymentRef = code,
                entries = rows.Select(r => new { r.Developer, r.Period, hours = r.Hours, costEur = r.Cents / 100m }),
                totalHours = rows.Sum(r => r.Hours),
                totalCostEur = rows.Sum(r => r.Cents) / 100m,
            });
        }

        return "{\"error\":\"unknown tool\"}";
    }

    private static string Truncate(string s, int n) => s.Length <= n ? s : s[..n];
}
