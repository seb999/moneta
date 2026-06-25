using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Moneta.Api.Domain;
using Moneta.Api.Infrastructure;

namespace Moneta.Api.Controllers;

public record DiscoveredUser(int? TaskmanUserId, string Name, bool AlreadyImported);
public record BulkImportRequest(List<BulkImportEntry> Users);
public record BulkImportEntry(int TaskmanUserId, string Name, string Company, string? Profile);

public record ContractorDto(int Id, string Name, string Company, string? Profile, int? TaskmanUserId);
public record CreateContractorRequest(string Name, string Company, string? Profile, int? TaskmanUserId);

public record RateCardDto(int Id, string Company, string Profile, decimal DailyRateEur, decimal? IntraMurosRateEur);
public record UpsertRateCardRequest(string Company, string Profile, decimal DailyRateEur, decimal? IntraMurosRateEur);

[ApiController]
[Route("api/contractors")]
public class ContractorsController(MonetaDbContext db) : ControllerBase
{
    static ContractorDto ToDto(Contractor c) => new(c.Id, c.Name, c.Company, c.Profile, c.TaskmanUserId);

    // ── Contractors ──────────────────────────────────────────────────────────

    [HttpGet]
    public async Task<IEnumerable<ContractorDto>> GetAll() =>
        (await db.Contractors.OrderBy(c => c.Company).ThenBy(c => c.Name).ToListAsync()).Select(ToDto);

    [HttpPost]
    public async Task<ActionResult<ContractorDto>> Create(CreateContractorRequest req)
    {
        var entity = new Contractor { Name = req.Name, Company = req.Company, Profile = req.Profile, TaskmanUserId = req.TaskmanUserId };
        db.Contractors.Add(entity);
        await db.SaveChangesAsync();
        return Ok(ToDto(entity));
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, CreateContractorRequest req)
    {
        var entity = await db.Contractors.FindAsync(id);
        if (entity is null) return NotFound();
        entity.Name = req.Name; entity.Company = req.Company; entity.Profile = req.Profile; entity.TaskmanUserId = req.TaskmanUserId;
        await db.SaveChangesAsync();
        return NoContent();
    }

    /// <summary>Set just the profile of a contractor (inline edit).</summary>
    [HttpPatch("{id:int}/profile")]
    public async Task<IActionResult> SetProfile(int id, [FromBody] string? profile)
    {
        var entity = await db.Contractors.FindAsync(id);
        if (entity is null) return NotFound();
        entity.Profile = string.IsNullOrWhiteSpace(profile) ? null : profile;
        await db.SaveChangesAsync();
        return NoContent();
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var entity = await db.Contractors.FindAsync(id);
        if (entity is null) return NotFound();
        db.Contractors.Remove(entity);
        await db.SaveChangesAsync();
        return NoContent();
    }

    // ── Rate Cards ───────────────────────────────────────────────────────────

    [HttpGet("rate-cards")]
    public async Task<IEnumerable<RateCardDto>> GetRateCards() =>
        await db.RateCards
            .OrderBy(r => r.Company).ThenBy(r => r.Profile)
            .Select(r => new RateCardDto(r.Id, r.Company, r.Profile,
                r.DailyRateCents / 100m,
                r.IntraMurosRateCents.HasValue ? r.IntraMurosRateCents.Value / 100m : null))
            .ToListAsync();

