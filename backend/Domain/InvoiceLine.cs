namespace Moneta.Api.Domain;

public class InvoiceLine
{
    public int Id { get; set; }
    public int InvoiceId { get; set; }
    public int? PaymentRefId { get; set; }
    public string? Description { get; set; }

    /// <summary>Euro-cents.</summary>
    public long ClaimedAmountCents { get; set; }

    public Invoice Invoice { get; set; } = null!;
    public PaymentRef? PaymentRef { get; set; }
}
