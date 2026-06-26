namespace Moneta.Api.Entities;

/// <summary>
/// Maps a Taskman (Project, Category) pair to an MPS code, per fiscal year.
/// Drives automatic attribution of a time entry's hours to an MPS code when the
/// Category is filled. Seeded from the "Codes to MPS" tab of the Altia workbook.
/// </summary>
public class CategoryMpsMap
{
    public int Id { get; set; }
    public int FiscalYear { get; set; }

    public string TaskmanProject { get; set; } = "";

    /// <summary>Issue category; may be blank.</summary>
    public string TaskmanCategory { get; set; } = "";

    /// <summary>Target MPS code, e.g. "1.1.0". NULL when excluded.</summary>
    public string? MpsCode { get; set; }

    /// <summary>TRUE for 'x'/'X' rows — excluded from MPS attribution.</summary>
    public bool Excluded { get; set; }

    /// <summary>Free-text exception note (e.g. "Tracasa - use 6.4.2").</summary>
    public string? Note { get; set; }
}
