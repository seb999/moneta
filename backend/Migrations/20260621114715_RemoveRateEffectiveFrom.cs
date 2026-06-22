using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Moneta.Api.Migrations
{
    /// <inheritdoc />
    public partial class RemoveRateEffectiveFrom : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "EffectiveFrom",
                table: "ContractorRates");

            migrationBuilder.DropColumn(
                name: "Profile",
                table: "ContractorRates");

            migrationBuilder.DropColumn(
                name: "TaskmanProjectId",
                table: "ContractorRates");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateOnly>(
                name: "EffectiveFrom",
                table: "ContractorRates",
                type: "TEXT",
                nullable: false,
                defaultValue: new DateOnly(1, 1, 1));

            migrationBuilder.AddColumn<string>(
                name: "Profile",
                table: "ContractorRates",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "TaskmanProjectId",
                table: "ContractorRates",
                type: "INTEGER",
                nullable: true);
        }
    }
}
