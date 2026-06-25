namespace Moneta.Api.Domain;

/// <summary>
/// COMPUTED cost reference derived from Taskman time entries — NOT booked spend.
/// Used only for invoice verification. Never flows into "spent" totals.
/// Amounts in euro-cents.
/// </summary>
public class TaskmanCost
{
    public int Id { get; set; }
    public int FiscalYear { get; set; }

    /// <summary>"YYYY-MM" billing period.</summary>
    public string Period { get; set; } = "";
    public string TaskmanProject { get; set; } = "";
    public string TaskmanCategory { get; set; } = "";
    public string Developer { get; set; } = "";

    /// <summary>Redmine/Taskman user.id of the developer — links to Contractor for discovery.</summary>
    public int? TaskmanUserId { get; set; }

    /// <summary>Hours as logged in Taskman.</summary>
    public decimal Hours { get; set; }

    /// <summary>Euro-cents: hours / 8 × daily_rate (exact, no rounding).</summary>
    public long ComputedAmountCents { get; set; }

    public int? PaymentRefId { get; set; }
    public string? Consultant { get; set; }

    /// <summary>Resolved MPS code via (Project, Category) mapping. Null if unmapped/excluded.</summary>
    public string? MpsCode { get; set; }

    /// <summary>MPS attribution: mapped | assumed_default | excluded | unmapped.</summary>
    public string MpsStatus { get; set; } = "unmapped";

    /// <summary>mapped | unmapped | excluded</summary>
    public string AttributionStatus { get; set; } = "unmapped";
    public string? ExternalRef { get; set; }

    public PaymentRef? PaymentRef { get; set; }
}
