import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

// Simple in-memory cache for fitment lookups (avoid repeated DISTINCT scans)
const FITMENT_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const fitmentCache = new Map(); // key -> { exp, value }

function cacheGet(key) {
    const hit = fitmentCache.get(key);
    if (!hit) return null;
    if (Date.now() > hit.exp) {
        fitmentCache.delete(key);
        return null;
    }
    return hit.value;
}

function cacheSet(key, value) {
    fitmentCache.set(key, { exp: Date.now() + FITMENT_CACHE_TTL_MS, value });
}

function norm(s) {
    return String(s || '').trim().toLowerCase();
}


// Paginated stocked products filtered by vehicle fitment (make/year/model) + size
export const getFilteredProducts = async (req, res, next) => {
    try {
        const page = Math.max(parseInt(req.query.page || '1', 10), 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit || '12', 10), 1), 100);
        const company = (req.query.company || req.query.make || '').toString().trim();
        const model = (req.query.model || '').toString().trim();
        const year = (req.query.year || '').toString().trim();
        const size = (req.query.size || '').toString().trim();

        const offset = (page - 1) * limit;

        // Determine size filter: if it's a rim diameter like "16" or "17", treat it as ends-with match
        const isRimOnly = Boolean(size) && /^\d{2,3}$/.test(size);

        const makeSql = company ? Prisma.sql`AND lower(p."make") = ${company.toLowerCase()}` : Prisma.sql``;
        const yearSql = year ? Prisma.sql`AND p."year" = ${year}` : Prisma.sql``;
        const modelSql = model ? Prisma.sql`AND lower(p."model") = ${model.toLowerCase()}` : Prisma.sql``;

        const sizeSql = size
            ? (isRimOnly
                ? Prisma.sql`AND lower(p."size") LIKE ${`%${size.toLowerCase()}`}`
                : Prisma.sql`AND lower(p."size") = ${size.toLowerCase()}`)
            : Prisma.sql``;

        // Count
        const totalRows = await prisma.$queryRaw(
            Prisma.sql`
                SELECT COUNT(*)::int AS total
                FROM (
                    SELECT p."id"
                    FROM "Products" p
                    JOIN "productDetail" pd
                      ON lower(pd."size") = lower(p."size")
                     AND lower(COALESCE(pd."brand", '')) = lower(p."mfg")
                    JOIN "Stock" s
                      ON lower(p."size") = lower(s."size")
                     AND lower(p."mfg") = lower(s."mfg")
                    WHERE p."mfg" IS NOT NULL
                      AND p."size" IS NOT NULL
                      ${makeSql}
                      ${yearSql}
                      ${modelSql}
                      ${sizeSql}
                    GROUP BY p."id"
                ) matched
            `,
        );
        const total = Array.isArray(totalRows) && totalRows[0]?.total ? Number(totalRows[0].total) : 0;

        const items = await prisma.$queryRaw(
            Prisma.sql`
                SELECT
                  pd.*,
                  pd."id" AS "productDetailId",
                  (ARRAY_AGG(s."id" ORDER BY s."price" ASC))[1] AS "stockId",
                  MIN(s."price")::float8 AS "stockPrice",
                  SUM(s."quantity")::int AS "stockQuantity",
                  p."id" AS "id",
                  p."make" AS "vehicleMake",
                  p."model" AS "vehicleModel",
                  p."year" AS "vehicleYear",
                  p."trim" AS "vehicleTrim",
                  p."mfg" AS "vehicleMfg"
                FROM "Products" p
                JOIN "productDetail" pd
                  ON lower(pd."size") = lower(p."size")
                 AND lower(COALESCE(pd."brand", '')) = lower(p."mfg")
                JOIN "Stock" s
                  ON lower(p."size") = lower(s."size")
                 AND lower(p."mfg") = lower(s."mfg")
                WHERE p."mfg" IS NOT NULL
                  AND p."size" IS NOT NULL
                  ${makeSql}
                  ${yearSql}
                  ${modelSql}
                  ${sizeSql}
                GROUP BY pd."id", p."id"
                ORDER BY p."createdAt" DESC
                LIMIT ${limit} OFFSET ${offset}
            `,
        );

        return res.status(200).json({
            items: Array.isArray(items) ? items : [],
            meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 }
        });
    } catch (error) {
        return next(error);
    }
};

