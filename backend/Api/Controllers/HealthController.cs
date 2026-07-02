using Microsoft.AspNetCore.Mvc;
using Moneta.Api.Infrastructure;

namespace Moneta.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class HealthController : ControllerBase
{
    [HttpGet]
    public IActionResult Get() => Ok(new { status = "ok", app = "Moneta" });

    /// <summary>Validates the caller's Taskman key (X-Taskman-Key header, else the server default).</summary>
    [HttpGet("taskman")]
    public async Task<IActionResult> Taskman([FromServices] IRedmineClient redmine, CancellationToken ct)
        => Ok(new { valid = await redmine.ValidateKeyAsync(ct) });
}
