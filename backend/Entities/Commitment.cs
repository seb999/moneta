namespace Moneta.Api.Entities;

public class Commitment
{
    public int Id { get; set; }
    public int PaymentRefId { get; set; }
    public int FiscalYear { get; set; }
    public string Reference { get; set; } = "";

    /// <summary>Euro-cents.</summary>
    public long AmountCents { get; set; }
    public DateOnly Date { get; set; }
    public string? Counterparty { get; set; }
    public string Status { get; set; } = "active"; // active | cancelled | closed

    /// <summary>Contract type: TM (time &amp; means) | FP (fixed price) | QTM (quoted time &amp; materials).</summary>
    public string ContractType { get; set; } = "TM";

    public PaymentRef PaymentRef { get; set; } = null!;
    public ICollection<Actual> Actuals { get; set; } = [];
}
