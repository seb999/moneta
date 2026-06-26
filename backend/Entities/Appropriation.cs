namespace Moneta.Api.Entities;

public class Appropriation
{
    public int Id { get; set; }
    public int PaymentRefId { get; set; }
    public int FiscalYear { get; set; }

    /// <summary>Euro-cents.</summary>
    public long CaAmountCents { get; set; }

    /// <summary>Euro-cents.</summary>
    public long PaAmountCents { get; set; }

    /// <summary>C1 / C4 / C5 / C8 — default C1.</summary>
    public string CreditOrigin { get; set; } = "C1";
    public string Source { get; set; } = "manual";
    public DateOnly EffectiveDate { get; set; }
    public string? Note { get; set; }

    public PaymentRef PaymentRef { get; set; } = null!;
}
