using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Moneta.Api.Migrations
{
    /// <inheritdoc />
    public partial class InitialSchema : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Contractors",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    Name = table.Column<string>(type: "TEXT", nullable: false),
                    Company = table.Column<string>(type: "TEXT", nullable: false),
                    TaskmanUserId = table.Column<int>(type: "INTEGER", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Contractors", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "FiscalYears",
                columns: table => new
                {
                    Year = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    Status = table.Column<string>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FiscalYears", x => x.Year);
                });

            migrationBuilder.CreateTable(
                name: "TaskmanProjects",
                columns: table => new
                {
                    ProjectId = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    Name = table.Column<string>(type: "TEXT", nullable: false),
                    Company = table.Column<string>(type: "TEXT", nullable: true),
                    LastSynced = table.Column<DateTime>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TaskmanProjects", x => x.ProjectId);
                });

            migrationBuilder.CreateTable(
                name: "ContractorRates",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    ContractorId = table.Column<int>(type: "INTEGER", nullable: false),
                    TaskmanProjectId = table.Column<int>(type: "INTEGER", nullable: true),
                    Profile = table.Column<string>(type: "TEXT", nullable: true),
                    DailyRateCents = table.Column<long>(type: "INTEGER", nullable: false),
                    IntraMurosRateCents = table.Column<long>(type: "INTEGER", nullable: true),
                    EffectiveFrom = table.Column<DateOnly>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ContractorRates", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ContractorRates_Contractors_ContractorId",
                        column: x => x.ContractorId,
                        principalTable: "Contractors",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "PaymentRefs",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    FiscalYear = table.Column<int>(type: "INTEGER", nullable: false),
                    PaymentRefId = table.Column<string>(type: "TEXT", nullable: false),
                    Description = table.Column<string>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PaymentRefs", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PaymentRefs_FiscalYears_FiscalYear",
                        column: x => x.FiscalYear,
                        principalTable: "FiscalYears",
                        principalColumn: "Year",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Appropriations",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    PaymentRefId = table.Column<int>(type: "INTEGER", nullable: false),
                    FiscalYear = table.Column<int>(type: "INTEGER", nullable: false),
                    CaAmountCents = table.Column<long>(type: "INTEGER", nullable: false),
                    PaAmountCents = table.Column<long>(type: "INTEGER", nullable: false),
                    CreditOrigin = table.Column<string>(type: "TEXT", nullable: false),
                    Source = table.Column<string>(type: "TEXT", nullable: false),
                    EffectiveDate = table.Column<DateOnly>(type: "TEXT", nullable: false),
                    Note = table.Column<string>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Appropriations", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Appropriations_PaymentRefs_PaymentRefId",
                        column: x => x.PaymentRefId,
                        principalTable: "PaymentRefs",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Commitments",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    PaymentRefId = table.Column<int>(type: "INTEGER", nullable: false),
                    FiscalYear = table.Column<int>(type: "INTEGER", nullable: false),
                    Reference = table.Column<string>(type: "TEXT", nullable: false),
                    AmountCents = table.Column<long>(type: "INTEGER", nullable: false),
                    Date = table.Column<DateOnly>(type: "TEXT", nullable: false),
                    Counterparty = table.Column<string>(type: "TEXT", nullable: true),
                    Status = table.Column<string>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Commitments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Commitments_PaymentRefs_PaymentRefId",
                        column: x => x.PaymentRefId,
                        principalTable: "PaymentRefs",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Invoices",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    Consultant = table.Column<string>(type: "TEXT", nullable: false),
                    InvoiceRef = table.Column<string>(type: "TEXT", nullable: false),
                    FiscalYear = table.Column<int>(type: "INTEGER", nullable: false),
                    Period = table.Column<string>(type: "TEXT", nullable: false),
                    PaymentRefId = table.Column<int>(type: "INTEGER", nullable: true),
                    ClaimedAmountCents = table.Column<long>(type: "INTEGER", nullable: false),
                    ReceivedDate = table.Column<DateOnly>(type: "TEXT", nullable: false),
                    Status = table.Column<string>(type: "TEXT", nullable: false),
                    VerifiedBy = table.Column<string>(type: "TEXT", nullable: true),
                    VerifiedAt = table.Column<DateTime>(type: "TEXT", nullable: true),
                    Note = table.Column<string>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Invoices", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Invoices_PaymentRefs_PaymentRefId",
                        column: x => x.PaymentRefId,
                        principalTable: "PaymentRefs",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "TaskmanCosts",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    FiscalYear = table.Column<int>(type: "INTEGER", nullable: false),
                    Period = table.Column<string>(type: "TEXT", nullable: false),
                    TaskmanProject = table.Column<string>(type: "TEXT", nullable: false),
                    TaskmanCategory = table.Column<string>(type: "TEXT", nullable: false),
                    Developer = table.Column<string>(type: "TEXT", nullable: false),
                    Hours = table.Column<decimal>(type: "TEXT", nullable: false),
                    ComputedAmountCents = table.Column<long>(type: "INTEGER", nullable: false),
                    PaymentRefId = table.Column<int>(type: "INTEGER", nullable: true),
                    Consultant = table.Column<string>(type: "TEXT", nullable: true),
                    AttributionStatus = table.Column<string>(type: "TEXT", nullable: false),
                    ExternalRef = table.Column<string>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TaskmanCosts", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TaskmanCosts_PaymentRefs_PaymentRefId",
                        column: x => x.PaymentRefId,
                        principalTable: "PaymentRefs",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "Actuals",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    PaymentRefId = table.Column<int>(type: "INTEGER", nullable: false),
                    FiscalYear = table.Column<int>(type: "INTEGER", nullable: false),
                    Period = table.Column<string>(type: "TEXT", nullable: false),
                    CommitmentId = table.Column<int>(type: "INTEGER", nullable: true),
                    InvoiceId = table.Column<int>(type: "INTEGER", nullable: true),
                    AmountCents = table.Column<long>(type: "INTEGER", nullable: false),
                    Date = table.Column<DateOnly>(type: "TEXT", nullable: false),
                    Description = table.Column<string>(type: "TEXT", nullable: true),
                    Consultant = table.Column<string>(type: "TEXT", nullable: true),
                    Source = table.Column<string>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Actuals", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Actuals_Commitments_CommitmentId",
                        column: x => x.CommitmentId,
                        principalTable: "Commitments",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_Actuals_Invoices_InvoiceId",
                        column: x => x.InvoiceId,
                        principalTable: "Invoices",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_Actuals_PaymentRefs_PaymentRefId",
                        column: x => x.PaymentRefId,
                        principalTable: "PaymentRefs",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "InvoiceLines",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    InvoiceId = table.Column<int>(type: "INTEGER", nullable: false),
                    PaymentRefId = table.Column<int>(type: "INTEGER", nullable: true),
                    Description = table.Column<string>(type: "TEXT", nullable: true),
                    ClaimedAmountCents = table.Column<long>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InvoiceLines", x => x.Id);
                    table.ForeignKey(
                        name: "FK_InvoiceLines_Invoices_InvoiceId",
                        column: x => x.InvoiceId,
                        principalTable: "Invoices",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_InvoiceLines_PaymentRefs_PaymentRefId",
                        column: x => x.PaymentRefId,
                        principalTable: "PaymentRefs",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateIndex(
                name: "IX_Actuals_CommitmentId",
                table: "Actuals",
                column: "CommitmentId");

            migrationBuilder.CreateIndex(
                name: "IX_Actuals_InvoiceId",
                table: "Actuals",
                column: "InvoiceId");

            migrationBuilder.CreateIndex(
                name: "IX_Actuals_PaymentRefId",
                table: "Actuals",
                column: "PaymentRefId");

            migrationBuilder.CreateIndex(
                name: "IX_Appropriations_PaymentRefId",
                table: "Appropriations",
                column: "PaymentRefId");

            migrationBuilder.CreateIndex(
                name: "IX_Commitments_PaymentRefId",
                table: "Commitments",
                column: "PaymentRefId");

            migrationBuilder.CreateIndex(
                name: "IX_ContractorRates_ContractorId",
                table: "ContractorRates",
                column: "ContractorId");

            migrationBuilder.CreateIndex(
                name: "IX_InvoiceLines_InvoiceId",
                table: "InvoiceLines",
                column: "InvoiceId");

            migrationBuilder.CreateIndex(
                name: "IX_InvoiceLines_PaymentRefId",
                table: "InvoiceLines",
                column: "PaymentRefId");

            migrationBuilder.CreateIndex(
                name: "IX_Invoices_PaymentRefId",
                table: "Invoices",
                column: "PaymentRefId");

            migrationBuilder.CreateIndex(
                name: "IX_PaymentRefs_FiscalYear_PaymentRefId",
                table: "PaymentRefs",
                columns: new[] { "FiscalYear", "PaymentRefId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_TaskmanCosts_PaymentRefId",
                table: "TaskmanCosts",
                column: "PaymentRefId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Actuals");

            migrationBuilder.DropTable(
                name: "Appropriations");

            migrationBuilder.DropTable(
                name: "ContractorRates");

            migrationBuilder.DropTable(
                name: "InvoiceLines");

            migrationBuilder.DropTable(
                name: "TaskmanCosts");

            migrationBuilder.DropTable(
                name: "TaskmanProjects");

            migrationBuilder.DropTable(
                name: "Commitments");

            migrationBuilder.DropTable(
                name: "Contractors");

            migrationBuilder.DropTable(
                name: "Invoices");

            migrationBuilder.DropTable(
                name: "PaymentRefs");

            migrationBuilder.DropTable(
                name: "FiscalYears");
        }
    }
}
