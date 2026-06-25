using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Moneta.Api.Domain;
using Moneta.Api.Dtos;
using Moneta.Api.Infrastructure;

namespace Moneta.Api.Controllers;

[ApiController]
[Route("api/commitments")]
public class CommitmentsController(MonetaDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IEnumerable<CommitmentDto>> GetAll([FromQuery] int? year, [FromQuery] int? paymentRefId)
    {
        var q = db.Commitments.Include(c => c.PaymentRef).AsQueryable();
        if (year.HasValue)         q = q.Where(c => c.FiscalYear == year.Value);
        if (paymentRefId.HasValue) q = q.Where(c => c.PaymentRefId == paymentRefId.Value);
        return await q
            .OrderBy(c => c.Date)
            .Select(c => new CommitmentDto(
                c.Id, c.PaymentRefId, c.PaymentRef.PaymentRefId, c.FiscalYear,
                c.Reference, c.AmountCents / 100m, c.Date, c.Counterparty, c.Status, c.ContractType))
            .ToListAsync();
    }

    [HttpPost]
    public async Task<ActionResult<CommitmentDto>> Create(CreateCommitmentRequest req)
    {
        var paymentRef = await db.PaymentRefs.FindAsync(req.PaymentRefId);
        if (paymentRef is null) return BadRequest($"Payment ref {req.PaymentRefId} not found.");

        var entity = new Commitment
        {
            PaymentRefId = req.PaymentRefId,
            FiscalYear   = req.FiscalYear,
            Reference    = req.Reference,
            AmountCents  = (long)(req.AmountEur * 100),
            Date         = req.Date,
            Counterparty = req.Counterparty,
            Status       = req.Status,
            ContractType = req.ContractType,
        };
        db.Commitments.Add(entity);
        await db.SaveChangesAsync();
        return Ok(new CommitmentDto(
            entity.Id, entity.PaymentRefId, paymentRef.PaymentRefId, entity.FiscalYear,
            entity.Reference, entity.AmountCents / 100m, entity.Date, entity.Counterparty, entity.Status, entity.ContractType));
    }

    [HttpPut("{id:int}")]
    public async Task<ActionResult<CommitmentDto>> Update(int id, CreateCommitmentRequest req)
    {
        var entity = await db.Commitments.Include(c => c.PaymentRef).FirstOrDefaultAsync(c => c.Id == id);
        if (entity is null) return NotFound();

        var paymentRef = await db.PaymentRefs.FindAsync(req.PaymentRefId);
        if (paymentRef is null) return BadRequest($"Payment ref {req.PaymentRefId} not found.");

        entity.PaymentRefId = req.PaymentRefId;
        entity.FiscalYear   = req.FiscalYear;
        entity.Reference    = req.Reference;
        entity.AmountCents  = (long)(req.AmountEur * 100);
        entity.Date         = req.Date;
        entity.Counterparty = req.Counterparty;
        entity.Status       = req.Status;
        entity.ContractType = req.ContractType;
        await db.SaveChangesAsync();

        return Ok(new CommitmentDto(
            entity.Id, entity.PaymentRefId, paymentRef.PaymentRefId, entity.FiscalYear,
            entity.Reference, entity.AmountCents / 100m, entity.Date, entity.Counterparty, entity.Status, entity.ContractType));
    }

    [HttpPatch("{id:int}/status")]
    public async Task<IActionResult> UpdateStatus(int id, [FromBody] string status)
    {
        var entity = await db.Commitments.FindAsync(id);
        if (entity is null) return NotFound();
        entity.Status = status;
        await db.SaveChangesAsync();
        return NoContent();
    }
}
