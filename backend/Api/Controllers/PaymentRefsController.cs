using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Moneta.Api.Domain;
using Moneta.Api.Dtos;
using Moneta.Api.Infrastructure;

namespace Moneta.Api.Controllers;

[ApiController]
[Route("api/payment-refs")]
public class PaymentRefsController(MonetaDbContext db, IRedmineClient redmine) : ControllerBase
{
    /// <summary>
    /// Scans time entries for a specific Taskman project and fiscal year,
    /// collects distinct Payment Reference ID values, and auto-creates any missing ones.
    /// </summary>
    [HttpPost("sync-from-taskman")]
    public async Task<ActionResult<SyncPaymentRefsResult>> SyncFromTaskman(
        [FromQuery] int year, [FromQuery] int projectId, CancellationToken ct)
    {
        if (!await db.FiscalYears.AnyAsync(y => y.Year == year, ct))
            return BadRequest($"Fiscal year {year} does not exist.");

        var from = new DateOnly(year, 1, 1);
        var to   = new DateOnly(year, 12, 31);

        List<RedmineTimeEntry> entries;
        try { entries = await redmine.GetTimeEntriesAsync(projectId, from, to, ct); }
        catch (HttpRequestException ex) { return StatusCode(502, $"Taskman API error: {ex.Message}"); }

        var taskmanRefs = entries
            .Select(e => e.PaymentRefId)
            .Where(r => !string.IsNullOrWhiteSpace(r) && !r.Equals("x", StringComparison.OrdinalIgnoreCase))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Order()
            .ToList();

        var existing = await db.PaymentRefs
            .Where(p => p.FiscalYear == year)
            .Select(p => p.PaymentRefId)
            .ToListAsync(ct);
        var existingSet = existing.ToHashSet(StringComparer.OrdinalIgnoreCase);

        var created = new List<string>();
        foreach (var refId in taskmanRefs)
        {
            if (existingSet.Contains(refId)) continue;
            db.PaymentRefs.Add(new PaymentRef { FiscalYear = year, PaymentRefId = refId, Description = "" });
            created.Add(refId);
        }
        if (created.Count > 0) await db.SaveChangesAsync(ct);

        return Ok(new SyncPaymentRefsResult(taskmanRefs.Count, created.Count, created));
    }


    [HttpGet]
    public async Task<IEnumerable<PaymentRefDto>> GetAll([FromQuery] int? year)
    {
        var q = db.PaymentRefs.AsQueryable();
        if (year.HasValue) q = q.Where(p => p.FiscalYear == year.Value);
        return await q
            .OrderBy(p => p.FiscalYear)
            .ThenBy(p => p.PaymentRefId)
            .Select(p => new PaymentRefDto(p.Id, p.FiscalYear, p.PaymentRefId, p.Description))
            .ToListAsync();
    }

    [HttpGet("summary")]
    public async Task<IEnumerable<PaymentRefSummaryDto>> GetSummary([FromQuery] int year)
    {
        var refs = await db.PaymentRefs
            .Where(p => p.FiscalYear == year)
            .OrderBy(p => p.PaymentRefId)
            .ToListAsync();

        var ids = refs.Select(p => p.Id).ToList();

        var appropriations = await db.Appropriations
            .Where(a => a.FiscalYear == year && ids.Contains(a.PaymentRefId))
            .GroupBy(a => a.PaymentRefId)
            .Select(g => new { Id = g.Key, CaCents = g.Sum(a => a.CaAmountCents), PaCents = g.Sum(a => a.PaAmountCents) })
            .ToListAsync();

        var commitments = await db.Commitments
            .Where(c => c.FiscalYear == year && ids.Contains(c.PaymentRefId) && c.Status != "cancelled")
            .GroupBy(c => c.PaymentRefId)
            .Select(g => new { Id = g.Key, Cents = g.Sum(c => c.AmountCents) })
            .ToListAsync();

        var actuals = await db.Actuals
            .Where(a => a.FiscalYear == year && ids.Contains(a.PaymentRefId))
            .GroupBy(a => a.PaymentRefId)
            .Select(g => new { Id = g.Key, Cents = g.Sum(a => a.AmountCents) })
            .ToListAsync();

        var appMap = appropriations.ToDictionary(a => a.Id);
        var comMap = commitments.ToDictionary(c => c.Id);
        var actMap = actuals.ToDictionary(a => a.Id);

        return refs.Select(p =>
        {
            var ca        = appMap.TryGetValue(p.Id, out var app)  ? app.CaCents  : 0L;
            var pa        = appMap.TryGetValue(p.Id, out var app2) ? app2.PaCents : 0L;
            var committed = comMap.TryGetValue(p.Id, out var com)  ? com.Cents    : 0L;
            var spent     = actMap.TryGetValue(p.Id, out var act)  ? act.Cents    : 0L;

            return new PaymentRefSummaryDto(
                p.Id, p.FiscalYear, p.PaymentRefId, p.Description,
                CaAmountEur:           ca        / 100m,
                PaAmountEur:           pa        / 100m,
                CommittedEur:          committed / 100m,
                SpentEur:              spent     / 100m,
                AvailableToCommitEur:  (ca - committed) / 100m,
                AvailableToPayEur:     (pa - spent)     / 100m);
        });
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<PaymentRefDto>> Get(int id)
    {
        var p = await db.PaymentRefs.FindAsync(id);
        return p is null ? NotFound()
            : Ok(new PaymentRefDto(p.Id, p.FiscalYear, p.PaymentRefId, p.Description));
    }

    [HttpPost]
    public async Task<ActionResult<PaymentRefDto>> Create(CreatePaymentRefRequest req)
    {
        if (!await db.FiscalYears.AnyAsync(y => y.Year == req.FiscalYear))
            return BadRequest($"Fiscal year {req.FiscalYear} does not exist.");

        if (await db.PaymentRefs.AnyAsync(p => p.FiscalYear == req.FiscalYear && p.PaymentRefId == req.PaymentRefId))
            return Conflict($"Payment ref '{req.PaymentRefId}' already exists for {req.FiscalYear}.");

        var entity = new PaymentRef { FiscalYear = req.FiscalYear, PaymentRefId = req.PaymentRefId, Description = req.Description };
        db.PaymentRefs.Add(entity);
        await db.SaveChangesAsync();
        var dto = new PaymentRefDto(entity.Id, entity.FiscalYear, entity.PaymentRefId, entity.Description);
        return CreatedAtAction(nameof(Get), new { id = entity.Id }, dto);
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, CreatePaymentRefRequest req)
    {
        var entity = await db.PaymentRefs.FindAsync(id);
        if (entity is null) return NotFound();
        entity.PaymentRefId  = req.PaymentRefId;
        entity.Description   = req.Description;
        await db.SaveChangesAsync();
        return NoContent();
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var entity = await db.PaymentRefs.FindAsync(id);
        if (entity is null) return NotFound();

        bool inUse = await db.Appropriations.AnyAsync(a => a.PaymentRefId == id)
                  || await db.Commitments.AnyAsync(c => c.PaymentRefId == id)
                  || await db.Actuals.AnyAsync(a => a.PaymentRefId == id);
        if (inUse) return Conflict("This payment ref has linked appropriations, commitments, or actuals and cannot be deleted.");

        db.PaymentRefs.Remove(entity);
        await db.SaveChangesAsync();
        return NoContent();
    }
}
