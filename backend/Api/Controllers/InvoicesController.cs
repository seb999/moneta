using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Moneta.Api.Application;
using Moneta.Api.Domain;
using Moneta.Api.Infrastructure;

namespace Moneta.Api.Controllers;

public record InvoiceDto(
    int Id, string Consultant, string InvoiceRef, int FiscalYear, string Period,
    int? PaymentRefId, string? PaymentRefCode, decimal ClaimedAmountEur,
    DateOnly ReceivedDate, string Status, string? VerifiedBy, DateTime? VerifiedAt, string? Note);

public record CreateInvoiceRequest(
    string Consultant, string InvoiceRef, int FiscalYear, string Period,
    int PaymentRefId, decimal ClaimedAmountEur, DateOnly? ReceivedDate, string? Note);

public record DeveloperLineDto(string Developer, decimal Hours, decimal ComputedEur);

public record VerificationDto(
    int InvoiceId, string? PaymentRefCode, string Period,
    decimal ClaimedEur, decimal ComputedEur, decimal VarianceEur,
    decimal TotalHours, List<DeveloperLineDto> Breakdown);

public record VerifyRequest(string? VerifiedBy, string? Note);

/// <summary>LLM-extracted invoice fields, with a best-guess payment ref match for the intake form.</summary>
public record ExtractedInvoiceDto(
    string? Consultant, string? InvoiceRef, string? Period,
    decimal? ClaimedAmountEur, string? Currency, string? PaymentRefHint, string? Notes,
    int? SuggestedPaymentRefId, string? SuggestedPaymentRefCode);

public record MpsSplitLineDto(string MpsCode, decimal Hours, decimal SharePct, decimal AmountEur);
public record SplitDto(
    int InvoiceId, string? PaymentRefCode, string Period, decimal ClaimedEur,
    decimal MappedHours, decimal UnmappedHours, List<MpsSplitLineDto> Lines);

[ApiController]
[Route("api/invoices")]
public class InvoicesController(MonetaDbContext db, IInvoiceExtractionService extractor) : ControllerBase
{
    /// <summary>Upload an invoice PDF → LLM pre-fills consultant / period / amount for officer review.</summary>
    [HttpPost("extract")]
    [RequestSizeLimit(32 * 1024 * 1024)]
    public async Task<ActionResult<ExtractedInvoiceDto>> Extract(
        IFormFile file, [FromQuery] int? year, CancellationToken ct)
    {
        if (!extractor.IsConfigured)
            return StatusCode(StatusCodes.Status501NotImplemented,
                "PDF extraction is unavailable: set Anthropic:ApiKey in the backend configuration.");
        if (file is null || file.Length == 0) return BadRequest("No file uploaded.");
        if (!file.FileName.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase) &&
            file.ContentType != "application/pdf")
            return BadRequest("Only PDF invoices are supported.");

        using var ms = new MemoryStream();
        await file.CopyToAsync(ms, ct);

        ExtractedInvoice ex;
        try
        {
            ex = await extractor.ExtractAsync(ms.ToArray(), ct);
        }
        catch (Exception e)
        {
            return StatusCode(StatusCodes.Status502BadGateway, $"Extraction failed: {e.Message}");
        }

        // Best-effort match the hint against payment refs for the fiscal year.
        int? matchId = null; string? matchCode = null;
        if (!string.IsNullOrWhiteSpace(ex.PaymentRefHint))
        {
            var refs = await db.PaymentRefs
                .Where(p => year == null || p.FiscalYear == year)
                .Select(p => new { p.Id, p.PaymentRefId })
                .ToListAsync(ct);

            // Normalise to alphanumerics so EEA.61006 matches EEA/DTL/25/015/EEA.61006 etc.
            static string Norm(string s) => new(s.Where(char.IsLetterOrDigit).Select(char.ToLowerInvariant).ToArray());
            var hint = Norm(ex.PaymentRefHint);
            var hit = refs.FirstOrDefault(p =>
            {
                var code = Norm(p.PaymentRefId);
                return code.Length > 0 && (hint.Contains(code) || code.Contains(hint));
            });
            if (hit is not null) { matchId = hit.Id; matchCode = hit.PaymentRefId; }
        }

