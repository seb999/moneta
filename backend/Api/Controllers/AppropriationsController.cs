using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Moneta.Api.Domain;
using Moneta.Api.Dtos;
using Moneta.Api.Infrastructure;

namespace Moneta.Api.Controllers;

[ApiController]
[Route("api/appropriations")]
public class AppropriationsController(MonetaDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IEnumerable<AppropriationDto>> GetAll([FromQuery] int? year, [FromQuery] int? paymentRefId)
    {
        var q = db.Appropriations.Include(a => a.PaymentRef).AsQueryable();
        if (year.HasValue)         q = q.Where(a => a.FiscalYear == year.Value);
        if (paymentRefId.HasValue) q = q.Where(a => a.PaymentRefId == paymentRefId.Value);
        return await q
            .OrderBy(a => a.PaymentRef.PaymentRefId)
            .ThenBy(a => a.EffectiveDate)
            .Select(a => new AppropriationDto(
                a.Id, a.PaymentRefId, a.PaymentRef.PaymentRefId, a.FiscalYear,
                a.CaAmountCents / 100m, a.PaAmountCents / 100m,
                a.CreditOrigin, a.Source, a.EffectiveDate, a.Note))
            .ToListAsync();
    }

    [HttpPost]
    public async Task<ActionResult<AppropriationDto>> Create(CreateAppropriationRequest req)
    {
        var paymentRef = await db.PaymentRefs.FindAsync(req.PaymentRefId);
        if (paymentRef is null) return BadRequest($"Payment ref {req.PaymentRefId} not found.");

        var entity = new Appropriation
        {
            PaymentRefId  = req.PaymentRefId,
            FiscalYear    = req.FiscalYear,
            CaAmountCents = (long)(req.CaAmountEur * 100),
            PaAmountCents = (long)(req.PaAmountEur * 100),
            CreditOrigin  = req.CreditOrigin,
            Source        = req.Source,
            EffectiveDate = req.EffectiveDate ?? DateOnly.FromDateTime(DateTime.Today),
            Note          = req.Note,
        };
        db.Appropriations.Add(entity);
        await db.SaveChangesAsync();
        return Ok(new AppropriationDto(
            entity.Id, entity.PaymentRefId, paymentRef.PaymentRefId, entity.FiscalYear,
            entity.CaAmountCents / 100m, entity.PaAmountCents / 100m,
            entity.CreditOrigin, entity.Source, entity.EffectiveDate, entity.Note));
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var entity = await db.Appropriations.FindAsync(id);
        if (entity is null) return NotFound();
        db.Appropriations.Remove(entity);
        await db.SaveChangesAsync();
        return NoContent();
    }
}
