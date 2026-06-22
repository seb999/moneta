namespace Moneta.Api.Domain;

public class Contractor
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string Company { get; set; } = "";

    /// <summary>Rate-card profile, e.g. "P1" / "P2" / "P3". Resolves to a RateCard via (Company, Profile).</summary>
    public string? Profile { get; set; }

    /// <summary>Links to Redmine/Taskman user.id for rate lookup during ingestion.</summary>
    public int? TaskmanUserId { get; set; }
}
