using System.Text.Json;

namespace Moneta.Api.Infrastructure;

public interface IRedmineClient
{
    Task<List<RedmineProject>> GetProjectsAsync(CancellationToken ct = default);
    Task<List<RedmineTimeEntry>> GetTimeEntriesAsync(int projectId, DateOnly from, DateOnly to, CancellationToken ct = default);
    Task<Dictionary<int, RedmineIssue>> GetIssuesByIdsAsync(IEnumerable<int> issueIds, CancellationToken ct = default);
    Task<List<RedmineRef>> DiscoverUsersAsync(int projectId, int monthsBack = 3, CancellationToken ct = default);
}

public class RedmineClient(HttpClient http) : IRedmineClient
{
    private static readonly JsonSerializerOptions JsonOpts = new() { PropertyNameCaseInsensitive = true };
    private const int PageSize = 100;

    public async Task<List<RedmineProject>> GetProjectsAsync(CancellationToken ct = default)
    {
        var all = new List<RedmineProject>();
        int offset = 0;
        while (true)
        {
            var resp = await http.GetFromJsonAsync<RedmineProjectsResponse>(
                $"/projects.json?limit={PageSize}&offset={offset}", JsonOpts, ct) ?? throw new InvalidOperationException("Null response from Redmine");
            all.AddRange(resp.Projects);
            offset += PageSize;
            if (offset >= resp.TotalCount) break;
        }
        return all;
    }

    public async Task<List<RedmineTimeEntry>> GetTimeEntriesAsync(
        int projectId, DateOnly from, DateOnly to, CancellationToken ct = default)
    {
        var all = new List<RedmineTimeEntry>();
        int offset = 0;
        while (true)
        {
            var url = $"/time_entries.json?project_id={projectId}&from={from:yyyy-MM-dd}&to={to:yyyy-MM-dd}&limit={PageSize}&offset={offset}";
            var resp = await http.GetFromJsonAsync<RedmineTimeEntriesResponse>(url, JsonOpts, ct)
                       ?? throw new InvalidOperationException("Null response from Redmine");
            all.AddRange(resp.TimeEntries);
            offset += PageSize;
            if (offset >= resp.TotalCount) break;
        }
        return all;
    }

    public async Task<List<RedmineRef>> DiscoverUsersAsync(
        int projectId, int monthsBack = 3, CancellationToken ct = default)
    {
        var to   = DateOnly.FromDateTime(DateTime.Today);
        var from = to.AddMonths(-monthsBack);
        var entries = await GetTimeEntriesAsync(projectId, from, to, ct);
        return entries
            .Select(e => e.User)
            .DistinctBy(u => u.Id)
            .OrderBy(u => u.Name)
            .ToList();
    }

    public async Task<Dictionary<int, RedmineIssue>> GetIssuesByIdsAsync(
        IEnumerable<int> issueIds, CancellationToken ct = default)
    {
        var result = new Dictionary<int, RedmineIssue>();
        var ids = issueIds.Distinct().ToList();
        for (int i = 0; i < ids.Count; i += PageSize)
        {
            var batch = ids.Skip(i).Take(PageSize);
            var param = string.Join(",", batch);
            var resp = await http.GetFromJsonAsync<RedmineIssuesResponse>(
                $"/issues.json?issue_id={param}&limit={PageSize}", JsonOpts, ct);
            if (resp is null) continue;
            foreach (var issue in resp.Issues)
                result[issue.Id] = issue;
        }
        return result;
    }
}
