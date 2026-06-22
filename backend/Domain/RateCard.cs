namespace Moneta.Api.Domain;

/// <summary>
/// Daily-rate card for an EU framework contract: one rate per (company, profile).
/// Developers inherit their rate via their Contractor.Company + Contractor.Profile.
/// Rates in euro-cents per day.
/// </summary>
public class RateCard
{
    public int Id { get; set; }
    public string Company { get; set; } = "";

    /// <summary>Profile code, e.g. "P1" / "P2" / "P3".</summary>
    public string Profile { get; set; } = "";

    /// <summary>Euro-cents per day for extra-muros work.</summary>
    public long DailyRateCents { get; set; }

    /// <summary>Euro-cents per day for intra-muros work. Null = use DailyRateCents.</summary>
    public long? IntraMurosRateCents { get; set; }
}
