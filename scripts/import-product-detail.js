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

function trimOrNull(value) {
    if (value === null || value === undefined) return null;
    const trimmed = String(value).trim();
    return trimmed === "" ? null : trimmed;
}

// Extract size from display_name (first part before space)
function extractSize(displayName) {
    if (!displayName) return "";
    const trimmed = String(displayName).trim();
    const parts = trimmed.split(" ");
    return parts[0] || "";
}

// Normalize row keys by trimming whitespace from column names
function normalizeRow(row) {
    const normalized = {};
    for (const key of Object.keys(row)) {
        normalized[key.trim()] = row[key];
    }
    return normalized;
}

async function importProductDetailData() {
    const filePath = path.join(__dirname, "../data/tires Autosync.xlsx");

    console.log("Reading Excel file:", filePath);
    console.log("This may take a while for large files...\n");

    try {
        // Delete all existing product details first
        console.log("Deleting all existing product details...");
        const deleted = await prisma.productDetail.deleteMany({});
        console.log(`Deleted ${deleted.count} existing product details\n`);

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
            const rowNum = i + 2;

            try {
                const display_name = trimValue(row["display_name"]);
                const size = extractSize(display_name);

                // Collect all available images
                const allImages = [
                    trimOrNull(row["thumbnail_image"]),
                    trimOrNull(row["angle_image"]),
                    trimOrNull(row["front_image"]),
                    trimOrNull(row["side_image"]),
                    trimOrNull(row["image_0301"]),
                    trimOrNull(row["image_0302"]),
                ].filter(Boolean);

                // Use thumbnail_image if available, otherwise use first available image
                const thumbnail_image = trimValue(row["thumbnail_image"]) || allImages[0] || "";

                // Images array excludes the thumbnail
                const images = allImages.filter(img => img !== thumbnail_image);

                // Check required fields
                const missingFields = [];
                if (!size) missingFields.push("size (from display_name)");
                if (!thumbnail_image) missingFields.push("thumbnail_image (no images available)");

                if (missingFields.length > 0) {
                    const errorMsg = `Row ${rowNum}: Missing required fields: ${missingFields.join(", ")}`;
                    errors.push(errorMsg);
                    skipped++;
                    continue;
                }

                batch.push({
                    brand: trimOrNull(row["brand"]),
                    model: trimOrNull(row["model"]),
                    name: trimOrNull(row["display_name"]),
                    loadRange: trimOrNull(row["load_range"]),
                    utqg: trimOrNull(row["utqg"]),
                    sidewall: trimOrNull(row["sidewall"]),
                    section_width: trimOrNull(row["section_width"]),
                    aspect_ratio: trimOrNull(row["aspect_ratio"]),
                    rim_size: trimOrNull(row["rim_size"]),
                    inch_width: trimOrNull(row["inch_width"]),
                    diameter: trimOrNull(row["diameter"]),
                    overall_diameter: trimOrNull(row["overall_diameter"]),
                    load_rating: trimOrNull(row["load_rating"]),
                    speed_rating: trimOrNull(row["speed_rating"]),
                    load_capacity_single: trimOrNull(row["load_capacity_single"]),
                    max_inflation_pressure: trimOrNull(row["max_inflation_pressure"]),
                    measuring_rim_width: trimOrNull(row["measuring_rim_width"]),
                    approved_rim_width_max: trimOrNull(row["approved_rim_width_max"]),
                    approved_rim_width_min: trimOrNull(row["approved_rim_width_min"]),
                    revolutions_per_mile: trimOrNull(row["revolutions_per_mile"]),
                    weight: trimOrNull(row["weight"]),
                    origin: trimOrNull(row["origin_country"]),
                    thumbnail_image,
                    images,
                    features: trimOrNull(row["features"]),
                    benefits: trimOrNull(row["benefits"]),
                    description: trimOrNull(row["description"]),
                    tags: trimOrNull(row["tags"]),
                    rim_protector: trimOrNull(row["rim_protector"]),
                    size,
                    tread_depth: trimOrNull(row["tread_depth"]),
                    overall_width: trimOrNull(row["overall_width"]),
                });

                if (batch.length >= BATCH_SIZE) {
                    await prisma.productDetail.createMany({
                        data: batch,
                        skipDuplicates: true,
                    });
                    imported += batch.length;
                    console.log(`Imported ${imported} / ${rows.length} records...`);
                    batch = [];
                }
            } catch (rowError) {
                const errorMsg = `Row ${rowNum}: ${rowError.message}`;
                errors.push(errorMsg);
                skipped++;
            }
        }

        if (batch.length > 0) {
            await prisma.productDetail.createMany({
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
        console.error("Error importing product detail data:", error);
        process.exitCode = 1;
    } finally {
        await prisma.$disconnect();
    }
}

importProductDetailData();
