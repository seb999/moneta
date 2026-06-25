using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Moneta.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddCommitmentContractType : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ContractType",
                table: "Commitments",
                type: "TEXT",
                nullable: false,
                defaultValue: "TM");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ContractType",
                table: "Commitments");
        }
    }
}
