using System.Text.Json.Serialization;

namespace Moneta.Api.Infrastructure;

// ── Shared ───────────────────────────────────────────────────────────────────

public record RedmineRef(
    [property: JsonPropertyName("id")] int Id,
    [property: JsonPropertyName("name")] string Name);

// ── Projects ─────────────────────────────────────────────────────────────────

public record RedmineProjectsResponse(
    [property: JsonPropertyName("projects")] List<RedmineProject> Projects,
    [property: JsonPropertyName("total_count")] int TotalCount);

public record RedmineProject(
    [property: JsonPropertyName("id")] int Id,
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("identifier")] string Identifier,
    [property: JsonPropertyName("status")] int Status);

// ── Time Entries ──────────────────────────────────────────────────────────────

public record RedmineTimeEntriesResponse(
    [property: JsonPropertyName("time_entries")] List<RedmineTimeEntry> TimeEntries,
    [property: JsonPropertyName("total_count")] int TotalCount);

public record RedmineTimeEntry(
    [property: JsonPropertyName("id")] int Id,
    [property: JsonPropertyName("project")] RedmineRef Project,
    [property: JsonPropertyName("issue")] RedmineRef? Issue,
    [property: JsonPropertyName("user")] RedmineRef User,
    [property: JsonPropertyName("activity")] RedmineRef Activity,
    [property: JsonPropertyName("hours")] decimal Hours,
    [property: JsonPropertyName("spent_on")] string SpentOn,
    [property: JsonPropertyName("comments")] string? Comments,
    [property: JsonPropertyName("custom_fields")] List<RedmineCustomField>? CustomFields)
{
    public string PaymentPerformedClass =>
        CustomFields?.FirstOrDefault(cf => cf.Name == "Payment Performed Class")?.Value ?? "";

    public string PaymentRefId =>
        CustomFields?.FirstOrDefault(cf => cf.Name == "Payment Reference ID")?.Value ?? "";
}

public record RedmineCustomField(
    [property: JsonPropertyName("id")] int Id,
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("value")] string? Value);

// ── Issues ────────────────────────────────────────────────────────────────────

public record RedmineIssuesResponse(
    [property: JsonPropertyName("issues")] List<RedmineIssue> Issues,
    [property: JsonPropertyName("total_count")] int TotalCount);

public record RedmineIssue(
    [property: JsonPropertyName("id")] int Id,
    [property: JsonPropertyName("subject")] string Subject,
    [property: JsonPropertyName("category")] RedmineRef? Category);
