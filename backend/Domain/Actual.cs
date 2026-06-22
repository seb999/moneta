namespace Moneta.Api.Domain;

public class Actual
{
    public int Id { get; set; }
    public int PaymentRefId { get; set; }
    public int FiscalYear { get; set; }

    /// <summary>"YYYY-MM" billing period.</summary>
    public string Period { get; set; } = "";
    public int? CommitmentId { get; set; }
    public int? InvoiceId { get; set; }

    /// <summary>Euro-cents.</summary>
    public long AmountCents { get; set; }
    public DateOnly Date { get; set; }
    public string? Description { get; set; }
    public string? Consultant { get; set; }
    public string Source { get; set; } = "manual"; // invoice | manual | import

    public PaymentRef PaymentRef { get; set; } = null!;
    public Commitment? Commitment { get; set; }
    public Invoice? Invoice { get; set; }
}