    /// <summary>Create or update a rate card by (company, profile).</summary>
    [HttpPut("rate-cards")]
    public async Task<ActionResult<RateCardDto>> UpsertRateCard(UpsertRateCardRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Company) || string.IsNullOrWhiteSpace(req.Profile))
            return BadRequest("Company and profile are required.");

        var card = await db.RateCards.FirstOrDefaultAsync(r => r.Company == req.Company && r.Profile == req.Profile);
        if (card is null)
        {
            card = new RateCard { Company = req.Company, Profile = req.Profile };
            db.RateCards.Add(card);
        }
        card.DailyRateCents      = (long)(req.DailyRateEur * 100);
        card.IntraMurosRateCents = req.IntraMurosRateEur.HasValue ? (long)(req.IntraMurosRateEur.Value * 100) : null;
        await db.SaveChangesAsync();
        return Ok(new RateCardDto(card.Id, card.Company, card.Profile, card.DailyRateCents / 100m,
            card.IntraMurosRateCents.HasValue ? card.IntraMurosRateCents.Value / 100m : null));
    }

    [HttpDelete("rate-cards/{id:int}")]
    public async Task<IActionResult> DeleteRateCard(int id)
    {
        var card = await db.RateCards.FindAsync(id);
        if (card is null) return NotFound();
        db.RateCards.Remove(card);
        await db.SaveChangesAsync();
        return NoContent();
    }

    // ── Discovery ────────────────────────────────────────────────────────────

    /// <summary>
    /// Discover developers for a payment ref.
    /// Finds which Taskman projects are linked to this ref (via prior ingestion),
    /// then scans those projects live on Taskman to get the current developer list.
    /// </summary>
    [HttpGet("discover-by-ref")]
    public async Task<ActionResult<List<DiscoveredUser>>> DiscoverByRef(
        [FromQuery] int paymentRefId,
        [FromQuery] int monthsBack = 12,
        [FromServices] IRedmineClient redmine = null!,
        CancellationToken ct = default)
    {
        // Find which Taskman project names have been ingested for this payment ref
        var projectNames = await db.TaskmanCosts
            .Where(t => t.PaymentRefId == paymentRefId)
            .Select(t => t.TaskmanProject)
            .Distinct()
            .ToListAsync(ct);

        if (projectNames.Count == 0)
            return Ok(new List<DiscoveredUser>()); // no ingestion yet for this ref

        // Resolve to Taskman project IDs
        var projectIds = await db.TaskmanProjects
            .Where(p => projectNames.Contains(p.Name))
            .Select(p => p.ProjectId)
            .ToListAsync(ct);

        // Scan each project live on Taskman
        var allUsers = new Dictionary<int, string>(); // userId → name
        foreach (var pid in projectIds)
        {
            try
            {
                var users = await redmine.DiscoverUsersAsync(pid, monthsBack, ct);
                foreach (var u in users) allUsers.TryAdd(u.Id, u.Name);
            }
            catch { /* skip projects we can't access */ }
        }

        var existingIds = (await db.Contractors
            .Where(c => c.TaskmanUserId != null)
            .Select(c => c.TaskmanUserId!.Value)
            .ToListAsync(ct)).ToHashSet();

        return Ok(allUsers
            .Select(kv => new DiscoveredUser(kv.Key, kv.Value, existingIds.Contains(kv.Key)))
            .OrderBy(d => d.Name)
            .ToList());
    }

    /// <summary>Discover developers from a Redmine project's recent time entries (live).</summary>
    [HttpGet("discover")]
    public async Task<ActionResult<List<DiscoveredUser>>> Discover(
        [FromQuery] int projectId,
        [FromQuery] int monthsBack = 12,
        [FromServices] IRedmineClient redmine = null!,
        CancellationToken ct = default)
    {
        try
        {
            var users = await redmine.DiscoverUsersAsync(projectId, monthsBack, ct);
            var existingIds = (await db.Contractors
                .Where(c => c.TaskmanUserId != null)
                .Select(c => c.TaskmanUserId!.Value)
                .ToListAsync(ct)).ToHashSet();
            return Ok(users.Select(u => new DiscoveredUser(u.Id, u.Name, existingIds.Contains(u.Id))).ToList());
        }
        catch (HttpRequestException ex) { return StatusCode(502, $"Taskman API error: {ex.Message}"); }
    }

    [HttpPost("bulk-import")]
    public async Task<ActionResult<int>> BulkImport(BulkImportRequest req)
    {
        var existingIds = (await db.Contractors
            .Where(c => c.TaskmanUserId != null)
            .Select(c => c.TaskmanUserId!.Value)
            .ToListAsync()).ToHashSet();
        int created = 0;
        foreach (var u in req.Users.Where(u => !existingIds.Contains(u.TaskmanUserId)))
        {
            db.Contractors.Add(new Contractor { Name = u.Name, Company = u.Company, Profile = u.Profile, TaskmanUserId = u.TaskmanUserId });
            created++;
        }
        await db.SaveChangesAsync();
        return Ok(created);
    }
}
