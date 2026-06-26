namespace Moneta.Api.Entities;

/// <summary>
/// EEA Management-Plan code (three-part, e.g. "1.1.0" / "4.3.9"), per fiscal year.
/// The dimension consultant spend is split into for management reporting.
/// Seeded from the Altia workbook for now; real source is the Management Plan later.
/// </summary>
public class MpsCode
{
    public int Id { get; set; }
    public int FiscalYear { get; set; }

    /// <summary>Three-part code, e.g. "1.1.0".</summary>
    public string Code { get; set; } = "";

    /// <summary>Optional Level-3 label (blank for 2026 until sourced).</summary>
    public string? Label { get; set; }

    /// <summary>Optional parent/rollup code.</summary>
    public string? Rollup { get; set; }
}
