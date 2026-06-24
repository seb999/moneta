using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Moneta.Api.Migrations
{
    /// <inheritdoc />
    public partial class MpsReferenceData : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "CategoryMpsMaps",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    FiscalYear = table.Column<int>(type: "INTEGER", nullable: false),
                    TaskmanProject = table.Column<string>(type: "TEXT", nullable: false),
                    TaskmanCategory = table.Column<string>(type: "TEXT", nullable: false),
                    MpsCode = table.Column<string>(type: "TEXT", nullable: true),
                    Excluded = table.Column<bool>(type: "INTEGER", nullable: false),
                    Note = table.Column<string>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CategoryMpsMaps", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "MpsCodes",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    FiscalYear = table.Column<int>(type: "INTEGER", nullable: false),
                    Code = table.Column<string>(type: "TEXT", nullable: false),
                    Label = table.Column<string>(type: "TEXT", nullable: true),
                    Rollup = table.Column<string>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MpsCodes", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CategoryMpsMaps_FiscalYear_TaskmanProject_TaskmanCategory",
                table: "CategoryMpsMaps",
                columns: new[] { "FiscalYear", "TaskmanProject", "TaskmanCategory" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_MpsCodes_FiscalYear_Code",
                table: "MpsCodes",
                columns: new[] { "FiscalYear", "Code" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CategoryMpsMaps");

            migrationBuilder.DropTable(
                name: "MpsCodes");
        }
    }
}
