using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Moneta.Api.Migrations
{
    /// <inheritdoc />
    public partial class InvoiceLineMpsSplit : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_InvoiceLines_PaymentRefs_PaymentRefId",
                table: "InvoiceLines");

            migrationBuilder.DropIndex(
                name: "IX_InvoiceLines_PaymentRefId",
                table: "InvoiceLines");

            migrationBuilder.DropColumn(
                name: "PaymentRefId",
                table: "InvoiceLines");

            migrationBuilder.RenameColumn(
                name: "Description",
                table: "InvoiceLines",
                newName: "MpsCode");

            migrationBuilder.RenameColumn(
                name: "ClaimedAmountCents",
                table: "InvoiceLines",
                newName: "AmountCents");

            migrationBuilder.AddColumn<decimal>(
                name: "Hours",
                table: "InvoiceLines",
                type: "TEXT",
                nullable: false,
                defaultValue: 0m);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Hours",
                table: "InvoiceLines");

            migrationBuilder.RenameColumn(
                name: "MpsCode",
                table: "InvoiceLines",
                newName: "Description");

            migrationBuilder.RenameColumn(
                name: "AmountCents",
                table: "InvoiceLines",
                newName: "ClaimedAmountCents");

            migrationBuilder.AddColumn<int>(
                name: "PaymentRefId",
                table: "InvoiceLines",
                type: "INTEGER",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_InvoiceLines_PaymentRefId",
                table: "InvoiceLines",
                column: "PaymentRefId");

            migrationBuilder.AddForeignKey(
                name: "FK_InvoiceLines_PaymentRefs_PaymentRefId",
                table: "InvoiceLines",
                column: "PaymentRefId",
                principalTable: "PaymentRefs",
                principalColumn: "Id");
        }
    }
}
