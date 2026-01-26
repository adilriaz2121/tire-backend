import { PrismaClient, Prisma } from '@prisma/client';
import csv from 'csv-parser';
import XLSX from 'xlsx';
import { Readable } from 'stream';

const prisma = new PrismaClient();

function isUuid(value) {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export const getStockMatchedProducts = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '12', 10), 1), 100);
    const q = (req.query.q || req.query.search || '').toString().trim();
    const brandParam = (req.query.brand || '').toString().trim();
    const sizeParam = (req.query.size || '').toString().trim();
    const vehicleMakeParam = (req.query.make || '').toString().trim();
    const vehicleModelParam = (req.query.model || '').toString().trim();
    const vehicleYearParam = (req.query.year || '').toString().trim();
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

    const vehicleMakeSql = vehicleMakeParam
      ? Prisma.sql`AND lower(p."make") = ${vehicleMakeParam.toLowerCase()}`
      : Prisma.sql``;

    const vehicleModelSql = vehicleModelParam
      ? Prisma.sql`AND lower(p."model") = ${vehicleModelParam.toLowerCase()}`
      : Prisma.sql``;

    const vehicleYearSql = vehicleYearParam
      ? Prisma.sql`AND p."year" = ${vehicleYearParam}`
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
            ? Prisma.sql`ORDER BY p."createdAt" ASC`
            : Prisma.sql`ORDER BY p."createdAt" DESC`;

    // Count total matched (respecting HAVING by using a subquery)
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
            ${vehicleMakeSql}
            ${vehicleModelSql}
            ${vehicleYearSql}
            ${searchSql}
            ${brandSql}
            ${sizeSql}
            ${speedSql}
            ${loadRangeSql}
            ${rimSizeSql}
            ${originSql}
            ${utqgSql}
          GROUP BY p."id"
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
          pd."id" AS "productDetailId",
          (ARRAY_AGG(s."id" ORDER BY s."price" ASC))[1] AS "stockId",
          MIN(s."price")::float8 AS "stockPrice",
          SUM(s."quantity")::int AS "stockQuantity",
          COALESCE(ra."reviewCount", 0)::int AS "reviewCount",
          COALESCE(ra."reviewAvgRaw", 0)::float8 AS "reviewAvgRaw",
          COALESCE(ra."buyAgainYes", 0)::int AS "buyAgainYes",
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
        LEFT JOIN review_agg ra
          ON ra.brand_l = lower(COALESCE(pd."brand", ''))
         AND ra.size_l = lower(COALESCE(pd."size", ''))
        WHERE p."mfg" IS NOT NULL
          AND p."size" IS NOT NULL
          ${vehicleMakeSql}
          ${vehicleModelSql}
          ${vehicleYearSql}
          ${searchSql}
          ${brandSql}
          ${sizeSql}
          ${speedSql}
          ${loadRangeSql}
          ${rimSizeSql}
          ${originSql}
          ${utqgSql}
        GROUP BY pd."id", p."id", ra."reviewCount", ra."reviewAvgRaw", ra."buyAgainYes"
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

