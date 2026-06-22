namespace Moneta.Api.Domain;

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

    public PaymentRef PaymentRef { get; set; } = null!;
    public ICollection<Actual> Actuals { get; set; } = [];
}
