using Microsoft.EntityFrameworkCore;
using Moneta.Api.Application;
using Moneta.Api.Infrastructure;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddOpenApi();
builder.Services.AddControllers();

builder.Services.AddDbContext<MonetaDbContext>(options =>
    options.UseSqlite(builder.Configuration.GetConnectionString("Default")
        ?? "Data Source=data/moneta.db"));

builder.Services.AddHttpClient<IRedmineClient, RedmineClient>(client =>
{
    var baseUrl = builder.Configuration["Taskman:BaseUrl"] ?? "https://taskman.eionet.europa.eu";
    var apiKey = builder.Configuration["Taskman:ApiKey"] ?? "";
    client.BaseAddress = new Uri(baseUrl);
    client.DefaultRequestHeaders.Add("X-Redmine-API-Key", apiKey);
});

builder.Services.AddScoped<ICostIngestionService, CostIngestionService>();

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
