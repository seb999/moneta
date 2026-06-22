namespace Moneta.Api.Domain;

public class TaskmanProject
{
    public int ProjectId { get; set; }
    public string Name { get; set; } = "";
    public string? Company { get; set; }
    public DateTime? LastSynced { get; set; }
}
