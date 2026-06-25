namespace Moneta.Api.Dtos;

// ── Fiscal Year ──────────────────────────────────────────────────────────────

public record FiscalYearDto(int Year, string Status);
public record CreateFiscalYearRequest(int Year, string Status = "open");

// ── Payment Ref ──────────────────────────────────────────────────────────────

public record PaymentRefDto(int Id, int FiscalYear, string PaymentRefId, string Description);

public record CreatePaymentRefRequest(int FiscalYear, string PaymentRefId, string Description);
public record SyncPaymentRefsResult(int FoundInTaskman, int Created, List<string> CreatedRefs);

/// <summary>
/// One row in the budget summary: budget → committed → spent → remaining.
/// All monetary values in euros, converted from cent storage.
/// </summary>
public record PaymentRefSummaryDto(
    int Id,
    int FiscalYear,
    string PaymentRefId,
    string Description,
    decimal CaAmountEur,
    decimal PaAmountEur,
    decimal CommittedEur,
    decimal SpentEur,
    decimal AvailableToCommitEur,
    decimal AvailableToPayEur);

// ── Appropriation ────────────────────────────────────────────────────────────

public record AppropriationDto(
    int Id,
    int PaymentRefId,
    string PaymentRefCode,
    int FiscalYear,
    decimal CaAmountEur,
    decimal PaAmountEur,
    string CreditOrigin,
    string Source,
    DateOnly EffectiveDate,
    string? Note);

public record CreateAppropriationRequest(
    int PaymentRefId,
    int FiscalYear,
    decimal CaAmountEur,
    decimal PaAmountEur,
    string CreditOrigin = "C1",
    string Source = "manual",
    DateOnly? EffectiveDate = null,
    string? Note = null);

// ── Commitment ───────────────────────────────────────────────────────────────

public record CommitmentDto(
    int Id,
    int PaymentRefId,
    string PaymentRefCode,
    int FiscalYear,
    string Reference,
    decimal AmountEur,
    DateOnly Date,
    string? Counterparty,
    string Status,
    string ContractType);

public record CreateCommitmentRequest(
    int PaymentRefId,
    int FiscalYear,
    string Reference,
    decimal AmountEur,
    DateOnly Date,
    string? Counterparty,
    string Status = "active",
    string ContractType = "TM");

public record UpdateCommitmentStatusRequest(string Status);

// ── Actual ───────────────────────────────────────────────────────────────────

public record ActualDto(
    int Id,
    int PaymentRefId,
    string PaymentRefCode,
    int FiscalYear,
    string Period,
    int? CommitmentId,
    int? InvoiceId,
    decimal AmountEur,
    DateOnly Date,
    string? Description,
    string? Consultant,
    string Source);

public record CreateActualRequest(
    int PaymentRefId,
    int FiscalYear,
    string Period,
    decimal AmountEur,
    DateOnly Date,
    int? CommitmentId = null,
    string? Description = null,
    string? Consultant = null,
    string Source = "manual");

// ── Taskman Cost ─────────────────────────────────────────────────────────────

public record TaskmanCostDto(
    int Id,
    int FiscalYear,
    string Period,
    string TaskmanProject,
    string TaskmanCategory,
    string Developer,
    decimal Hours,
    decimal ComputedAmountEur,
    int? PaymentRefId,
    string? PaymentRefCode,
    string? Consultant,
    string AttributionStatus,
    string? ExternalRef);

// ── Ingestion ─────────────────────────────────────────────────────────────────

public record IngestRequest(int FiscalYear, string Period, int? ProjectId = null, int? PaymentRefId = null);

public record SyncedProjectDto(int ProjectId, string Name);

public record IngestSummaryDto(
    string Period,
    int EntriesProcessed,
    int Mapped,
    int AssumedDefault,
    int Unmapped,
    int Excluded,
    decimal TotalComputedEur,
    List<string> Warnings);