// Sizes flow: step 1 returns all unique sizes, step 2 returns sizes ending with provided rim (e.g., "16")
export const getSizeOptions = async (req, res, next) => {
    try {
        const step = Math.max(parseInt((req.query.step || '1'), 10), 1);
        const rim = (req.query.rim || req.query.end || '').toString().trim();

        if (Number.isNaN(step) || step < 1 || step > 2) {
            return res.status(400).json({ error: 'Invalid step. Must be 1-2.' });
        }

        if (step === 1) {
            const key = `sizes:step1`;
            const cached = cacheGet(key);
            if (cached) return res.status(200).json({ step, sizes: cached });

            const rows = await prisma.$queryRaw(
                Prisma.sql`
                    SELECT DISTINCT p."size" AS size
                    FROM "Products" p
                    WHERE p."size" IS NOT NULL
                    ORDER BY p."size" ASC
                    LIMIT 2000
                `,
            );
            const sizes = Array.isArray(rows) ? rows.map((r) => String(r.size)).filter(Boolean) : [];
            cacheSet(key, sizes);
            return res.status(200).json({ step, sizes });
        }

        // step 2
        if (!rim) {
            return res.status(400).json({ error: 'rim is required for step 2' });
        }

        const rimNorm = norm(rim);
        const key = `sizes:step2:${rimNorm}`;
        const cached = cacheGet(key);
        if (cached) return res.status(200).json({ step, rim, sizes: cached });

        const like = `%${rimNorm}`;
        const rows = await prisma.$queryRaw(
            Prisma.sql`
                SELECT DISTINCT p."size" AS size
                FROM "Products" p
                WHERE p."size" IS NOT NULL
                  AND lower(p."size") LIKE ${like}
                ORDER BY p."size" ASC
                LIMIT 500
            `,
        );
        const sizes = Array.isArray(rows) ? rows.map((r) => String(r.size)).filter(Boolean) : [];
        cacheSet(key, sizes);
        return res.status(200).json({ step, rim, sizes });
    } catch (error) {
        return next(error);
    }
};

export const getFitment = async (req, res, next) => {
    try {
        const step = parseInt((req.query.step || '1'), 10);
        const company = (req.query.company || req.query.make || '').toString().trim();
        const year = (req.query.year || '').toString().trim();
        const model = (req.query.model || '').toString().trim();

        if (Number.isNaN(step) || step < 1 || step > 4) {
            return res.status(400).json({ error: 'Invalid step. Must be 1-4.' });
        }

        if (step === 1) {
            const key = `fitment:step1:makes`;
            const cached = cacheGet(key);
            if (cached) return res.status(200).json({ step, companies: cached });

            const rows = await prisma.$queryRaw(
                Prisma.sql`
                    SELECT DISTINCT p."make" AS make
                    FROM "Products" p
                    WHERE p."make" IS NOT NULL
                    ORDER BY p."make" ASC
                    LIMIT 500
                `,
            );
            const companies = Array.isArray(rows) ? rows.map((r) => String(r.make)).filter(Boolean) : [];
            cacheSet(key, companies);
            return res.status(200).json({ step, companies });
        }

        if (step === 2) {
            if (!company) {
                return res.status(400).json({ error: 'company is required for step 2' });
            }
            const makeNorm = norm(company);
            const key = `fitment:step2:years:${makeNorm}`;
            const cached = cacheGet(key);
            if (cached) return res.status(200).json({ step, company, years: cached });

            const rows = await prisma.$queryRaw(
                Prisma.sql`
                    SELECT DISTINCT p."year" AS year
                    FROM "Products" p
                    WHERE p."year" IS NOT NULL
                      AND lower(p."make") = ${makeNorm}
                    ORDER BY p."year" DESC
                    LIMIT 200
                `,
            );
            const years = Array.isArray(rows) ? rows.map((r) => String(r.year)).filter(Boolean) : [];
            cacheSet(key, years);
            return res.status(200).json({ step, company, years });
        }

        if (step === 3) {
            if (!company || !year) {
                return res.status(400).json({ error: 'company and year are required for step 3' });
            }
            const makeNorm = norm(company);
            const yearNorm = String(year).trim();
            const key = `fitment:step3:models:${makeNorm}:${yearNorm}`;
            const cached = cacheGet(key);
            if (cached) return res.status(200).json({ step, company, year, models: cached });

            const rows = await prisma.$queryRaw(
                Prisma.sql`
                    SELECT DISTINCT p."model" AS model
                    FROM "Products" p
                    WHERE p."model" IS NOT NULL
                      AND lower(p."make") = ${makeNorm}
                      AND p."year" = ${yearNorm}
                    ORDER BY p."model" ASC
                    LIMIT 500
                `,
            );
            const models = Array.isArray(rows) ? rows.map((r) => String(r.model)).filter(Boolean) : [];
            cacheSet(key, models);
            return res.status(200).json({ step, company, year, models });
        }

        // step 4
        if (!company || !year || !model) {
            return res.status(400).json({ error: 'company, year and model are required for step 4' });
        }
        const makeNorm = norm(company);
        const yearNorm = String(year).trim();
        const modelNorm = norm(model);
        const key = `fitment:step4:sizes:${makeNorm}:${yearNorm}:${modelNorm}`;
        const cached = cacheGet(key);
        if (cached) return res.status(200).json({ step, company, year, model, sizes: cached });

        const rows = await prisma.$queryRaw(
            Prisma.sql`
                SELECT DISTINCT p."size" AS size
                FROM "Products" p
                WHERE p."size" IS NOT NULL
                  AND lower(p."make") = ${makeNorm}
                  AND p."year" = ${yearNorm}
                  AND lower(p."model") = ${modelNorm}
                ORDER BY p."size" ASC
                LIMIT 200
            `,
        );
        const sizes = Array.isArray(rows) ? rows.map((r) => String(r.size)).filter(Boolean) : [];
        cacheSet(key, sizes);
        return res.status(200).json({ step, company, year, model, sizes });
    } catch (error) {
        return next(error);
    }
};

