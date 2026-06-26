namespace Moneta.Api.Dtos;

public record InvoiceDto(
    int Id, string Consultant, string InvoiceRef, int FiscalYear, string Period,
    int? PaymentRefId, string? PaymentRefCode, decimal ClaimedAmountEur,
    DateOnly ReceivedDate, string Status, string? VerifiedBy, DateTime? VerifiedAt, string? Note);

/// <summary>A billed line as it appears on the invoice (one per developer), used at intake.</summary>
public record InvoiceLineInput(string? Developer, decimal? Hours, decimal? AmountEur);

public record CreateInvoiceRequest(
    string Consultant, string InvoiceRef, int FiscalYear, string Period,
    int PaymentRefId, decimal ClaimedAmountEur, DateOnly? ReceivedDate, string? Note,
    List<InvoiceLineInput>? Lines = null);

/// <summary>One row of the verification breakdown: exact Taskman cost vs the amount billed on the invoice.</summary>
public record DeveloperLineDto(string Developer, decimal Hours, decimal TaskmanEur, decimal InvoiceEur, decimal DiffEur);

public record VerificationDto(
    int InvoiceId, string? PaymentRefCode, string Period,
    decimal ClaimedEur, decimal ComputedEur, decimal VarianceEur,
    decimal InvoiceLinesTotalEur, bool HasInvoiceLines,
    decimal TotalHours, List<DeveloperLineDto> Breakdown);

public record VerifyRequest(string? VerifiedBy, string? Note);

/// <summary>LLM-extracted invoice fields, with a best-guess payment ref match for the intake form.</summary>
public record ExtractedInvoiceDto(
    string? Consultant, string? InvoiceRef, string? Period,
    decimal? ClaimedAmountEur, string? Currency, string? PaymentRefHint, string? Notes,
    int? SuggestedPaymentRefId, string? SuggestedPaymentRefCode,
    List<InvoiceLineInput> Lines);

public record MpsSplitLineDto(string MpsCode, decimal Hours, decimal SharePct, decimal AmountEur);
public record SplitDto(
    int InvoiceId, string? PaymentRefCode, string Period, decimal ClaimedEur,
    decimal MappedHours, decimal UnmappedHours, List<MpsSplitLineDto> Lines);

public record ReadinessProjectDto(int ProjectId, string Name, bool Ingested, int Rows);
public record ReadinessDto(int PaymentRefId, string Period, bool DerivedFromHistory, int TotalCostRows, List<ReadinessProjectDto> Projects);
