using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Moneta.Api.Services;

/// <summary>One billed line read off the invoice (typically one per developer).</summary>
public record ExtractedInvoiceLine(
    string? Developer,
    decimal? Hours,
    decimal? AmountEur);

/// <summary>Fields an LLM pulls off a consultant invoice PDF to pre-fill the intake form.</summary>
public record ExtractedInvoice(
    string? Consultant,
    string? InvoiceRef,
    string? Period,            // normalised to YYYY-MM
    decimal? ClaimedAmountEur,
    string? Currency,
    string? PaymentRefHint,    // contract / payment-ref string seen on the invoice, to fuzzy-match
    string? Notes,
    List<ExtractedInvoiceLine>? Lines = null);

public interface IInvoiceExtractionService
{
    bool IsConfigured { get; }
    Task<ExtractedInvoice> ExtractAsync(byte[] pdfBytes, CancellationToken ct = default);
}

public class InvoiceExtractionService(IConfiguration config, IHttpClientFactory httpFactory) : IInvoiceExtractionService
{
    readonly string? _apiKey = config["OpenAI:ApiKey"];

    public bool IsConfigured => !string.IsNullOrWhiteSpace(_apiKey);

    // JSON schema for structured output — anyOf null pattern required by OpenAI strict mode.
    static readonly JsonObject Schema = JsonNode.Parse("""
    {
      "type": "object",
      "additionalProperties": false,
      "required": ["consultant", "invoiceRef", "period", "claimedAmountEur", "currency", "paymentRefHint", "notes", "lines"],
      "properties": {
        "consultant":       { "anyOf": [{"type": "string"}, {"type": "null"}], "description": "The supplier / consulting company that issued the invoice (e.g. Tracasa, Altia)." },
        "invoiceRef":       { "anyOf": [{"type": "string"}, {"type": "null"}], "description": "The invoice number / reference printed on the document." },
        "period":           { "anyOf": [{"type": "string"}, {"type": "null"}], "description": "The service month the invoice covers, normalised to YYYY-MM (e.g. 2026-05). Null if not determinable." },
        "claimedAmountEur": { "anyOf": [{"type": "number"}, {"type": "null"}], "description": "The total amount claimed, in euros, as a number (no currency symbol, no thousands separators)." },
        "currency":         { "anyOf": [{"type": "string"}, {"type": "null"}], "description": "ISO currency code of the claimed amount (e.g. EUR)." },
        "paymentRefHint":   { "anyOf": [{"type": "string"}, {"type": "null"}], "description": "Any contract, purchase-order or payment-reference identifier on the invoice (e.g. EEA/DTL/25/015/EEA.61006). Used to match a Moneta payment ref." },
        "notes":            { "anyOf": [{"type": "string"}, {"type": "null"}], "description": "Anything notable for the officer: ambiguity, multiple periods, partial amounts. Null if nothing." },
        "lines": {
          "type": "array",
          "description": "The invoice's detail lines, one object per billed row (typically one per developer/consultant). Empty array if the invoice shows no itemised detail.",
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["developer", "hours", "amountEur"],
            "properties": {
              "developer": { "anyOf": [{"type": "string"}, {"type": "null"}], "description": "The developer / person / line label this row bills for." },
              "hours":     { "anyOf": [{"type": "number"}, {"type": "null"}], "description": "Hours (or days × 8) billed on this line, as a number. Null if not shown." },
              "amountEur": { "anyOf": [{"type": "number"}, {"type": "null"}], "description": "The euro amount of this line, as a number (no symbol, no thousands separators)." }
            }
          }
        }
      }
    }
    """)!.AsObject();

    const string Prompt = """
        You are extracting structured data from a consultant invoice PDF for the European Environment Agency (EEA).
        These are IT consulting invoices — they typically list individual developers/consultants with their hours or days worked and the billed amount per person.
        Return only the requested JSON fields. Rules:

        - consultant: the name of the supplier company that issued the invoice (not the EEA, not an individual person).
        - invoiceRef: the invoice number or reference printed on the document.
        - period: the month the work was performed, as YYYY-MM. If a date range spans one month, use that month. If it spans two months, use the month with the most days in the range.
        - claimedAmountEur: the total amount payable in euros (the bottom-line figure, excluding VAT if the contract is net-based, otherwise gross). Return as a plain number.
        - paymentRefHint: copy verbatim any EEA contract reference, purchase order number or framework reference you see (e.g. "EEA/DTL/25/015/EEA.61006"). This is typically printed near the top of the invoice.
        - lines: THIS IS IMPORTANT — look carefully for any table or list that shows individual people's work. Each row typically has: a person's full name, the number of days or hours they worked, and the amount billed for them. Extract every such row. Convert days to hours by multiplying by 8 if hours are not shown. If you see a summary table with names and amounts but no hours, still capture developer and amountEur with hours as null. Return an empty array ONLY if the invoice truly has no per-person breakdown at all.
        - notes: flag any ambiguity, missing fields, or anything the officer should review. Null if nothing notable.
        - Use null for fields you cannot determine. Do not invent data.
        """;

    public async Task<ExtractedInvoice> ExtractAsync(byte[] pdfBytes, CancellationToken ct = default)
    {
        if (!IsConfigured)
            throw new InvalidOperationException("OpenAI API key is not configured (OpenAI:ApiKey).");

        var baseUrl = (config["OpenAI:BaseUrl"] ?? "https://api.openai.com/v1").TrimEnd('/');
        var model   = config["OpenAI:ExtractionModel"] ?? config["OpenAI:Model"] ?? "gpt-5.4";
        var base64  = Convert.ToBase64String(pdfBytes);

        var payload = new JsonObject
        {
            ["model"] = model,
            ["response_format"] = new JsonObject
            {
                ["type"] = "json_schema",
                ["json_schema"] = new JsonObject
                {
                    ["name"]   = "extracted_invoice",
                    ["strict"] = true,
                    ["schema"] = Schema.DeepClone(),
                },
            },
            ["messages"] = new JsonArray
            {
                new JsonObject
                {
                    ["role"] = "user",
                    ["content"] = new JsonArray
                    {
                        new JsonObject
                        {
                            ["type"] = "file",
                            ["file"] = new JsonObject
                            {
                                ["filename"]  = "invoice.pdf",
                                ["file_data"] = $"data:application/pdf;base64,{base64}",
                            },
                        },
                        new JsonObject
                        {
                            ["type"] = "text",
                            ["text"] = Prompt,
                        },
                    },
                },
            },
        };

        var http = httpFactory.CreateClient();
        http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _apiKey);

        using var res = await http.PostAsync(
            $"{baseUrl}/chat/completions",
            new StringContent(payload.ToJsonString(), Encoding.UTF8, "application/json"),
            ct);

        var body = await res.Content.ReadAsStringAsync(ct);
        if (!res.IsSuccessStatusCode)
            throw new InvalidOperationException($"OpenAI error {(int)res.StatusCode}: {body[..Math.Min(300, body.Length)]}");

        var json = JsonNode.Parse(body)?["choices"]?[0]?["message"]?["content"]?.GetValue<string>();
        if (string.IsNullOrWhiteSpace(json))
            throw new InvalidOperationException("The model returned no content to parse.");

        var doc = JsonSerializer.Deserialize<ExtractedInvoice>(json, new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true,
        });

        return doc ?? new ExtractedInvoice(null, null, null, null, null, null, null);
    }
}
