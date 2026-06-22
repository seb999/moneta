namespace Moneta.Api.Domain;

public class Invoice
{
    public int Id { get; set; }
    public string Consultant { get; set; } = "";
    public string InvoiceRef { get; set; } = "";
    public int FiscalYear { get; set; }

    /// <summary>"YYYY-MM" billing period the invoice covers.</summary>
    public string Period { get; set; } = "";
    public int? PaymentRefId { get; set; }

    /// <summary>Euro-cents as stated on invoice.</summary>
    public long ClaimedAmountCents { get; set; }
    public DateOnly ReceivedDate { get; set; }
    public string Status { get; set; } = "received"; // received | verified | disputed
    public string? VerifiedBy { get; set; }
    public DateTime? VerifiedAt { get; set; }
    public string? Note { get; set; }

    public PaymentRef? PaymentRef { get; set; }
    public ICollection<InvoiceLine> Lines { get; set; } = [];
    public ICollection<Actual> Actuals { get; set; } = [];
}
