using System.Globalization;
using System.Text;
using ClosedXML.Excel;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Moneta.Api.Services;
using Moneta.Api.Dtos;
using Moneta.Api.Entities;
using Moneta.Api.Infrastructure;

namespace Moneta.Api.Controllers;

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
                "PDF extraction is unavailable: set OpenAI:ApiKey in the backend configuration.");
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
            // Pick the ref with the longest overlap with the hint — so when several refs share a
            // contract prefix (…/EEA/DTL/25/015/…), the distinctive suffix (e.g. 61006) decides.
            var best = refs
                .Select(p => new { p.Id, p.PaymentRefId, Overlap = LongestCommonSubstringLength(hint, Norm(p.PaymentRefId)) })
                .Where(x => x.Overlap >= 5)
                .OrderByDescending(x => x.Overlap)
                .FirstOrDefault();
            if (best is not null) { matchId = best.Id; matchCode = best.PaymentRefId; }
        }

        var lines = (ex.Lines ?? [])
            .Select(l => new InvoiceLineInput(l.Developer, l.Hours, l.AmountEur))
            .ToList();

        return Ok(new ExtractedInvoiceDto(
            ex.Consultant, ex.InvoiceRef, ex.Period, ex.ClaimedAmountEur,
            ex.Currency, ex.PaymentRefHint, ex.Notes, matchId, matchCode, lines));
    }

    /// <summary>Set of name-words, lower-cased and accent-folded (é→e), split on spaces/punctuation.</summary>
    static HashSet<string> NameTokens(string name) =>
        name.Split([' ', '.', ',', '-', '_', '/', '\t'], StringSplitOptions.RemoveEmptyEntries)
            .Select(Fold)
            .Where(w => w.Length > 0)
            .ToHashSet();

    /// <summary>Lower-case, strip diacritics (Bécares → becares), keep letters/digits only.</summary>
    static string Fold(string w)
    {
        var decomposed = w.ToLowerInvariant().Normalize(NormalizationForm.FormD);
        var sb = new StringBuilder(decomposed.Length);
        foreach (var c in decomposed)
            if (CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark && char.IsLetterOrDigit(c))
                sb.Append(c);
        return sb.ToString();
    }

    /// <summary>Count of name-words shared between two token sets, tolerating spelling variants
    /// (Oscar/Oskar) via a small edit-distance threshold. Greedy 1:1 pairing.</summary>
    static int FuzzyShared(HashSet<string> a, HashSet<string> b)
    {
        var remaining = b.ToList();
        int score = 0;
        foreach (var ta in a)
        {
            int idx = remaining.FindIndex(tb => SimilarToken(ta, tb));
            if (idx >= 0) { score++; remaining.RemoveAt(idx); }
        }
        return score;
    }

    /// <summary>Two name-words are "the same" if equal or within a length-scaled edit distance.</summary>
    static bool SimilarToken(string a, string b)
    {
        if (a == b) return true;
        int max = Math.Max(a.Length, b.Length);
        if (max < 3) return false;                       // too short to fuzzy-match safely
        int allowed = max <= 6 ? 1 : 2;                  // Oscar/Oskar = 1; longer names tolerate 2
        return Levenshtein(a, b) <= allowed;
    }

    static int Levenshtein(string a, string b)
    {
        var d = new int[b.Length + 1];
        for (int j = 0; j <= b.Length; j++) d[j] = j;
        for (int i = 1; i <= a.Length; i++)
        {
            int prev = d[0]; d[0] = i;
            for (int j = 1; j <= b.Length; j++)
            {
                int tmp = d[j];
                d[j] = Math.Min(Math.Min(d[j] + 1, d[j - 1] + 1), prev + (a[i - 1] == b[j - 1] ? 0 : 1));
                prev = tmp;
            }
        }
        return d[b.Length];
    }

    /// <summary>Length of the longest common contiguous substring of a and b.</summary>
    static int LongestCommonSubstringLength(string a, string b)
    {
        if (a.Length == 0 || b.Length == 0) return 0;
        var prev = new int[b.Length + 1];
        int best = 0;
        for (int i = 1; i <= a.Length; i++)
        {
            var cur = new int[b.Length + 1];
            for (int j = 1; j <= b.Length; j++)
            {
                if (a[i - 1] == b[j - 1]) { cur[j] = prev[j - 1] + 1; if (cur[j] > best) best = cur[j]; }
            }
            prev = cur;
        }
        return best;
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

        // Persist the invoice's billed lines (from extraction or manual entry), if any
        foreach (var l in req.Lines ?? [])
        {
            if (string.IsNullOrWhiteSpace(l.Developer) && l.AmountEur is null) continue;
            db.InvoiceClaimLines.Add(new InvoiceClaimLine
            {
                InvoiceId   = entity.Id,
                Developer   = (l.Developer ?? "").Trim(),
                Hours       = l.Hours,
                AmountCents = (long)Math.Round((l.AmountEur ?? 0) * 100, MidpointRounding.AwayFromZero),
            });
        }
        await db.SaveChangesAsync();

        entity.PaymentRef = pref;
        return Ok(ToDto(entity));
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id, CancellationToken ct)
    {
        var entity = await db.Invoices.FindAsync(id);
        if (entity is null) return NotFound();
        // Remove any booked split lines, billed lines + the booked actual
        await db.InvoiceLines.Where(l => l.InvoiceId == id).ExecuteDeleteAsync(ct);
        await db.InvoiceClaimLines.Where(l => l.InvoiceId == id).ExecuteDeleteAsync(ct);
        await db.Actuals.Where(a => a.InvoiceId == id).ExecuteDeleteAsync(ct);
        db.Invoices.Remove(entity);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    /// <summary>
    /// Whether Taskman cost data is present to verify an invoice for (payment ref, period).
    /// Lists the projects historically linked to the ref and each project's ingestion status
    /// for the period, so the wizard can offer to ingest the missing ones.
    /// </summary>
    [HttpGet("readiness")]
    public async Task<ActionResult<ReadinessDto>> Readiness(
        [FromQuery] int paymentRefId, [FromQuery] string period, CancellationToken ct)
    {
        // Projects historically linked to this ref (from prior ingestion)
        var projectNames = await db.TaskmanCosts
            .Where(t => t.PaymentRefId == paymentRefId)
            .Select(t => t.TaskmanProject)
            .Distinct()
            .ToListAsync(ct);

        var projects = await db.TaskmanProjects
            .Where(p => projectNames.Contains(p.Name))
            .Select(p => new { p.ProjectId, p.Name })
            .ToListAsync(ct);

        // Per-project row counts for the period (any ref — ingestion is by project+period)
        var periodRows = (await db.TaskmanCosts
            .Where(t => t.Period == period && projectNames.Contains(t.TaskmanProject))
            .Select(t => t.TaskmanProject)
            .ToListAsync(ct))
            .GroupBy(n => n)
            .ToDictionary(g => g.Key, g => g.Count());

        var projectStatus = projects
            .Select(p =>
            {
                int rows = periodRows.GetValueOrDefault(p.Name, 0);
                return new ReadinessProjectDto(p.ProjectId, p.Name, rows > 0, rows);
            })
            .OrderBy(p => p.Name)
            .ToList();

        int total = await db.TaskmanCosts.CountAsync(t => t.PaymentRefId == paymentRefId && t.Period == period, ct);

        return Ok(new ReadinessDto(paymentRefId, period, projectNames.Count > 0, total, projectStatus));
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

        var invoiceLines = await db.InvoiceClaimLines
            .Where(l => l.InvoiceId == id)
            .Select(l => new { l.Developer, l.AmountCents })
            .ToListAsync(ct);

        // Merge Taskman (exact cost) and invoice (billed) per developer. Names are matched on
        // name-tokens, not exact strings, so "Natalia Orio Moreno" (Taskman) lines up with
        // "Natalia Orio" (invoice) — a dropped middle name / surname still matches.
        var taskman = rows
            .GroupBy(r => r.Developer)
            .Select(g => new { Developer = g.Key, Hours = g.Sum(x => x.Hours), Cents = g.Sum(x => x.ComputedAmountCents) })
            .ToList();
        var invItems = invoiceLines
            .GroupBy(l => l.Developer)
            .Select(g => new { Label = g.Key, Cents = g.Sum(x => x.AmountCents), Tokens = NameTokens(g.Key), Used = new bool[1] })
            .ToList(); // Used is a 1-element array so it can be flipped in place during matching

        var breakdown = new List<DeveloperLineDto>();
        foreach (var t in taskman)
        {
            var tTokens = NameTokens(t.Developer);
            // Best available invoice line by shared name-words (≥2 shared, or a single-word name
            // that matches). Tolerates accents and spelling variants (Bécares/Becares, Oscar/Oskar).
            var match = invItems
                .Where(x => !x.Used[0])
                .Select(x => new { Item = x, Score = FuzzyShared(x.Tokens, tTokens) })
                .Where(x => x.Score >= 2 || (x.Score >= 1 && Math.Min(x.Item.Tokens.Count, tTokens.Count) == 1))
                .OrderByDescending(x => x.Score)
                .FirstOrDefault();

            long invCents = 0;
            if (match is not null) { invCents = match.Item.Cents; match.Item.Used[0] = true; }
            decimal taskmanEur = t.Cents / 100m, invoiceEur = invCents / 100m;
            breakdown.Add(new DeveloperLineDto(t.Developer, t.Hours, taskmanEur, invoiceEur, invoiceEur - taskmanEur));
        }
        // Invoice lines with no matching Taskman developer (over-billed / unknown name)
        foreach (var x in invItems.Where(x => !x.Used[0]))
        {
            decimal invoiceEur = x.Cents / 100m;
            breakdown.Add(new DeveloperLineDto(x.Label, 0, 0, invoiceEur, invoiceEur));
        }
        breakdown = breakdown.OrderByDescending(b => b.TaskmanEur).ToList();

        decimal claimed       = inv.ClaimedAmountCents / 100m;
        decimal computed      = rows.Sum(r => r.ComputedAmountCents) / 100m;
        decimal invoiceTotal  = invoiceLines.Sum(l => l.AmountCents) / 100m;

        return Ok(new VerificationDto(
            inv.Id, inv.PaymentRef?.PaymentRefId, inv.Period,
            claimed, computed, claimed - computed,
            invoiceTotal, invoiceLines.Count > 0,
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

    /// <summary>Excel breakdown of a verified invoice: timelog + pivot-by-MPS + per-MPS split.</summary>
    [HttpGet("{id:int}/export")]
    public async Task<IActionResult> Export(int id, CancellationToken ct)
    {
        var inv = await db.Invoices.Include(i => i.PaymentRef).FirstOrDefaultAsync(i => i.Id == id, ct);
        if (inv is null) return NotFound();
        if (inv.Status != "verified") return BadRequest("Only verified invoices can be exported.");

        var costs = await db.TaskmanCosts
            .Where(t => t.PaymentRefId == inv.PaymentRefId && t.Period == inv.Period)
            .ToListAsync(ct);
        var splitLines = await db.InvoiceLines.Where(l => l.InvoiceId == id).ToListAsync(ct);

        using var wb = new XLWorkbook();

        // ── Sheet 1: Timelog ──────────────────────────────────────────────────
        var ws = wb.AddWorksheet("Timelog");
        string[] headers = ["Date", "User", "Project", "Category", "Activity", "Payment Class", "Issue", "Comment", "Hours", "MPS"];
        for (int c = 0; c < headers.Length; c++) ws.Cell(1, c + 1).Value = headers[c];
        ws.Row(1).Style.Font.Bold = true;
        int r = 2;
        foreach (var t in costs.OrderBy(t => t.EntryDate).ThenBy(t => t.Developer))
        {
            if (t.EntryDate is DateOnly dd) { ws.Cell(r, 1).Value = dd.ToDateTime(TimeOnly.MinValue); ws.Cell(r, 1).Style.DateFormat.Format = "yyyy-mm-dd"; }
            ws.Cell(r, 2).Value = t.Developer;
            ws.Cell(r, 3).Value = t.TaskmanProject;
            ws.Cell(r, 4).Value = t.TaskmanCategory;
            ws.Cell(r, 5).Value = t.Activity ?? "";
            ws.Cell(r, 6).Value = t.PaymentClass ?? "";
            ws.Cell(r, 7).Value = t.IssueId is int iid ? $"#{iid}: {t.IssueSubject}" : (t.IssueSubject ?? "");
            ws.Cell(r, 8).Value = t.Comment ?? "";
            ws.Cell(r, 9).Value = (double)t.Hours;
            ws.Cell(r, 10).Value = t.MpsCode ?? "";
            r++;
        }
        ws.Columns().AdjustToContents();

        decimal totalHours = costs.Sum(t => t.Hours);

        // ── Sheet 2: Pivot (hours by MPS, and by Project/Category) ─────────────
        var wp = wb.AddWorksheet("Pivot");
        wp.Cell(1, 1).Value = "Hours by MPS"; wp.Cell(1, 1).Style.Font.Bold = true;
        wp.Cell(2, 1).Value = "MPS"; wp.Cell(2, 2).Value = "Hours"; wp.Cell(2, 3).Value = "Share %";
        wp.Range(2, 1, 2, 3).Style.Font.Bold = true;
        int pr = 3;
        foreach (var g in costs.GroupBy(t => t.MpsCode ?? "(unmapped)").OrderByDescending(g => g.Sum(x => x.Hours)))
        {
            decimal h = g.Sum(x => x.Hours);
            wp.Cell(pr, 1).Value = g.Key;
            wp.Cell(pr, 2).Value = (double)h;
            wp.Cell(pr, 3).Value = totalHours > 0 ? (double)(h / totalHours) : 0; wp.Cell(pr, 3).Style.NumberFormat.Format = "0.0%";
            pr++;
        }
        wp.Cell(pr, 1).Value = "Grand Total"; wp.Cell(pr, 2).Value = (double)totalHours;
        wp.Range(pr, 1, pr, 3).Style.Font.Bold = true;

        pr += 2;
        wp.Cell(pr, 1).Value = "Hours by Project / Category"; wp.Cell(pr, 1).Style.Font.Bold = true; pr++;
        wp.Cell(pr, 1).Value = "Project"; wp.Cell(pr, 2).Value = "Category"; wp.Cell(pr, 3).Value = "Hours";
        wp.Range(pr, 1, pr, 3).Style.Font.Bold = true; pr++;
        foreach (var g in costs.GroupBy(t => new { t.TaskmanProject, t.TaskmanCategory }).OrderBy(g => g.Key.TaskmanProject).ThenBy(g => g.Key.TaskmanCategory))
        {
            wp.Cell(pr, 1).Value = g.Key.TaskmanProject;
            wp.Cell(pr, 2).Value = g.Key.TaskmanCategory;
            wp.Cell(pr, 3).Value = (double)g.Sum(x => x.Hours);
            pr++;
        }
        wp.Columns().AdjustToContents();

        // ── Sheet 3: Breakdown (per MPS: hours, %, amount €) ───────────────────
        var wbk = wb.AddWorksheet("Breakdown");
        wbk.Cell(1, 1).Value = $"Invoice {inv.InvoiceRef} — {inv.Consultant} — {inv.Period}"; wbk.Cell(1, 1).Style.Font.Bold = true;
        wbk.Cell(3, 1).Value = "MPS"; wbk.Cell(3, 2).Value = "Hours"; wbk.Cell(3, 3).Value = "Share %"; wbk.Cell(3, 4).Value = "Amount (€)";
        wbk.Range(3, 1, 3, 4).Style.Font.Bold = true;
        decimal splitHours = splitLines.Sum(l => l.Hours);
        int br = 4;
        foreach (var l in splitLines.OrderByDescending(l => l.AmountCents))
        {
            wbk.Cell(br, 1).Value = l.MpsCode ?? "(unmapped)";
            wbk.Cell(br, 2).Value = (double)l.Hours;
            wbk.Cell(br, 3).Value = splitHours > 0 ? (double)(l.Hours / splitHours) : 0; wbk.Cell(br, 3).Style.NumberFormat.Format = "0.0%";
            wbk.Cell(br, 4).Value = l.AmountCents / 100m; wbk.Cell(br, 4).Style.NumberFormat.Format = "#,##0.00";
            br++;
        }
        wbk.Cell(br, 1).Value = "Total"; wbk.Cell(br, 2).Value = (double)splitHours;
        wbk.Cell(br, 4).Value = splitLines.Sum(l => l.AmountCents) / 100m; wbk.Cell(br, 4).Style.NumberFormat.Format = "#,##0.00";
        wbk.Range(br, 1, br, 4).Style.Font.Bold = true;
        wbk.Columns().AdjustToContents();

        using var ms = new MemoryStream();
        wb.SaveAs(ms);

        // Filename: YYMM-<refSuffix> - <Consultant>.xlsx
        string yymm = inv.Period.Length >= 7 ? inv.Period[2..4] + inv.Period[5..7] : inv.Period;
        string refCode = inv.PaymentRef?.PaymentRefId ?? "";
        string refSuffix = refCode.Contains('.') ? refCode[(refCode.LastIndexOf('.') + 1)..] : refCode;
        string raw = $"{yymm}-{refSuffix} - {inv.Consultant}";
        string name = new string(raw.Select(ch => Path.GetInvalidFileNameChars().Contains(ch) ? '_' : ch).ToArray());

        return File(ms.ToArray(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", $"{name}.xlsx");
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
