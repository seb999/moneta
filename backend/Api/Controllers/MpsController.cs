using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Moneta.Api.Services;
using Moneta.Api.Dtos;
using Moneta.Api.Infrastructure;

namespace Moneta.Api.Controllers;

[ApiController]
[Route("api/mps")]
public class MpsController(MonetaDbContext db, IMpsImportService importer, IConfiguration config) : ControllerBase
{
    [HttpGet("codes")]
    public async Task<IEnumerable<MpsCodeDto>> GetCodes([FromQuery] int year) =>
        await db.MpsCodes.Where(m => m.FiscalYear == year)
            .OrderBy(m => m.Code)
            .Select(m => new MpsCodeDto(m.Id, m.FiscalYear, m.Code, m.Label, m.Rollup))
            .ToListAsync();

    [HttpGet("mappings")]
    public async Task<IEnumerable<CategoryMpsMapDto>> GetMappings([FromQuery] int year) =>
        await db.CategoryMpsMaps.Where(m => m.FiscalYear == year)
            .OrderBy(m => m.TaskmanProject).ThenBy(m => m.TaskmanCategory)
            .Select(m => new CategoryMpsMapDto(m.Id, m.FiscalYear, m.TaskmanProject, m.TaskmanCategory, m.MpsCode, m.Excluded, m.Note))
            .ToListAsync();

    /// <summary>Unmapped (Project, Category) pairs found in ingested cost data — the triage queue.</summary>
    [HttpGet("unmapped")]
    public async Task<IEnumerable<object>> GetUnmapped([FromQuery] int year)
    {
        // Pull the raw rows and aggregate in memory — SQLite stores decimal as TEXT
        // and aggregating/ordering it in SQL triggers a fatal collation bug.
        var rows = await db.TaskmanCosts
            .Where(t => t.FiscalYear == year && t.MpsStatus == "unmapped")
            .Select(t => new { t.TaskmanProject, t.TaskmanCategory, t.Hours })
            .ToListAsync();

        return rows
            .GroupBy(t => new { t.TaskmanProject, t.TaskmanCategory })
            .Select(g => new
            {
                taskmanProject = g.Key.TaskmanProject,
                taskmanCategory = g.Key.TaskmanCategory,
                hours = g.Sum(x => x.Hours),
                entries = g.Count(),
            })
            .OrderByDescending(x => x.hours)
            .ToList();
    }

    /// <summary>Create a mapping rule. Blank category = project-level default (used when the
    /// Taskman issue has no category).</summary>
    [HttpPost("mappings")]
    public async Task<ActionResult<CategoryMpsMapDto>> CreateMapping(UpsertMappingRequest req)
    {
        if (!req.Excluded && string.IsNullOrWhiteSpace(req.MpsCode))
            return BadRequest("Provide an MPS code, or mark the rule excluded.");

        var project = req.TaskmanProject.Trim();
        var category = (req.TaskmanCategory ?? "").Trim();

        if (await db.CategoryMpsMaps.AnyAsync(m => m.FiscalYear == req.FiscalYear && m.TaskmanProject == project && m.TaskmanCategory == category))
            return Conflict($"A rule for ({project}, {(category == "" ? "blank" : category)}) already exists for {req.FiscalYear}.");

        var entity = new Entities.CategoryMpsMap
        {
            FiscalYear      = req.FiscalYear,
            TaskmanProject  = project,
            TaskmanCategory = category,
            MpsCode         = req.Excluded ? null : req.MpsCode?.Trim(),
            Excluded        = req.Excluded,
            Note            = string.IsNullOrWhiteSpace(req.Note) ? null : req.Note.Trim(),
        };
        db.CategoryMpsMaps.Add(entity);
        await db.SaveChangesAsync();
        return Ok(new CategoryMpsMapDto(entity.Id, entity.FiscalYear, entity.TaskmanProject, entity.TaskmanCategory, entity.MpsCode, entity.Excluded, entity.Note));
    }

    [HttpPut("mappings/{id:int}")]
    public async Task<IActionResult> UpdateMapping(int id, UpsertMappingRequest req)
    {
        var entity = await db.CategoryMpsMaps.FindAsync(id);
        if (entity is null) return NotFound();
        if (!req.Excluded && string.IsNullOrWhiteSpace(req.MpsCode))
            return BadRequest("Provide an MPS code, or mark the rule excluded.");

        entity.TaskmanProject  = req.TaskmanProject.Trim();
        entity.TaskmanCategory = (req.TaskmanCategory ?? "").Trim();
        entity.MpsCode         = req.Excluded ? null : req.MpsCode?.Trim();
        entity.Excluded        = req.Excluded;
        entity.Note            = string.IsNullOrWhiteSpace(req.Note) ? null : req.Note.Trim();
        await db.SaveChangesAsync();
        return NoContent();
    }

    [HttpDelete("mappings/{id:int}")]
    public async Task<IActionResult> DeleteMapping(int id)
    {
        var entity = await db.CategoryMpsMaps.FindAsync(id);
        if (entity is null) return NotFound();
        db.CategoryMpsMaps.Remove(entity);
        await db.SaveChangesAsync();
        return NoContent();
    }

    /// <summary>Import the "Codes to MPS" tab from an uploaded xlsx for the given year.</summary>
    [HttpPost("import")]
    public async Task<ActionResult<MpsImportResult>> Import([FromForm] IFormFile file, [FromForm] int year, CancellationToken ct)
    {
        if (file is null || file.Length == 0) return BadRequest("No file uploaded.");
        try
        {
            await using var stream = file.OpenReadStream();
            var result = await importer.ImportCodesToMpsAsync(stream, year, ct);
            return Ok(result);
        }
        catch (ArgumentException ex) { return BadRequest(ex.Message); }
    }

    /// <summary>Import from a configured workbook path (set Mps:ImportFile in config).</summary>
    [HttpPost("import-bundled")]
    public async Task<ActionResult<MpsImportResult>> ImportBundled([FromQuery] int year, CancellationToken ct)
    {
        var path = config["Mps:ImportFile"];
        if (string.IsNullOrWhiteSpace(path) || !System.IO.File.Exists(path))
            return BadRequest("Workbook not found. Set Mps:ImportFile in configuration or use the file upload endpoint instead.");
        try
        {
            await using var stream = System.IO.File.OpenRead(path);
            var result = await importer.ImportCodesToMpsAsync(stream, year, ct);
            return Ok(result);
        }
        catch (ArgumentException ex) { return BadRequest(ex.Message); }
    }
}
