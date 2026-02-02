/**
 * Generates filter-options.json from the database (productDetail + stocked catalog).
 * Run: node ./scripts/generate-filter-options.js
 * Output: data/filter-options.json (served at GET /api/user/filter-options).
 */
import { PrismaClient } from '@prisma/client';
import { writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

const DATA_DIR = path.resolve(__dirname, '..', 'data');
const OUTPUT_FILE = path.join(DATA_DIR, 'filter-options.json');

async function getDistinct(column) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT DISTINCT "${column}" AS value FROM "productDetail" WHERE "${column}" IS NOT NULL AND TRIM("${column}") != '' ORDER BY value ASC`
  );
  return (rows || []).map((r) => String(r?.value ?? '').trim()).filter(Boolean);
}

async function main() {
  console.log('Generating filter options from DB...');

  const [brands, sizes, speedRatings, loadRanges, rimSizes, origins, utqg] = await Promise.all([
    getDistinct('brand'),
    getDistinct('size'),
    getDistinct('speed_rating'),
    getDistinct('loadRange'),
    getDistinct('rim_size'),
    getDistinct('origin'),
    getDistinct('utqg'),
  ]);

  const payload = {
    brands: brands.sort((a, b) => a.localeCompare(b)),
    sizes: sizes.sort((a, b) => a.localeCompare(b)),
    speedRatings: speedRatings.sort((a, b) => a.localeCompare(b)),
    loadRanges: loadRanges.sort((a, b) => a.localeCompare(b)),
    rimSizes: rimSizes.sort((a, b) => a.localeCompare(b)),
    origins: origins.sort((a, b) => a.localeCompare(b)),
    utqg: utqg.sort((a, b) => a.localeCompare(b)),
    _generatedAt: new Date().toISOString(),
  };

  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(OUTPUT_FILE, JSON.stringify(payload, null, 2), 'utf8');

  console.log('Written:', OUTPUT_FILE);
  console.log('Counts:', {
    brands: payload.brands.length,
    sizes: payload.sizes.length,
    speedRatings: payload.speedRatings.length,
    loadRanges: payload.loadRanges.length,
    rimSizes: payload.rimSizes.length,
    origins: payload.origins.length,
    utqg: payload.utqg.length,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
