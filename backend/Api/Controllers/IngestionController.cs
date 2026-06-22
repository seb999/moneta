using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Moneta.Api.Application;
using Moneta.Api.Dtos;
using Moneta.Api.Infrastructure;

namespace Moneta.Api.Controllers;

[ApiController]
[Route("api/ingestion")]
public class IngestionController(ICostIngestionService ingestion, MonetaDbContext db) : ControllerBase
{
    [HttpPost("ingest")]
    public async Task<ActionResult<IngestSummaryDto>> Ingest(IngestRequest req, CancellationToken ct)
    {
        try
        {
            var result = await ingestion.IngestMonthAsync(req.FiscalYear, req.Period, req.ProjectId, req.PaymentRefId, ct);
            return Ok(result);
        }
        catch (ArgumentException ex) { return BadRequest(ex.Message); }
        catch (HttpRequestException ex) { return StatusCode(502, $"Taskman API error: {ex.Message}"); }
    }

    [HttpGet("projects")]
    public async Task<ActionResult<List<RedmineProject>>> GetProjects(
        [FromServices] IRedmineClient redmine, CancellationToken ct)
    {
        try { return Ok(await redmine.GetProjectsAsync(ct)); }
        catch (HttpRequestException ex) { return StatusCode(502, $"Taskman API error: {ex.Message}"); }
    }

    /// <summary>Locally-synced Taskman projects (for ingestion dropdown).</summary>
    [HttpGet("synced-projects")]
    public async Task<IEnumerable<SyncedProjectDto>> SyncedProjects(CancellationToken ct) =>
        await db.TaskmanProjects
            .OrderBy(p => p.Name)
            .Select(p => new SyncedProjectDto(p.ProjectId, p.Name))
            .ToListAsync(ct);

    [HttpPost("sync-projects")]
    public async Task<ActionResult<int>> SyncProjects(
        [FromServices] IRedmineClient redmine, CancellationToken ct)
    {
        try
        {
            var projects = await redmine.GetProjectsAsync(ct);
            foreach (var p in projects)
            {
                var existing = await db.TaskmanProjects.FindAsync([p.Id], ct);
                if (existing is null)
                    db.TaskmanProjects.Add(new Domain.TaskmanProject { ProjectId = p.Id, Name = p.Name, LastSynced = DateTime.UtcNow });
                else { existing.Name = p.Name; existing.LastSynced = DateTime.UtcNow; }
            }
            await db.SaveChangesAsync(ct);
            return Ok(projects.Count);
        }
        catch (HttpRequestException ex) { return StatusCode(502, $"Taskman API error: {ex.Message}"); }
    }

    [HttpGet("taskman-costs")]
    public async Task<IEnumerable<TaskmanCostDto>> GetTaskmanCosts(
        [FromQuery] int? year, [FromQuery] string? period, [FromQuery] int? paymentRefId)
    {
        var q = db.TaskmanCosts.Include(t => t.PaymentRef).AsQueryable();
        if (year.HasValue)         q = q.Where(t => t.FiscalYear == year.Value);
        if (period is not null)    q = q.Where(t => t.Period == period);
        if (paymentRefId.HasValue) q = q.Where(t => t.PaymentRefId == paymentRefId.Value);

        return await q
            .OrderBy(t => t.Period).ThenBy(t => t.TaskmanProject).ThenBy(t => t.Developer)
            .Select(t => new TaskmanCostDto(
                t.Id, t.FiscalYear, t.Period,
                t.TaskmanProject, t.TaskmanCategory, t.Developer,
                t.Hours, t.ComputedAmountCents / 100m,
                t.PaymentRefId,
                t.PaymentRef != null ? t.PaymentRef.PaymentRefId : null,
                t.Consultant, t.AttributionStatus, t.ExternalRef))
            .ToListAsync();
    }
}
