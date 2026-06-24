using Microsoft.EntityFrameworkCore;
using Moneta.Api.Domain;
using Moneta.Api.Dtos;
using Moneta.Api.Infrastructure;

namespace Moneta.Api.Application;

public interface ICostIngestionService
{
    Task<IngestSummaryDto> IngestMonthAsync(int fiscalYear, string period, int? projectId = null, int? paymentRefId = null, CancellationToken ct = default);
}

public class CostIngestionService(MonetaDbContext db, IRedmineClient redmine) : ICostIngestionService
{
    public async Task<IngestSummaryDto> IngestMonthAsync(
        int fiscalYear, string period, int? projectId = null, int? paymentRefId = null, CancellationToken ct = default)
    {
        if (!TryParsePeriod(period, out int year, out int month))
            throw new ArgumentException($"Invalid period '{period}'. Expected 'YYYY-MM'.");

        var from = new DateOnly(year, month, 1);
        var to   = new DateOnly(year, month, DateTime.DaysInMonth(year, month));

        // PaymentRefs keyed by their payment_ref_id string (= Taskman custom field value)
        var paymentRefs = await db.PaymentRefs
            .Where(p => p.FiscalYear == fiscalYear)
            .ToDictionaryAsync(p => p.PaymentRefId, StringComparer.OrdinalIgnoreCase, ct);

        // Contractors keyed by Taskman user id
        var contractors = await db.Contractors
            .Where(c => c.TaskmanUserId != null)
            .ToListAsync(ct);
        var contractorByUserId = contractors.ToDictionary(c => c.TaskmanUserId!.Value);

        // Rate cards keyed by (company, profile)
        var rateCards = await db.RateCards.ToListAsync(ct);
        var rateByCompanyProfile = rateCards.ToDictionary(
            r => (r.Company, r.Profile),
            r => r);

        // Category → MPS mapping for this year. Two lookups:
        //   exact (project, category)  and  project-default (project, "")
        var maps = await db.CategoryMpsMaps.Where(m => m.FiscalYear == fiscalYear).ToListAsync(ct);
        var mapExact = maps
            .Where(m => m.TaskmanCategory != "")
            .GroupBy(m => (m.TaskmanProject, m.TaskmanCategory))
            .ToDictionary(g => g.Key, g => g.First());
        var mapProjectDefault = maps
            .Where(m => m.TaskmanCategory == "")
            .GroupBy(m => m.TaskmanProject)
            .ToDictionary(g => g.Key, g => g.First());

        // Which Redmine projects to pull
        List<int> projectIds;
        if (projectId.HasValue)
        {
            projectIds = [projectId.Value];
        }
        else if (paymentRefId.HasValue)
        {
            // Resolve the projects that have logged time under this payment ref (from prior ingestion)
            var projectNames = await db.TaskmanCosts
                .Where(t => t.PaymentRefId == paymentRefId.Value)
                .Select(t => t.TaskmanProject)
                .Distinct()
                .ToListAsync(ct);
            projectIds = await db.TaskmanProjects
                .Where(p => projectNames.Contains(p.Name))
                .Select(p => p.ProjectId)
                .ToListAsync(ct);
        }
        else
        {
            projectIds = await db.TaskmanProjects.Select(p => p.ProjectId).ToListAsync(ct);
        }

        var warnings = new List<string>();
        if (paymentRefId.HasValue && projectIds.Count == 0)
            warnings.Add("No prior data for this payment ref — can't resolve its projects. Ingest by project or all projects first.");
        int entriesProcessed = 0, mapped = 0, unmapped = 0, excluded = 0;
        long totalCents = 0;

        // Fetch all entries first so we can auto-create missing PaymentRefs in one pass
        var allEntries = new List<(int ProjectId, RedmineTimeEntry Entry)>();
        foreach (int pid in projectIds)
        {
            List<RedmineTimeEntry> entries;
            try { entries = await redmine.GetTimeEntriesAsync(pid, from, to, ct); }
            catch (Exception ex) { warnings.Add($"Project {pid}: failed to fetch — {ex.Message}"); continue; }
            foreach (var e in entries) allEntries.Add((pid, e));
        }

        // Batch-fetch issue Categories for MPS resolution (only if a mapping exists)
        Dictionary<int, RedmineIssue> issueCache = [];
        if (maps.Count > 0)
        {
            var issueIds = allEntries
                .Where(x => x.Entry.Issue is not null)
                .Select(x => x.Entry.Issue!.Id)
                .Distinct();
            try { issueCache = await redmine.GetIssuesByIdsAsync(issueIds, ct); }
            catch (Exception ex) { warnings.Add($"Could not fetch issue categories — MPS left unmapped: {ex.Message}"); }
        }

        // Guard against the same time entry being processed twice in one run
        // (e.g. a project resolved more than once) — dedupe by Taskman entry id.
        var seenEntryIds = new HashSet<int>();

        // Auto-create any payment_ref_id seen in Taskman that doesn't exist locally yet
        var newRefIds = allEntries
            .Select(x => x.Entry.PaymentRefId)
            .Where(r => !string.IsNullOrEmpty(r) && !r.Equals("x", StringComparison.OrdinalIgnoreCase))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Where(r => !paymentRefs.ContainsKey(r))
            .ToList();

        foreach (var refId in newRefIds)
        {
            var newRef = new PaymentRef { FiscalYear = fiscalYear, PaymentRefId = refId, Description = "" };
            db.PaymentRefs.Add(newRef);
            paymentRefs[refId] = newRef;
        }
        if (newRefIds.Count > 0)
        {
            await db.SaveChangesAsync(ct);
            warnings.Add($"Auto-created {newRefIds.Count} new payment ref(s): {string.Join(", ", newRefIds)}");
        }

        foreach (var (_, entry) in allEntries)
        {
            if (!seenEntryIds.Add(entry.Id)) continue; // already handled this entry this run
            entriesProcessed++;
            string refId = entry.PaymentRefId;

            string attributionStatus;
            int? paymentRefDbId = null;

            if (string.IsNullOrEmpty(refId))
            {
                attributionStatus = "unmapped";
            }
            else if (refId.Equals("x", StringComparison.OrdinalIgnoreCase))
            {
                attributionStatus = "excluded";
            }
            else if (paymentRefs.TryGetValue(refId, out var pr))
            {
                paymentRefDbId    = pr.Id;
                attributionStatus = "mapped";
            }
            else
            {
                attributionStatus = "unmapped";
            }

                contractorByUserId.TryGetValue(entry.User.Id, out var contractor);
                long computedCents = ComputeCents(entry, contractor, rateByCompanyProfile, warnings);
                totalCents += computedCents;

                string? consultant = contractor?.Company;
                string externalRef = $"taskman:{entry.Id}";

                // Resolve the issue Category, then the MPS code via the mapping
                string category = entry.Issue is not null && issueCache.TryGetValue(entry.Issue.Id, out var iss)
                    ? iss.Category?.Name ?? ""
                    : "";
                var (mpsCode, mpsStatus) = ResolveMps(entry.Project.Name, category, mapExact, mapProjectDefault);

                var existing = await db.TaskmanCosts
                    .FirstOrDefaultAsync(t => t.ExternalRef == externalRef, ct);

                if (existing is null)
                {
                    db.TaskmanCosts.Add(new TaskmanCost
                    {
                        FiscalYear        = fiscalYear,
                        Period            = period,
                        TaskmanProject    = entry.Project.Name,
                        TaskmanCategory   = category,
                        Developer         = entry.User.Name,
                        TaskmanUserId     = entry.User.Id,
                        Hours             = entry.Hours,
                        ComputedAmountCents = computedCents,
                        PaymentRefId      = paymentRefDbId,
                        Consultant        = consultant,
                        MpsCode           = mpsCode,
                        MpsStatus         = mpsStatus,
                        AttributionStatus = attributionStatus,
                        ExternalRef       = externalRef,
                    });
                }
                else
                {
                    existing.Period             = period;
                    existing.Developer          = entry.User.Name;
                    existing.TaskmanUserId      = entry.User.Id;
                    existing.Hours              = entry.Hours;
                    existing.ComputedAmountCents = computedCents;
                    existing.PaymentRefId       = paymentRefDbId;
                    existing.Consultant         = consultant;
                    existing.TaskmanCategory    = category;
                    existing.MpsCode            = mpsCode;
                    existing.MpsStatus          = mpsStatus;
                    existing.AttributionStatus  = attributionStatus;
                }

                switch (attributionStatus)
                {
                    case "mapped":    mapped++;    break;
                    case "excluded":  excluded++;  break;
                    default:          unmapped++;  break;
                }
            }

        await db.SaveChangesAsync(ct);

        return new IngestSummaryDto(period, entriesProcessed, mapped, 0, unmapped, excluded, totalCents / 100m, warnings);
    }

