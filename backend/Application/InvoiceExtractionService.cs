using System.Text.Json;
using Anthropic;
using Anthropic.Models.Messages;

namespace Moneta.Api.Application;

/// <summary>Fields an LLM pulls off a consultant invoice PDF to pre-fill the intake form.</summary>
public record ExtractedInvoice(
    string? Consultant,
    string? InvoiceRef,
    string? Period,            // normalised to YYYY-MM
    decimal? ClaimedAmountEur,
    string? Currency,
    string? PaymentRefHint,    // contract / payment-ref string seen on the invoice, to fuzzy-match
    string? Notes);

public interface IInvoiceExtractionService
{
    bool IsConfigured { get; }
    Task<ExtractedInvoice> ExtractAsync(byte[] pdfBytes, CancellationToken ct = default);
}

public class InvoiceExtractionService(IConfiguration config) : IInvoiceExtractionService
{
    readonly string? _apiKey = config["Anthropic:ApiKey"]
        ?? Environment.GetEnvironmentVariable("ANTHROPIC_API_KEY");

    public bool IsConfigured => !string.IsNullOrWhiteSpace(_apiKey);

    // Strict JSON shape Claude must return. Nullable so the officer fills any gaps.
    const string Schema = """
    {
      "type": "object",
      "additionalProperties": false,
      "required": ["consultant", "invoiceRef", "period", "claimedAmountEur", "currency", "paymentRefHint", "notes"],
      "properties": {
        "consultant":       { "type": ["string", "null"], "description": "The supplier / consulting company that issued the invoice (e.g. Tracasa, Altia)." },
        "invoiceRef":       { "type": ["string", "null"], "description": "The invoice number / reference printed on the document." },
        "period":           { "type": ["string", "null"], "description": "The service month the invoice covers, normalised to YYYY-MM (e.g. 2026-05). Null if not determinable." },
        "claimedAmountEur": { "type": ["number", "null"], "description": "The total amount claimed, in euros, as a number (no currency symbol, no thousands separators)." },
        "currency":         { "type": ["string", "null"], "description": "ISO currency code of the claimed amount (e.g. EUR)." },
        "paymentRefHint":   { "type": ["string", "null"], "description": "Any contract, purchase-order or payment-reference identifier on the invoice (e.g. EEA/DTL/25/015/EEA.61006). Used to match a Moneta payment ref." },
        "notes":            { "type": ["string", "null"], "description": "Anything notable for the officer: ambiguity, multiple periods, partial amounts. Null if nothing." }
      }
    }
    """;

    public async Task<ExtractedInvoice> ExtractAsync(byte[] pdfBytes, CancellationToken ct = default)
    {
        if (!IsConfigured)
            throw new InvalidOperationException("Anthropic API key is not configured (Anthropic:ApiKey).");

        var client = new AnthropicClient { ApiKey = _apiKey };
        var base64 = Convert.ToBase64String(pdfBytes);

        var prompt = """
        You are extracting structured data from a consultant invoice (PDF) for the European Environment Agency.
        Read the document and return only the requested fields. Rules:
        - period: the month the work was performed/billed, as YYYY-MM. If a date range, use the month that the bulk of the work falls in.
        - claimedAmountEur: the headline total payable in euros. If VAT is shown, use the gross total payable unless a clearly-labelled net total is the contractual amount.
        - paymentRefHint: copy any contract / framework / payment-reference string verbatim.
        - Use null for any field you cannot determine with confidence. Do not guess.
        """;

        var response = await client.Messages.Create(new MessageCreateParams
        {
            Model = Model.ClaudeOpus4_8,
            MaxTokens = 1024,
            OutputConfig = new OutputConfig
            {
                Format = new JsonOutputFormat
                {
                    Schema = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(Schema)!,
                },
            },
            Messages =
            [
                new MessageParam
                {
                    Role = Role.User,
                    Content = new List<ContentBlockParam>
                    {
                        new DocumentBlockParam { Source = new Base64PdfSource { Data = base64 } },
                        new TextBlockParam { Text = prompt },
                    },
                },
            ],
        }, cancellationToken: ct);

        var json = response.Content
            .Select(b => b.Value)
            .OfType<TextBlock>()
            .Select(t => t.Text)
            .FirstOrDefault();

        if (string.IsNullOrWhiteSpace(json))
            throw new InvalidOperationException("The model returned no content to parse.");

        var doc = JsonSerializer.Deserialize<ExtractedInvoice>(json, new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true,
        });

        return doc ?? new ExtractedInvoice(null, null, null, null, null, null, null);
    }
}
