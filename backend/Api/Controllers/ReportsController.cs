using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Moneta.Api.Application;
using Moneta.Api.Infrastructure;

namespace Moneta.Api.Controllers;

public record MonthlySummaryRow(string Developer, string Period, decimal Hours, decimal ComputedAmountEur);

[ApiController]
[Route("api/reports")]
public class ReportsController(MonetaDbContext db, ICostIngestionService ingestion) : ControllerBase
{
    /// <summary>
    /// Returns hours + cost grouped by (developer, period) for the last N months.
    /// Filter by paymentRefId (DB id) OR taskmanProject name — one required.
    /// </summary>
    [HttpGet("monthly-summary")]
    public async Task<ActionResult<List<MonthlySummaryRow>>> MonthlySummary(
        [FromQuery] int fiscalYear,
        [FromQuery] int? paymentRefId,
        [FromQuery] string? taskmanProject,
        [FromQuery] int months = 12,
        CancellationToken ct = default)
    {
        if (paymentRefId is null && taskmanProject is null)
            return BadRequest("Provide paymentRefId or taskmanProject.");

        var q = db.TaskmanCosts
            .Where(t => t.FiscalYear == fiscalYear)
            .AsQueryable();

        if (paymentRefId.HasValue)
            q = q.Where(t => t.PaymentRefId == paymentRefId.Value);
        else
            q = q.Where(t => t.TaskmanProject == taskmanProject);

        var rows = await q
            .GroupBy(t => new { t.Developer, t.Period })
            .Select(g => new MonthlySummaryRow(
                g.Key.Developer,
                g.Key.Period,
                g.Sum(t => t.Hours),
                g.Sum(t => t.ComputedAmountCents) / 100m))
            .ToListAsync(ct);

        return Ok(rows);
    }

    /// <summary>
    /// Ingest all missing months of the fiscal year for all projects.
    /// Returns list of periods ingested.
    /// </summary>
    [HttpPost("ingest-year")]
    public async Task<ActionResult<List<string>>> IngestYear(
        [FromQuery] int fiscalYear,
        CancellationToken ct)
    {
        // Build list of YYYY-MM periods for the fiscal year up to current month
        var today = DateOnly.FromDateTime(DateTime.Today);
        var periods = Enumerable.Range(1, 12)
            .Select(m => new DateOnly(fiscalYear, m, 1))
            .Where(d => d <= today)
            .Select(d => $"{d.Year:0000}-{d.Month:00}")
            .ToList();

        // Find which periods already have data
        var existing = await db.TaskmanCosts
            .Where(t => t.FiscalYear == fiscalYear)
            .Select(t => t.Period)
            .Distinct()
            .ToListAsync(ct);
        var existingSet = existing.ToHashSet();

        var ingested = new List<string>();
        foreach (var period in periods.Where(p => !existingSet.Contains(p)))
        {
            try
            {
                await ingestion.IngestMonthAsync(fiscalYear, period, null, null, ct);
                ingested.Add(period);
            }
            catch { /* skip failed periods */ }
        }
        return Ok(ingested);
    }

    /// <summary>Distinct taskman project names that have cost data for the fiscal year.</summary>
    [HttpGet("taskman-projects")]
    public async Task<List<string>> TaskmanProjects([FromQuery] int fiscalYear, CancellationToken ct) =>
        await db.TaskmanCosts
            .Where(t => t.FiscalYear == fiscalYear && t.TaskmanProject != "")
            .Select(t => t.TaskmanProject)
            .Distinct()
            .OrderBy(p => p)
            .ToListAsync(ct);
}