// Product details by canonical Products.id (joins productDetail, Stock, and Reviews)
export const getProductDetailsById = async (req, res, next) => {
  try {
    const id = (req.params.id || '').toString().trim();
    if (!isUuid(id)) return res.status(400).json({ error: 'Invalid product id' });

    const product = await prisma.products.findUnique({
      where: { id },
      select: {
        id: true,
        make: true,
        model: true,
        year: true,
        trim: true,
        size: true,
        mfg: true,
        createdAt: true,
      },
    });

    if (!product) return res.status(404).json({ error: 'Product not found' });
    if (!product.size || !product.mfg) return res.status(404).json({ error: 'Product has no size/mfg' });

    const pd = await prisma.productDetail.findFirst({
      where: {
        size: { equals: product.size, mode: 'insensitive' },
        brand: { equals: product.mfg, mode: 'insensitive' },
      },
    });

    if (!pd) {
      return res.status(404).json({ error: 'Product details not found for this fitment' });
    }

    const stockAggRows = await prisma.$queryRaw(
      Prisma.sql`
        SELECT
          (ARRAY_AGG(s."id" ORDER BY s."price" ASC))[1] AS "stockId",
          MIN(s."price")::float8 AS "stockPrice",
          SUM(s."quantity")::int AS "stockQuantity"
        FROM "Stock" s
        WHERE lower(s."size") = lower(${product.size})
          AND lower(s."mfg") = lower(${product.mfg})
      `,
    );
    const stockAgg = Array.isArray(stockAggRows) ? stockAggRows[0] : null;

    // Reviews are keyed by size + brand (not by Products.id)
    const reviewBrand = (pd.brand || product.mfg || '').toString();
    const reviewSize = (pd.size || product.size || '').toString();

    // Only return overall review rating in this endpoint.
    // Full reviews + stats are fetched via GET /api/user/products/:productId/reviews
    const reviewSummaryRows = await prisma.$queryRaw(
      Prisma.sql`
        WITH scored AS (
          SELECT
            LEAST(
              5,
              GREATEST(
                1,
                ROUND(
                  (
                    COALESCE(r."Dry", 0)
                    + COALESCE(r."Wet", 0)
                    + COALESCE(r."Winter", 0)
                    + COALESCE(r."Comfort", 0)
                    + COALESCE(r."Noise", 0)
                    + COALESCE(r."Treadwear", 0)
                  ) / 6.0
                )::int
              )
            ) AS star
          FROM "Reviews" r
          WHERE lower(r."brand") = lower(${reviewBrand})
            AND lower(r."size") = lower(${reviewSize})
        )
        SELECT
          COUNT(*)::int AS "total",
          AVG(star::float8)::float8 AS "avg"
        FROM scored
      `,
    );
    const rs = Array.isArray(reviewSummaryRows) ? reviewSummaryRows[0] : null;
    const totalReviews = rs?.total ? Number(rs.total) : 0;
    const avg = rs?.avg ? Number(rs.avg) : 0;

    return res.status(200).json({
      product: {
        ...product,
        productDetail: pd,
        stock: {
          stockId: stockAgg?.stockId || null,
          stockPrice: stockAgg?.stockPrice ?? null,
          stockQuantity: stockAgg?.stockQuantity ?? null,
        },
      },
      reviews: { meta: { total: totalReviews, averageRating: avg } },
    });
  } catch (error) {
    return next(error);
  }
};

// Get cart products by product IDs
export const getCartProducts = async (req, res, next) => {
  try {
    const idsParam = req.query.ids || req.query.id;
    if (!idsParam) {
      return res.status(400).json({ error: 'Missing product IDs' });
    }

    // Handle both single ID and comma-separated IDs
    const ids = Array.isArray(idsParam)
      ? idsParam
      : typeof idsParam === 'string'
        ? idsParam.split(',').map(s => s.trim()).filter(Boolean)
        : [String(idsParam)];

    // Validate UUIDs
    const validIds = ids.filter(id => isUuid(id));
    if (validIds.length === 0) {
      return res.status(400).json({ error: 'No valid product IDs provided' });
    }

    // Fetch products
    const products = await prisma.products.findMany({
      where: {
        id: { in: validIds },
      },
      select: {
        id: true,
        size: true,
        mfg: true,
      },
    });

    if (products.length === 0) {
      return res.status(200).json({ items: [] });
    }

    // Get product details for each product
    const productDetails = await Promise.all(
      products.map(async (product) => {
        const pd = await prisma.productDetail.findFirst({
          where: {
            size: { equals: product.size, mode: 'insensitive' },
            brand: { equals: product.mfg, mode: 'insensitive' },
          },
        });

        if (!pd) return null;

        // Get stock info
        const stockAggRows = await prisma.$queryRaw(
          Prisma.sql`
            SELECT
              (ARRAY_AGG(s."id" ORDER BY s."price" ASC))[1] AS "stockId",
              MIN(s."price")::float8 AS "stockPrice",
              SUM(s."quantity")::int AS "stockQuantity"
            FROM "Stock" s
            WHERE lower(s."size") = lower(${product.size})
              AND lower(s."mfg") = lower(${product.mfg})
          `,
        );
        const stockAgg = Array.isArray(stockAggRows) ? stockAggRows[0] : null;

        return {
          id: product.id,
          productId: product.id,
          brand: pd.brand || product.mfg || null,
          model: pd.model || pd.name || null,
          name: pd.name || null,
          size: pd.size || product.size || null,
          images: Array.isArray(pd.images) ? pd.images : [],
          thumbnail_image: pd.thumbnail_image || null,
          stockPrice: stockAgg?.stockPrice ?? null,
          stockQuantity: stockAgg?.stockQuantity ?? null,
          stockId: stockAgg?.stockId || null,
        };
      })
    );

    const items = productDetails.filter(Boolean);

    return res.status(200).json({ items });
  } catch (error) {
    return next(error);
  }
};

