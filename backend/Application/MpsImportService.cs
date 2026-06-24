using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Spreadsheet;
using Microsoft.EntityFrameworkCore;
using Moneta.Api.Domain;
using Moneta.Api.Infrastructure;

namespace Moneta.Api.Application;

public record MpsImportResult(int FiscalYear, int MpsCodes, int Mappings, int Excluded, List<string> Warnings);

public interface IMpsImportService
{
    /// <summary>Import the "Codes to MPS" tab from an xlsx stream into MpsCodes + CategoryMpsMaps.</summary>
    Task<MpsImportResult> ImportCodesToMpsAsync(Stream xlsx, int fiscalYear, CancellationToken ct = default);
}

public class MpsImportService(MonetaDbContext db) : IMpsImportService
{
    private const string SheetName = "Codes to MPS";

    public async Task<MpsImportResult> ImportCodesToMpsAsync(Stream xlsx, int fiscalYear, CancellationToken ct = default)
    {
        var warnings = new List<string>();
        var rows = ReadSheet(xlsx, SheetName); // each row = string[4] (Project, Category, MPS, Note)

        // Clear existing rows for this fiscal year (re-import is idempotent)
        await db.CategoryMpsMaps.Where(m => m.FiscalYear == fiscalYear).ExecuteDeleteAsync(ct);
        await db.MpsCodes.Where(m => m.FiscalYear == fiscalYear).ExecuteDeleteAsync(ct);

        var distinctCodes = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var seenKeys = new HashSet<(string, string)>();
        int mapped = 0, excluded = 0;

        foreach (var r in rows.Skip(1)) // skip header
        {
            var project  = Cell(r, 0);
            var category = Cell(r, 1);
            var codeRaw  = Cell(r, 2);
            var note     = Cell(r, 3);

            if (string.IsNullOrEmpty(project)) continue;

            bool isExcluded = codeRaw.Equals("x", StringComparison.OrdinalIgnoreCase);
            string? code = isExcluded || string.IsNullOrEmpty(codeRaw) ? null : codeRaw;

            if (!string.IsNullOrEmpty(note))
                note = note.Replace("Bilbomatica", "Altia", StringComparison.OrdinalIgnoreCase);

            if (!seenKeys.Add((project, category)))
            {
                warnings.Add($"Duplicate mapping ({project}, {category}) — keeping the first.");
                continue;
            }

            db.CategoryMpsMaps.Add(new CategoryMpsMap
            {
                FiscalYear      = fiscalYear,
                TaskmanProject  = project,
                TaskmanCategory = category,
                MpsCode         = code,
                Excluded        = isExcluded,
                Note            = string.IsNullOrEmpty(note) ? null : note,
            });

            if (isExcluded) excluded++;
            else if (code is not null) { mapped++; distinctCodes.Add(code); }
        }

        foreach (var code in distinctCodes)
            db.MpsCodes.Add(new MpsCode { FiscalYear = fiscalYear, Code = code, Rollup = RollupOf(code) });

        await db.SaveChangesAsync(ct);
        return new MpsImportResult(fiscalYear, distinctCodes.Count, mapped, excluded, warnings);
    }

    private static string Cell(string?[] row, int i) => i < row.Length ? (row[i] ?? "").Trim() : "";

    /// <summary>Read a worksheet by name into rows of up to 4 string cells, resolving shared strings.</summary>
    private static List<string?[]> ReadSheet(Stream stream, string sheetName)
    {
        using var doc = SpreadsheetDocument.Open(stream, false);
        var wbPart = doc.WorkbookPart ?? throw new ArgumentException("Not a valid workbook.");
        var sheet = wbPart.Workbook.Descendants<Sheet>().FirstOrDefault(s => s.Name == sheetName)
                    ?? throw new ArgumentException($"Sheet '{sheetName}' not found.");
        var wsPart = (WorksheetPart)wbPart.GetPartById(sheet.Id!);
        var shared = wbPart.SharedStringTablePart?.SharedStringTable;

        var result = new List<string?[]>();
        foreach (var row in wsPart.Worksheet.Descendants<Row>())
        {
            var cells = new string?[4];
            foreach (var cell in row.Elements<Cell>())
            {
                int col = ColumnIndex(cell.CellReference?.Value);
                if (col < 0 || col >= 4) continue;
                cells[col] = ResolveValue(cell, shared);
            }
            result.Add(cells);
        }
        return result;
    }

    private static string? ResolveValue(Cell cell, SharedStringTable? shared)
    {
        var text = cell.CellValue?.InnerText;
        if (text is null) return cell.InnerText;
        if (cell.DataType?.Value == CellValues.SharedString && shared is not null
            && int.TryParse(text, out var idx))
            return shared.ElementAt(idx).InnerText;
        return text;
    }

    /// <summary>"C5" → 2 (zero-based column index from the cell reference letters).</summary>
    private static int ColumnIndex(string? cellRef)
    {
        if (string.IsNullOrEmpty(cellRef)) return -1;
        int col = 0;
        foreach (var ch in cellRef)
        {
            if (!char.IsLetter(ch)) break;
            col = col * 26 + (char.ToUpper(ch) - 'A' + 1);
        }
        return col - 1;
    }

    private static string? RollupOf(string code)
    {
        var parts = code.Split('.');
        return parts.Length == 3 ? $"{parts[0]}.{parts[1]}.0" : null;
    }
}
