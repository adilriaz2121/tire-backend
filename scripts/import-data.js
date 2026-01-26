import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
import XLSX from "xlsx";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

const BATCH_SIZE = 1000;

function trimValue(value) {
    if (value === null || value === undefined) return "";
    return String(value).trim();
}

// Normalize row keys by trimming whitespace from column names
function normalizeRow(row) {
    const normalized = {};
    for (const key of Object.keys(row)) {
        normalized[key.trim()] = row[key];
    }
    return normalized;
}

async function importProductData() {
    const filePath = path.join(__dirname, "../data/merged_flexiblel (Our).xlsx");

    console.log("Reading Excel file:", filePath);
    console.log("This may take a while for large files...\n");

    try {
        // Delete all existing products first
        console.log("Deleting all existing products...");
        const deleted = await prisma.products.deleteMany({});
        console.log(`Deleted ${deleted.count} existing products\n`);

        const workbook = XLSX.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet);

        console.log(`Found ${rows.length} rows to import`);

        // Log available columns from first row
        if (rows.length > 0) {
            console.log("Available columns:", Object.keys(rows[0]).join(", "));
        }

        let imported = 0;
        let skipped = 0;
        let errors = [];
        let batch = [];

        for (let i = 0; i < rows.length; i++) {
            const row = normalizeRow(rows[i]);
            const rowNum = i + 2; // +2 because Excel is 1-indexed and has header row

            try {
                const make = trimValue(row["Make"]);
                const model = trimValue(row["Model"]);
                const year = trimValue(row["Year"]);
                const trim = trimValue(row["Trim"]);
                const size = trimValue(row["Size"]);
                const mfg = trimValue(row["Mfg"]);
                const description = trimValue(row["Description"]);
                const detail = trimValue(row["desc"]);

                // Check for missing fields
                const missingFields = [];
                if (!make) missingFields.push("Make");
                if (!model) missingFields.push("Model");
                if (!year) missingFields.push("Year");
                if (!trim) missingFields.push("Trim");
                if (!size) missingFields.push("Size");
                if (!mfg) missingFields.push("Mfg");
                if (!description) missingFields.push("Description");
                if (!detail) missingFields.push("desc");

                if (missingFields.length > 0) {
                    const errorMsg = `Row ${rowNum}: Missing fields: ${missingFields.join(", ")} | Data: ${JSON.stringify(row)}`;
                    errors.push(errorMsg);
                    skipped++;
                    continue;
                }

                batch.push({
                    make,
                    model,
                    year,
                    trim,
                    size,
                    mfg,
                    description,
                    detail,
                });

                if (batch.length >= BATCH_SIZE) {
                    await prisma.products.createMany({
                        data: batch,
                        skipDuplicates: true,
                    });
                    imported += batch.length;
                    console.log(`Imported ${imported} / ${rows.length} records...`);
                    batch = [];
                }
            } catch (rowError) {
                const errorMsg = `Row ${rowNum}: ${rowError.message} | Data: ${JSON.stringify(row)}`;
                errors.push(errorMsg);
                skipped++;
            }
        }

        if (batch.length > 0) {
            await prisma.products.createMany({
                data: batch,
                skipDuplicates: true,
            });
            imported += batch.length;
        }

        console.log(`\nImport complete!`);
        console.log(`Successfully imported: ${imported}`);
        console.log(`Skipped with errors: ${skipped}`);

        if (errors.length > 0) {
            console.log(`\n--- ERRORS (first 50) ---`);
            errors.slice(0, 50).forEach((err) => console.error(err));
            if (errors.length > 50) {
                console.log(`... and ${errors.length - 50} more errors`);
            }
        }
    } catch (error) {
        console.error("Error importing product data:", error);
        process.exitCode = 1;
    } finally {
        await prisma.$disconnect();
    }
}

importProductData();
