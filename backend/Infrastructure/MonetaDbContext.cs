using Microsoft.EntityFrameworkCore;
using Moneta.Api.Entities;

namespace Moneta.Api.Infrastructure;

public class MonetaDbContext(DbContextOptions<MonetaDbContext> options) : DbContext(options)
{
    public DbSet<FiscalYear> FiscalYears => Set<FiscalYear>();
    public DbSet<PaymentRef> PaymentRefs => Set<PaymentRef>();
    public DbSet<Appropriation> Appropriations => Set<Appropriation>();
    public DbSet<Commitment> Commitments => Set<Commitment>();
    public DbSet<Actual> Actuals => Set<Actual>();
    public DbSet<Invoice> Invoices => Set<Invoice>();
    public DbSet<InvoiceLine> InvoiceLines => Set<InvoiceLine>();
    public DbSet<InvoiceClaimLine> InvoiceClaimLines => Set<InvoiceClaimLine>();
    public DbSet<TaskmanCost> TaskmanCosts => Set<TaskmanCost>();
    public DbSet<TaskmanProject> TaskmanProjects => Set<TaskmanProject>();
    public DbSet<Contractor> Contractors => Set<Contractor>();
    public DbSet<RateCard> RateCards => Set<RateCard>();
    public DbSet<MpsCode> MpsCodes => Set<MpsCode>();
    public DbSet<CategoryMpsMap> CategoryMpsMaps => Set<CategoryMpsMap>();

    protected override void OnModelCreating(ModelBuilder model)
    {
        model.Entity<FiscalYear>(e =>
        {
            e.HasKey(x => x.Year);
        });

        model.Entity<PaymentRef>(e =>
        {
            e.HasIndex(x => new { x.FiscalYear, x.PaymentRefId }).IsUnique();
            e.HasOne(x => x.Year).WithMany(y => y.PaymentRefs)
                .HasForeignKey(x => x.FiscalYear);
        });

        model.Entity<Appropriation>(e =>
        {
            e.HasOne(x => x.PaymentRef).WithMany(p => p.Appropriations)
                .HasForeignKey(x => x.PaymentRefId);
        });

        model.Entity<Commitment>(e =>
        {
            e.HasOne(x => x.PaymentRef).WithMany(p => p.Commitments)
                .HasForeignKey(x => x.PaymentRefId);
        });

        model.Entity<Actual>(e =>
        {
            e.HasOne(x => x.PaymentRef).WithMany(p => p.Actuals)
                .HasForeignKey(x => x.PaymentRefId);
            e.HasOne(x => x.Commitment).WithMany(c => c.Actuals)
                .HasForeignKey(x => x.CommitmentId).IsRequired(false);
            e.HasOne(x => x.Invoice).WithMany(i => i.Actuals)
                .HasForeignKey(x => x.InvoiceId).IsRequired(false);
        });

        model.Entity<Invoice>(e =>
        {
            e.HasOne(x => x.PaymentRef).WithMany(p => p.Invoices)
                .HasForeignKey(x => x.PaymentRefId).IsRequired(false);
        });

        model.Entity<InvoiceLine>(e =>
        {
            e.HasOne(x => x.Invoice).WithMany(i => i.Lines)
                .HasForeignKey(x => x.InvoiceId);
        });

        model.Entity<TaskmanCost>(e =>
        {
            e.HasOne(x => x.PaymentRef).WithMany(p => p.TaskmanCosts)
                .HasForeignKey(x => x.PaymentRefId).IsRequired(false);
            // One row per Taskman time entry — guarantees idempotent ingestion
            e.HasIndex(x => x.ExternalRef).IsUnique();
        });

        model.Entity<TaskmanProject>(e =>
        {
            e.HasKey(x => x.ProjectId);
        });

        model.Entity<RateCard>(e =>
        {
            e.HasIndex(x => new { x.Company, x.Profile }).IsUnique();
        });

        model.Entity<MpsCode>(e =>
        {
            e.HasIndex(x => new { x.FiscalYear, x.Code }).IsUnique();
        });

        model.Entity<CategoryMpsMap>(e =>
        {
            e.HasIndex(x => new { x.FiscalYear, x.TaskmanProject, x.TaskmanCategory }).IsUnique();
        });
    }
}
