using Microsoft.EntityFrameworkCore;
using Moneta.Api.Services;
using Moneta.Api.Infrastructure;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddOpenApi();
builder.Services.AddControllers();
builder.Services.AddHttpClient(); // default + named clients for chat/MCP
builder.Services.AddHttpContextAccessor(); // lets RedmineClient read the per-user Taskman key

builder.Services.AddDbContext<MonetaDbContext>(options =>
    options.UseSqlite(builder.Configuration.GetConnectionString("Default")
        ?? "Data Source=data/moneta.db"));

builder.Services.AddHttpClient<IRedmineClient, RedmineClient>(client =>
{
    var baseUrl = builder.Configuration["Taskman:BaseUrl"] ?? "https://taskman.eionet.europa.eu";
    client.BaseAddress = new Uri(baseUrl);
    // The X-Redmine-API-Key header is set per request in RedmineClient (user key or default)
});

builder.Services.AddScoped<ICostIngestionService, CostIngestionService>();
builder.Services.AddScoped<IMpsImportService, MpsImportService>();
builder.Services.AddScoped<IInvoiceExtractionService, InvoiceExtractionService>();

builder.Services.AddCors(options =>
    options.AddDefaultPolicy(policy =>
        policy.WithOrigins("http://localhost:5173")
              .AllowAnyHeader()
              .AllowAnyMethod()));

var app = builder.Build();

// Dev-only: OpenAPI, cross-origin Vite dev server (5173), and HTTPS redirect.
// In the container the SPA is served same-origin over plain HTTP behind a proxy.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.UseCors();
    app.UseHttpsRedirection();
}

// Serve the built React SPA (copied to wwwroot in the Docker image) and the API
app.UseDefaultFiles();
app.UseStaticFiles();
app.MapControllers();
app.MapFallbackToFile("index.html"); // client-side routing

// Apply EF migrations + ensure the SQLite data dir exists, on every startup
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<MonetaDbContext>();
    Directory.CreateDirectory("data");
    db.Database.Migrate();
}

app.Run();
