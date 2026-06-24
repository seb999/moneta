using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Moneta.Api.Migrations
{
    /// <inheritdoc />
    public partial class TaskmanCostMps : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "MpsCode",
                table: "TaskmanCosts",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "MpsStatus",
                table: "TaskmanCosts",
                type: "TEXT",
                nullable: false,
                defaultValue: "");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "MpsCode",
                table: "TaskmanCosts");

            migrationBuilder.DropColumn(
                name: "MpsStatus",
                table: "TaskmanCosts");
        }
    }
}
