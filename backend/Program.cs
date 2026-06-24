using Microsoft.EntityFrameworkCore;
using Moneta.Api.Application;
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

if (app.Environment.IsDevelopment())
    app.MapOpenApi();

app.UseCors();
app.UseHttpsRedirection();
app.MapControllers();

// Auto-apply migrations on startup in development
if (app.Environment.IsDevelopment())
{
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<MonetaDbContext>();
    Directory.CreateDirectory("data");
    db.Database.Migrate();
}

app.Run();
