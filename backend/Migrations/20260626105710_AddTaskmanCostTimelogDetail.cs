using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Moneta.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddTaskmanCostTimelogDetail : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Activity",
                table: "TaskmanCosts",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Comment",
                table: "TaskmanCosts",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<DateOnly>(
                name: "EntryDate",
                table: "TaskmanCosts",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "IssueId",
                table: "TaskmanCosts",
                type: "INTEGER",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "IssueSubject",
                table: "TaskmanCosts",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PaymentClass",
                table: "TaskmanCosts",
                type: "TEXT",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Activity",
                table: "TaskmanCosts");

            migrationBuilder.DropColumn(
                name: "Comment",
                table: "TaskmanCosts");

            migrationBuilder.DropColumn(
                name: "EntryDate",
                table: "TaskmanCosts");

            migrationBuilder.DropColumn(
                name: "IssueId",
                table: "TaskmanCosts");

            migrationBuilder.DropColumn(
                name: "IssueSubject",
                table: "TaskmanCosts");

            migrationBuilder.DropColumn(
                name: "PaymentClass",
                table: "TaskmanCosts");
        }
    }
}