        return Ok(new ExtractedInvoiceDto(
            ex.Consultant, ex.InvoiceRef, ex.Period, ex.ClaimedAmountEur,
            ex.Currency, ex.PaymentRefHint, ex.Notes, matchId, matchCode));
    }

    static InvoiceDto ToDto(Invoice i) => new(
        i.Id, i.Consultant, i.InvoiceRef, i.FiscalYear, i.Period,
        i.PaymentRefId, i.PaymentRef?.PaymentRefId, i.ClaimedAmountCents / 100m,
        i.ReceivedDate, i.Status, i.VerifiedBy, i.VerifiedAt, i.Note);

    [HttpGet]
    public async Task<IEnumerable<InvoiceDto>> GetAll([FromQuery] int? year, [FromQuery] string? status)
    {
        var q = db.Invoices.Include(i => i.PaymentRef).AsQueryable();
        if (year.HasValue) q = q.Where(i => i.FiscalYear == year.Value);
        if (status is not null) q = q.Where(i => i.Status == status);
        return (await q.OrderByDescending(i => i.ReceivedDate).ToListAsync()).Select(ToDto);
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<InvoiceDto>> Get(int id)
    {
        var i = await db.Invoices.Include(x => x.PaymentRef).FirstOrDefaultAsync(x => x.Id == id);
        return i is null ? NotFound() : Ok(ToDto(i));
    }

    [HttpPost]
    public async Task<ActionResult<InvoiceDto>> Create(CreateInvoiceRequest req)
    {
        var pref = await db.PaymentRefs.FindAsync(req.PaymentRefId);
        if (pref is null) return BadRequest($"Payment ref {req.PaymentRefId} not found.");

        var entity = new Invoice
        {
            Consultant         = req.Consultant,
            InvoiceRef         = req.InvoiceRef,
            FiscalYear         = req.FiscalYear,
            Period             = req.Period,
            PaymentRefId       = req.PaymentRefId,
            ClaimedAmountCents = (long)(req.ClaimedAmountEur * 100),
            ReceivedDate       = req.ReceivedDate ?? DateOnly.FromDateTime(DateTime.Today),
            Status             = "received",
            Note               = req.Note,
        };
        db.Invoices.Add(entity);
        await db.SaveChangesAsync();
        entity.PaymentRef = pref;
        return Ok(ToDto(entity));
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id, CancellationToken ct)
    {
        var entity = await db.Invoices.FindAsync(id);
        if (entity is null) return NotFound();
        // Remove any booked split lines + the booked actual
        await db.InvoiceLines.Where(l => l.InvoiceId == id).ExecuteDeleteAsync(ct);
        await db.Actuals.Where(a => a.InvoiceId == id).ExecuteDeleteAsync(ct);
        db.Invoices.Remove(entity);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    /// <summary>Claimed amount vs Taskman computed cost for the invoice's (payment ref, period).</summary>
    [HttpGet("{id:int}/verification")]
    public async Task<ActionResult<VerificationDto>> Verification(int id, CancellationToken ct)
    {
        var inv = await db.Invoices.Include(i => i.PaymentRef).FirstOrDefaultAsync(i => i.Id == id, ct);
        if (inv is null) return NotFound();

        // Pull raw cost rows for this (ref, period); aggregate in memory (decimal Hours on SQLite)
        var rows = await db.TaskmanCosts
            .Where(t => t.PaymentRefId == inv.PaymentRefId && t.Period == inv.Period)
            .Select(t => new { t.Developer, t.Hours, t.ComputedAmountCents })
            .ToListAsync(ct);

        var breakdown = rows
            .GroupBy(r => r.Developer)
            .Select(g => new DeveloperLineDto(g.Key, g.Sum(x => x.Hours), g.Sum(x => x.ComputedAmountCents) / 100m))
            .OrderByDescending(d => d.ComputedEur)
            .ToList();

        decimal claimed = inv.ClaimedAmountCents / 100m;
        decimal computed = rows.Sum(r => r.ComputedAmountCents) / 100m;

        return Ok(new VerificationDto(
            inv.Id, inv.PaymentRef?.PaymentRefId, inv.Period,
            claimed, computed, claimed - computed,
            breakdown.Sum(b => b.Hours), breakdown));
    }

    /// <summary>Preview the MPS split: claimed amount apportioned across MPS codes by hours.</summary>
    [HttpGet("{id:int}/split")]
    public async Task<ActionResult<SplitDto>> Split(int id, CancellationToken ct)
    {
        var inv = await db.Invoices.Include(i => i.PaymentRef).FirstOrDefaultAsync(i => i.Id == id, ct);
        if (inv is null) return NotFound();
        return Ok(await ComputeSplit(inv, ct));
    }

    /// <summary>Persisted MPS split lines of a verified invoice.</summary>
    [HttpGet("{id:int}/lines")]
    public async Task<IEnumerable<MpsSplitLineDto>> Lines(int id, CancellationToken ct)
    {
        var lines = await db.InvoiceLines.Where(l => l.InvoiceId == id).ToListAsync(ct);
        var total = lines.Sum(l => l.Hours);
        return lines
            .OrderByDescending(l => l.AmountCents)
            .Select(l => new MpsSplitLineDto(
                l.MpsCode ?? "—", l.Hours,
                total > 0 ? l.Hours / total * 100 : 0, l.AmountCents / 100m));
    }

    [HttpPost("{id:int}/verify")]
    public async Task<IActionResult> Verify(int id, VerifyRequest req, CancellationToken ct)
    {
        var inv = await db.Invoices.Include(i => i.PaymentRef).FirstOrDefaultAsync(i => i.Id == id, ct);
        if (inv is null) return NotFound();
        bool wasVerified = inv.Status == "verified";

        inv.Status = "verified";
        inv.VerifiedBy = req.VerifiedBy;
        inv.VerifiedAt = DateTime.UtcNow;
        if (!string.IsNullOrWhiteSpace(req.Note)) inv.Note = req.Note;

        if (!wasVerified)
        {
            // Build the MPS split → invoice lines
            await db.InvoiceLines.Where(l => l.InvoiceId == id).ExecuteDeleteAsync(ct);
            var split = await ComputeSplit(inv, ct);
            long acc = 0;
            foreach (var line in split.Lines)
            {
                long cents = (long)Math.Round(line.AmountEur * 100, MidpointRounding.AwayFromZero);
                acc += cents;
                db.InvoiceLines.Add(new InvoiceLine { InvoiceId = id, MpsCode = line.MpsCode, Hours = line.Hours, AmountCents = cents });
            }
            // Reconcile rounding so the lines sum exactly to the claimed amount
            long diff = inv.ClaimedAmountCents - acc;
            if (diff != 0 && db.ChangeTracker.Entries<InvoiceLine>().Any())
            {
                var biggest = db.ChangeTracker.Entries<InvoiceLine>()
                    .OrderByDescending(e => e.Entity.AmountCents).First().Entity;
                biggest.AmountCents += diff;
            }

            // Book the actual (invoice total) against the payment ref → feeds "spent"
            await db.Actuals.Where(a => a.InvoiceId == id).ExecuteDeleteAsync(ct);
            if (inv.PaymentRefId is int prid)
                db.Actuals.Add(new Actual
                {
                    PaymentRefId = prid,
                    FiscalYear   = inv.FiscalYear,
                    Period       = inv.Period,
                    AmountCents  = inv.ClaimedAmountCents,
                    Date         = DateOnly.FromDateTime(DateTime.Today),
                    InvoiceId    = id,
                    Consultant   = inv.Consultant,
                    Source       = "invoice",
                    Description  = $"Invoice {inv.InvoiceRef} verified",
                });
        }

        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    /// <summary>Apportion the claimed amount across MPS codes, proportional to hours per MPS.</summary>
    private async Task<SplitDto> ComputeSplit(Invoice inv, CancellationToken ct)
    {
        var rows = await db.TaskmanCosts
            .Where(t => t.PaymentRefId == inv.PaymentRefId && t.Period == inv.Period)
            .Select(t => new { t.MpsCode, t.MpsStatus, t.Hours })
            .ToListAsync(ct);

        decimal claimed = inv.ClaimedAmountCents / 100m;
        var mappedRows = rows.Where(r => r.MpsCode != null && (r.MpsStatus == "mapped" || r.MpsStatus == "assumed_default")).ToList();
        decimal mappedHours = mappedRows.Sum(r => r.Hours);
        decimal unmappedHours = rows.Where(r => r.MpsStatus == "unmapped").Sum(r => r.Hours);

        var lines = mappedRows
            .GroupBy(r => r.MpsCode!)
            .Select(g =>
            {
                decimal h = g.Sum(x => x.Hours);
                decimal share = mappedHours > 0 ? h / mappedHours : 0;
                return new MpsSplitLineDto(g.Key, h, share * 100, Math.Round(claimed * share, 2));
            })
            .OrderByDescending(l => l.AmountEur)
            .ToList();

        return new SplitDto(inv.Id, inv.PaymentRef?.PaymentRefId, inv.Period, claimed, mappedHours, unmappedHours, lines);
    }

    [HttpPost("{id:int}/dispute")]
    public async Task<IActionResult> Dispute(int id, VerifyRequest req)
    {
        var inv = await db.Invoices.FindAsync(id);
        if (inv is null) return NotFound();
        inv.Status = "disputed";
        inv.VerifiedBy = req.VerifiedBy;
        inv.VerifiedAt = DateTime.UtcNow;
        if (!string.IsNullOrWhiteSpace(req.Note)) inv.Note = req.Note;
        await db.SaveChangesAsync();
        return NoContent();
    }
}