    /// <summary>
    /// Resolve (Project, Category) → (mpsCode, status) with fallback:
    /// exact match → project default (blank category) → unmapped.
    /// Returns status: mapped | assumed_default | excluded | unmapped.
    /// </summary>
    private static (string? Code, string Status) ResolveMps(
        string project, string category,
        Dictionary<(string, string), Domain.CategoryMpsMap> exact,
        Dictionary<string, Domain.CategoryMpsMap> projectDefault)
    {
        if (!string.IsNullOrEmpty(category) && exact.TryGetValue((project, category), out var m))
            return m.Excluded ? (null, "excluded") : (m.MpsCode, "mapped");

        // Blank or unmapped category → project-level default
        if (projectDefault.TryGetValue(project, out var def))
            return def.Excluded ? (null, "excluded") : (def.MpsCode, "assumed_default");

        return (null, "unmapped");
    }

    private static long ComputeCents(
        RedmineTimeEntry entry,
        Contractor? contractor,
        Dictionary<(string, string), RateCard> rateByCompanyProfile,
        List<string> warnings)
    {
        if (contractor is null) return 0; // unknown developer — no rate

        if (string.IsNullOrEmpty(contractor.Profile))
        {
            warnings.Add($"Contractor '{contractor.Name}' has no profile assigned — cost set to 0.");
            return 0;
        }

        if (!rateByCompanyProfile.TryGetValue((contractor.Company, contractor.Profile), out var card))
        {
            warnings.Add($"No rate card for {contractor.Company} / {contractor.Profile} — cost set to 0.");
            return 0;
        }

        long dailyRateCents = entry.PaymentPerformedClass == "intra-muros" && card.IntraMurosRateCents is > 0
            ? card.IntraMurosRateCents!.Value
            : card.DailyRateCents;

        decimal cost = (decimal)entry.Hours / 8m * (dailyRateCents / 100m);
        return (long)Math.Round(cost * 100, MidpointRounding.AwayFromZero);
    }

    private static bool TryParsePeriod(string period, out int year, out int month)
    {
        year = 0; month = 0;
        if (period is not { Length: 7 }) return false;
        return int.TryParse(period[..4], out year) && int.TryParse(period[5..], out month)
               && month >= 1 && month <= 12;
    }
}
