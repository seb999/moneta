using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Moneta.Api.Entities;
using Moneta.Api.Dtos;
using Moneta.Api.Infrastructure;

namespace Moneta.Api.Controllers;

[ApiController]
[Route("api/fiscal-years")]
public class FiscalYearsController(MonetaDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IEnumerable<FiscalYearDto>> GetAll() =>
        await db.FiscalYears
            .OrderByDescending(y => y.Year)
            .Select(y => new FiscalYearDto(y.Year, y.Status))
            .ToListAsync();

    [HttpGet("{year:int}")]
    public async Task<ActionResult<FiscalYearDto>> Get(int year)
    {
        var fy = await db.FiscalYears.FindAsync(year);
        return fy is null ? NotFound() : Ok(new FiscalYearDto(fy.Year, fy.Status));
    }

    [HttpPost]
    public async Task<ActionResult<FiscalYearDto>> Create(CreateFiscalYearRequest req)
    {
        if (await db.FiscalYears.AnyAsync(y => y.Year == req.Year))
            return Conflict($"Fiscal year {req.Year} already exists.");

        var fy = new FiscalYear { Year = req.Year, Status = req.Status };
        db.FiscalYears.Add(fy);
        await db.SaveChangesAsync();
        var dto = new FiscalYearDto(fy.Year, fy.Status);
        return CreatedAtAction(nameof(Get), new { year = fy.Year }, dto);
    }

    [HttpPatch("{year:int}/status")]
    public async Task<IActionResult> UpdateStatus(int year, [FromBody] string status)
    {
        var fy = await db.FiscalYears.FindAsync(year);
        if (fy is null) return NotFound();
        fy.Status = status;
        await db.SaveChangesAsync();
        return NoContent();
    }
}
