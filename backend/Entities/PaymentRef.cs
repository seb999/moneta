namespace Moneta.Api.Entities;

/// <summary>
/// Tracks budget (appropriations, commitments, actuals) per Taskman payment_ref_id.
/// The PaymentRefId matches the "Payment Reference ID" custom field on Taskman time entries.
/// </summary>
public class PaymentRef
{
    public int Id { get; set; }
    public int FiscalYear { get; set; }

    /// <summary>Matches Taskman's "Payment Reference ID" custom field, e.g. "es_bilbomatica-Natura2000-EEA/DTL/25/015/EEA.61006".</summary>
    public string PaymentRefId { get; set; } = "";
    public string Description { get; set; } = "";

    public FiscalYear Year { get; set; } = null!;
    public ICollection<Appropriation> Appropriations { get; set; } = [];
    public ICollection<Commitment> Commitments { get; set; } = [];
    public ICollection<Actual> Actuals { get; set; } = [];
    public ICollection<Invoice> Invoices { get; set; } = [];
    public ICollection<TaskmanCost> TaskmanCosts { get; set; } = [];
}
