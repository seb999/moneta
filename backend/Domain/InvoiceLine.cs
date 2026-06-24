namespace Moneta.Api.Domain;

/// <summary>
/// One slice of a verified invoice, attributed to an MPS code.
/// The invoice's claimed amount is split across MPS codes proportional to the
/// hours each MPS attracted in the billed period.
/// </summary>
public class InvoiceLine
{
    public int Id { get; set; }
    public int InvoiceId { get; set; }

    /// <summary>The MPS code this slice goes to.</summary>
    public string? MpsCode { get; set; }

    /// <summary>Hours attributed to this MPS for the period.</summary>
    public decimal Hours { get; set; }

    /// <summary>Euro-cents — claimed_amount × (hours / total mapped hours).</summary>
    public long AmountCents { get; set; }

    public Invoice Invoice { get; set; } = null!;
}
