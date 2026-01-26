import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
import XLSX from "xlsx";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

function trimValue(value) {
    if (value === null || value === undefined) return "";
    return String(value).trim();
}

async function importStockData() {
    const filePath = path.join(__dirname, "../data/usatiretd Warehouse.xlsx");

    console.log("Reading Excel file:", filePath);

    try {
        const workbook = XLSX.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet);

        console.log(`Found ${rows.length} rows to import`);

        let imported = 0;
        let skipped = 0;

        for (const row of rows) {
            try {
                const mfg = trimValue(row["Mfg"]);
                const item = trimValue(row["Item"]);
                const size = trimValue(row["Size"]);
                const description = trimValue(row["Description"]);
                const priceRaw = row["Price"];
                const fetRaw = trimValue(row["FET"]);
                const qtyRaw = row["Qty"];

                const price = parseFloat(priceRaw) || 0;
                const quantity = parseInt(qtyRaw, 10) || 0;
                const fet = fetRaw || "0";

                if (!mfg && !item && !size) {
                    skipped++;
                    continue;
                }

                await prisma.stock.create({
                    data: {
                        mfg,
                        item,
                        size,
                        description,
                        price,
                        quantity,
                        fet,
                    },
                });

                imported++;

                if (imported % 100 === 0) {
                    console.log(`Imported ${imported} records...`);
                }
            } catch (rowError) {
                console.error("Error importing row:", row, rowError.message);
                skipped++;
            }
        }

        console.log(`\nImport complete!`);
        console.log(`Successfully imported: ${imported}`);
        console.log(`Skipped: ${skipped}`);
    } catch (error) {
        console.error("Error importing stock data:", error);
        process.exitCode = 1;
    } finally {
        await prisma.$disconnect();
    }
}

importStockData();
