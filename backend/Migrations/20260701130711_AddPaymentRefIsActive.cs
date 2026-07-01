using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Moneta.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddPaymentRefIsActive : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsActive",
                table: "PaymentRefs",
                type: "INTEGER",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "IsActive",
                table: "PaymentRefs");
        }
    }
}
