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

    const offset = (page - 1) * limit;
    const like = `%${q}%`;

    const searchSql = q
      ? Prisma.sql`AND (
          pd."name" ILIKE ${like}
          OR pd."brand" ILIKE ${like}
          OR pd."model" ILIKE ${like}
        )`
      : Prisma.sql``;

    const totalRows = await prisma.$queryRaw(
      Prisma.sql`
        SELECT COUNT(DISTINCT pd."id")::int AS total
        FROM "productDetail" pd
        JOIN "Stock" s
          ON lower(pd."size") = lower(s."size")
         AND lower(COALESCE(pd."brand", '')) = lower(s."mfg")
        WHERE pd."brand" IS NOT NULL
          AND pd."size" IS NOT NULL
          ${searchSql}
      `,
    );

    const total = Array.isArray(totalRows) && totalRows[0]?.total ? Number(totalRows[0].total) : 0;

    const items = await prisma.$queryRaw(
      Prisma.sql`
        SELECT
          pd.*,
          MIN(s."id") AS "stockId",
          MIN(s."price")::float8 AS "stockPrice",
          SUM(s."quantity")::int AS "stockQuantity"
        FROM "productDetail" pd
        JOIN "Stock" s
          ON lower(pd."size") = lower(s."size")
         AND lower(COALESCE(pd."brand", '')) = lower(s."mfg")
        WHERE pd."brand" IS NOT NULL
          AND pd."size" IS NOT NULL
          ${searchSql}
        GROUP BY pd."id"
        ORDER BY pd."createdAt" DESC
        LIMIT ${limit} OFFSET ${offset}
      `,
    );

    return res.status(200).json({
      items: Array.isArray(items) ? items : [],
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

