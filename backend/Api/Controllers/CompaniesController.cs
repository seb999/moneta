using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Moneta.Api.Dtos;
using Moneta.Api.Entities;
using Moneta.Api.Infrastructure;

namespace Moneta.Api.Controllers;

[ApiController]
[Route("api/companies")]
public class CompaniesController(MonetaDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IEnumerable<CompanyDto>> GetAll() =>
        await db.Companies.OrderBy(c => c.Name).Select(c => new CompanyDto(c.Id, c.Name)).ToListAsync();

    [HttpPost]
    public async Task<ActionResult<CompanyDto>> Create([FromBody] CreateCompanyRequest req)
    {
        var name = req.Name?.Trim() ?? "";
        if (string.IsNullOrEmpty(name)) return BadRequest("Name is required.");
        if (await db.Companies.AnyAsync(c => c.Name == name))
            return Conflict($"'{name}' already exists.");
        var entity = new Company { Name = name };
        db.Companies.Add(entity);
        await db.SaveChangesAsync();
        return Ok(new CompanyDto(entity.Id, entity.Name));
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var entity = await db.Companies.FindAsync(id);
        if (entity is null) return NotFound();
        db.Companies.Remove(entity);
        await db.SaveChangesAsync();
        return NoContent();
    }
}
