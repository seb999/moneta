using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Moneta.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddInvoiceClaimLines : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "InvoiceClaimLines",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    InvoiceId = table.Column<int>(type: "INTEGER", nullable: false),
                    Developer = table.Column<string>(type: "TEXT", nullable: false),
                    Hours = table.Column<decimal>(type: "TEXT", nullable: true),
                    AmountCents = table.Column<long>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InvoiceClaimLines", x => x.Id);
                    table.ForeignKey(
                        name: "FK_InvoiceClaimLines_Invoices_InvoiceId",
                        column: x => x.InvoiceId,
                        principalTable: "Invoices",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_InvoiceClaimLines_InvoiceId",
                table: "InvoiceClaimLines",
                column: "InvoiceId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "InvoiceClaimLines");
        }
    }
}
