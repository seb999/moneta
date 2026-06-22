using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Moneta.Api.Migrations
{
    /// <inheritdoc />
    public partial class RateCardModel : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ContractorRates");

            migrationBuilder.AddColumn<int>(
                name: "TaskmanUserId",
                table: "TaskmanCosts",
                type: "INTEGER",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Profile",
                table: "Contractors",
                type: "TEXT",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "RateCards",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    Company = table.Column<string>(type: "TEXT", nullable: false),
                    Profile = table.Column<string>(type: "TEXT", nullable: false),
                    DailyRateCents = table.Column<long>(type: "INTEGER", nullable: false),
                    IntraMurosRateCents = table.Column<long>(type: "INTEGER", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RateCards", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_RateCards_Company_Profile",
                table: "RateCards",
                columns: new[] { "Company", "Profile" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "RateCards");

            migrationBuilder.DropColumn(
                name: "TaskmanUserId",
                table: "TaskmanCosts");

            migrationBuilder.DropColumn(
                name: "Profile",
                table: "Contractors");

            migrationBuilder.CreateTable(
                name: "ContractorRates",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    ContractorId = table.Column<int>(type: "INTEGER", nullable: false),
                    DailyRateCents = table.Column<long>(type: "INTEGER", nullable: false),
                    IntraMurosRateCents = table.Column<long>(type: "INTEGER", nullable: true)
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

            migrationBuilder.CreateIndex(
                name: "IX_ContractorRates_ContractorId",
                table: "ContractorRates",
                column: "ContractorId");
        }
    }
}
