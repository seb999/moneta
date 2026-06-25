namespace Moneta.Api.Domain;

/// <summary>
/// A line as billed on the consultant's invoice (one per developer/row), captured by the
/// LLM extractor. Compared against the exact Taskman computation during verification to
/// surface per-developer over/under-charge (e.g. the consultant's day-rounding).
/// </summary>
public class InvoiceClaimLine
{
    public int Id { get; set; }
    public int InvoiceId { get; set; }

    /// <summary>Developer / line label as printed on the invoice.</summary>
    public string Developer { get; set; } = "";

    /// <summary>Hours billed on this line, if shown on the invoice.</summary>
    public decimal? Hours { get; set; }

    /// <summary>Euro-cents claimed on this line.</summary>
    public long AmountCents { get; set; }

    public Invoice Invoice { get; set; } = null!;
}
