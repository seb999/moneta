using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Moneta.Api.Entities;
using Moneta.Api.Dtos;
using Moneta.Api.Infrastructure;

namespace Moneta.Api.Controllers;

[ApiController]
[Route("api/actuals")]
public class ActualsController(MonetaDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IEnumerable<ActualDto>> GetAll([FromQuery] int? year, [FromQuery] int? paymentRefId)
    {
        var q = db.Actuals.Include(a => a.PaymentRef).AsQueryable();
        if (year.HasValue)         q = q.Where(a => a.FiscalYear == year.Value);
        if (paymentRefId.HasValue) q = q.Where(a => a.PaymentRefId == paymentRefId.Value);
        return await q
            .OrderByDescending(a => a.Date)
            .Select(a => new ActualDto(
                a.Id, a.PaymentRefId, a.PaymentRef.PaymentRefId, a.FiscalYear,
                a.Period, a.CommitmentId, a.InvoiceId,
                a.AmountCents / 100m, a.Date, a.Description, a.Consultant, a.Source))
            .ToListAsync();
    }

    [HttpPost]
    public async Task<ActionResult<ActualDto>> Create(CreateActualRequest req)
    {
        var paymentRef = await db.PaymentRefs.FindAsync(req.PaymentRefId);
        if (paymentRef is null) return BadRequest($"Payment ref {req.PaymentRefId} not found.");

        var entity = new Actual
        {
            PaymentRefId = req.PaymentRefId,
            FiscalYear   = req.FiscalYear,
            Period       = req.Period,
            AmountCents  = (long)(req.AmountEur * 100),
            Date         = req.Date,
            CommitmentId = req.CommitmentId,
            Description  = req.Description,
            Consultant   = req.Consultant,
            Source       = req.Source,
        };
        db.Actuals.Add(entity);
        await db.SaveChangesAsync();
        return Ok(new ActualDto(
            entity.Id, entity.PaymentRefId, paymentRef.PaymentRefId, entity.FiscalYear,
            entity.Period, entity.CommitmentId, entity.InvoiceId,
            entity.AmountCents / 100m, entity.Date, entity.Description, entity.Consultant, entity.Source));
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var entity = await db.Actuals.FindAsync(id);
        if (entity is null) return NotFound();
        if (entity.Source != "manual") return Conflict("Only manual actuals can be deleted.");
        db.Actuals.Remove(entity);
        await db.SaveChangesAsync();
        return NoContent();
    }
}
