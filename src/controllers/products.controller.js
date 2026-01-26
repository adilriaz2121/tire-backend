import { PrismaClient, Prisma } from '@prisma/client';
import csv from 'csv-parser';
import XLSX from 'xlsx';
import { Readable } from 'stream';

const prisma = new PrismaClient();

export const getStockMatchedProducts = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '12', 10), 1), 100);
    const q = (req.query.q || req.query.search || '').toString().trim();
    const brandParam = (req.query.brand || '').toString().trim();
    const sizeParam = (req.query.size || '').toString().trim();
    const speedParam = (req.query.speedRating || req.query.speed_rating || '').toString().trim();
    const loadRangeParam = (req.query.loadRange || req.query.load_range || '').toString().trim();
    const rimSizeParam = (req.query.rimSize || req.query.rim_size || '').toString().trim();
    const originParam = (req.query.origin || '').toString().trim();
    const utqgParam = (req.query.utqg || '').toString().trim();
    const minPriceParam = req.query.minPrice ?? req.query.min_price ?? '';
    const maxPriceParam = req.query.maxPrice ?? req.query.max_price ?? '';
    const sort = (req.query.sort || 'newest').toString().trim(); // newest | oldest | price_asc | price_desc

    const brands = brandParam
      ? brandParam.split(',').map(s => s.trim()).filter(Boolean)
      : [];
    const sizes = sizeParam
      ? sizeParam.split(',').map(s => s.trim()).filter(Boolean)
      : [];
    const speedRatings = speedParam
      ? speedParam.split(',').map(s => s.trim()).filter(Boolean)
      : [];
    const loadRanges = loadRangeParam
      ? loadRangeParam.split(',').map(s => s.trim()).filter(Boolean)
      : [];
    const rimSizes = rimSizeParam
      ? rimSizeParam.split(',').map(s => s.trim()).filter(Boolean)
      : [];
    const origins = originParam
      ? originParam.split(',').map(s => s.trim()).filter(Boolean)
      : [];
    const utqgs = utqgParam
      ? utqgParam.split(',').map(s => s.trim()).filter(Boolean)
      : [];

    const minPrice = minPriceParam !== '' ? Number(minPriceParam) : null;
    const maxPrice = maxPriceParam !== '' ? Number(maxPriceParam) : null;

    const offset = (page - 1) * limit;
    const like = `%${q}%`;

    const searchSql = q
      ? Prisma.sql`AND (
          pd."name" ILIKE ${like}
          OR pd."brand" ILIKE ${like}
          OR pd."model" ILIKE ${like}
        )`
      : Prisma.sql``;

    const brandSql = brands.length
      ? Prisma.sql`AND lower(COALESCE(pd."brand", '')) IN (${Prisma.join(
          brands.map(b => Prisma.sql`${b.toLowerCase()}`),
        )})`
      : Prisma.sql``;

    const sizeSql = sizes.length
      ? Prisma.sql`AND lower(pd."size") IN (${Prisma.join(
          sizes.map(s => Prisma.sql`${s.toLowerCase()}`),
        )})`
      : Prisma.sql``;

    const speedSql = speedRatings.length
      ? Prisma.sql`AND lower(COALESCE(pd."speed_rating", '')) IN (${Prisma.join(
          speedRatings.map(s => Prisma.sql`${s.toLowerCase()}`),
        )})`
      : Prisma.sql``;

    const loadRangeSql = loadRanges.length
      ? Prisma.sql`AND lower(COALESCE(pd."loadRange", '')) IN (${Prisma.join(
          loadRanges.map(s => Prisma.sql`${s.toLowerCase()}`),
        )})`
      : Prisma.sql``;

    const rimSizeSql = rimSizes.length
      ? Prisma.sql`AND lower(COALESCE(pd."rim_size", '')) IN (${Prisma.join(
          rimSizes.map(s => Prisma.sql`${s.toLowerCase()}`),
        )})`
      : Prisma.sql``;

    const originSql = origins.length
      ? Prisma.sql`AND lower(COALESCE(pd."origin", '')) IN (${Prisma.join(
          origins.map(s => Prisma.sql`${s.toLowerCase()}`),
        )})`
      : Prisma.sql``;

    const utqgSql = utqgs.length
      ? Prisma.sql`AND lower(COALESCE(pd."utqg", '')) IN (${Prisma.join(
          utqgs.map(s => Prisma.sql`${s.toLowerCase()}`),
        )})`
      : Prisma.sql``;

    const havingSql =
      (Number.isFinite(minPrice) || Number.isFinite(maxPrice))
        ? Prisma.sql`HAVING
            (${Number.isFinite(minPrice) ? Prisma.sql`MIN(s."price") >= ${minPrice}` : Prisma.sql`TRUE`})
            AND
            (${Number.isFinite(maxPrice) ? Prisma.sql`MIN(s."price") <= ${maxPrice}` : Prisma.sql`TRUE`})`
        : Prisma.sql``;

    const orderSql =
      sort === 'price_asc'
        ? Prisma.sql`ORDER BY MIN(s."price") ASC`
        : sort === 'price_desc'
          ? Prisma.sql`ORDER BY MIN(s."price") DESC`
          : sort === 'oldest'
            ? Prisma.sql`ORDER BY pd."createdAt" ASC`
            : Prisma.sql`ORDER BY pd."createdAt" DESC`;

    // Count total matched (respecting HAVING by using a subquery)
    const totalRows = await prisma.$queryRaw(
      Prisma.sql`
        SELECT COUNT(*)::int AS total
        FROM (
          SELECT pd."id"
          FROM "productDetail" pd
          JOIN "Stock" s
            ON lower(pd."size") = lower(s."size")
           AND lower(COALESCE(pd."brand", '')) = lower(s."mfg")
          WHERE pd."brand" IS NOT NULL
            AND pd."size" IS NOT NULL
            ${searchSql}
            ${brandSql}
            ${sizeSql}
            ${speedSql}
            ${loadRangeSql}
            ${rimSizeSql}
            ${originSql}
            ${utqgSql}
          GROUP BY pd."id"
          ${havingSql}
        ) matched
      `,
    );

    const total = Array.isArray(totalRows) && totalRows[0]?.total ? Number(totalRows[0].total) : 0;

    const items = await prisma.$queryRaw(
      Prisma.sql`
        WITH review_agg AS (
          SELECT
            lower(COALESCE(r."brand", '')) AS brand_l,
            lower(COALESCE(r."size", '')) AS size_l,
            COUNT(*)::int AS "reviewCount",
            AVG((
              COALESCE(r."Dry", 0)
              + COALESCE(r."Wet", 0)
              + COALESCE(r."Winter", 0)
              + COALESCE(r."Comfort", 0)
              + COALESCE(r."Noise", 0)
              + COALESCE(r."Treadwear", 0)
            ) / 6.0)::float8 AS "reviewAvgRaw",
            SUM(CASE WHEN lower(COALESCE(r."wouldBuyAgain", '')) IN ('yes','y','true','1') THEN 1 ELSE 0 END)::int AS "buyAgainYes"
          FROM "Reviews" r
          GROUP BY 1, 2
        )
        SELECT
          pd.*,
          (ARRAY_AGG(s."id" ORDER BY s."price" ASC))[1] AS "stockId",
          MIN(s."price")::float8 AS "stockPrice",
          SUM(s."quantity")::int AS "stockQuantity",
          COALESCE(ra."reviewCount", 0)::int AS "reviewCount",
          COALESCE(ra."reviewAvgRaw", 0)::float8 AS "reviewAvgRaw",
          COALESCE(ra."buyAgainYes", 0)::int AS "buyAgainYes"
        FROM "productDetail" pd
        JOIN "Stock" s
          ON lower(pd."size") = lower(s."size")
         AND lower(COALESCE(pd."brand", '')) = lower(s."mfg")
        LEFT JOIN review_agg ra
          ON ra.brand_l = lower(COALESCE(pd."brand", ''))
         AND ra.size_l = lower(COALESCE(pd."size", ''))
        WHERE pd."brand" IS NOT NULL
          AND pd."size" IS NOT NULL
          ${searchSql}
          ${brandSql}
          ${sizeSql}
          ${speedSql}
          ${loadRangeSql}
          ${rimSizeSql}
          ${originSql}
          ${utqgSql}
        GROUP BY pd."id", ra."reviewCount", ra."reviewAvgRaw", ra."buyAgainYes"
        ${havingSql}
        ${orderSql}
        LIMIT ${limit} OFFSET ${offset}
      `,
    );

    // Light facets for filters (from current result set)
    const safeItems = Array.isArray(items) ? items : [];
    const facets = {
      brands: [...new Set(safeItems.map((x) => (x?.brand || '').toString()).filter(Boolean))].slice(0, 30),
      sizes: [...new Set(safeItems.map((x) => (x?.size || '').toString()).filter(Boolean))].slice(0, 30),
      speedRatings: [...new Set(safeItems.map((x) => (x?.speed_rating || '').toString()).filter(Boolean))].slice(0, 30),
      loadRanges: [...new Set(safeItems.map((x) => (x?.loadRange || '').toString()).filter(Boolean))].slice(0, 30),
      rimSizes: [...new Set(safeItems.map((x) => (x?.rim_size || '').toString()).filter(Boolean))].slice(0, 30),
      origins: [...new Set(safeItems.map((x) => (x?.origin || '').toString()).filter(Boolean))].slice(0, 30),
      utqg: [...new Set(safeItems.map((x) => (x?.utqg || '').toString()).filter(Boolean))].slice(0, 30),
    };

    return res.status(200).json({
      items: safeItems,
      facets,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (error) {
    return next(error);
  }
};

