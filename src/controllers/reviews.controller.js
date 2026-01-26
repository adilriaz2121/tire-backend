import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function isUuid(value) {
    return typeof value === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export const createReview = async (req, res, next) => {
    try {
        const body = req.body || {};
        const productId = (body.productId || body.productsId || body.product || '').toString().trim();
        if (!isUuid(productId)) return res.status(400).json({ error: "Invalid product id" });

        const Dry = Number(body.Dry);
        const Wet = Number(body.Wet);
        const Winter = Number(body.Winter);
        const Comfort = Number(body.Comfort);
        const Noise = Number(body.Noise);
        const Treadwear = Number(body.Treadwear);

        const name = (body.name || '').toString().trim();
        const email = (body.email || '').toString().trim();
        const purchaseDateRaw = body.purchaseDate;
        const vehicle = (body.vehicle || '').toString().trim();
        const milesDriven = (body.milesDriven || '').toString().trim();
        const drivingStyle = (body.drivingStyle || '').toString().trim();
        const wouldBuyAgain = (body.wouldBuyAgain || '').toString().trim();
        const summary = body.summary != null ? String(body.summary) : null;
        const additionalComments = body.additionalComments != null ? String(body.additionalComments) : null;

        const clampStars = (n) => {
            const v = Number(n);
            if (!Number.isFinite(v)) return null;
            const r = Math.round(v);
            return Math.max(1, Math.min(5, r));
        };

        const stars = {
            Dry: clampStars(Dry),
            Wet: clampStars(Wet),
            Winter: clampStars(Winter),
            Comfort: clampStars(Comfort),
            Noise: clampStars(Noise),
            Treadwear: clampStars(Treadwear),
        };

        if (!name || !email || !purchaseDateRaw || !vehicle || !milesDriven || !drivingStyle || !wouldBuyAgain) {
            return res.status(400).json({ error: "Missing required fields" });
        }
        if (Object.values(stars).some((v) => v == null)) {
            return res.status(400).json({ error: "All rating categories are required (1-5)" });
        }

        const purchaseDate = new Date(purchaseDateRaw);
        if (!purchaseDate || Number.isNaN(purchaseDate.getTime())) {
            return res.status(400).json({ error: "Invalid purchaseDate" });
        }

        const product = await prisma.products.findUnique({ where: { id: productId }, select: { id: true, size: true, mfg: true } });
        if (!product) return res.status(404).json({ error: "Product not found" });
        if (!product.size || !product.mfg) return res.status(400).json({ error: "Product has no size/mfg" });

        const pd = await prisma.productDetail.findFirst({
            where: {
                size: { equals: product.size, mode: 'insensitive' },
                brand: { equals: product.mfg, mode: 'insensitive' },
            },
            select: { brand: true, size: true }
        });

        const reviewRecord = await prisma.reviews.create({
            data: {
                ...stars,
                size: (pd?.size || product.size).toString(),
                brand: (pd?.brand || product.mfg).toString(),
                summary,
                additionalComments,
                name,
                email,
                purchaseDate,
                vehicle,
                milesDriven,
                drivingStyle,
                wouldBuyAgain,
            }
        });

        return res.status(201).json({
            success: true,
            message: "Review submitted successfully",
            review: reviewRecord
        });
    } catch (error) {
        return next(error);
    }
};

export const getAllReviews = async (req, res, next) => {
    try {
        const page = Math.max(parseInt(req.query.page || '1', 10), 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit || '10', 10), 1), 100);
        const search = (req.query.q || '').toString().trim();

        const where = {
            ...(search && {
                OR: [
                    { name: { contains: search, mode: 'insensitive' } },
                    { summary: { contains: search, mode: 'insensitive' } },
                    { additionalComments: { contains: search, mode: 'insensitive' } },
                    { brand: { contains: search, mode: 'insensitive' } },
                    { size: { contains: search, mode: 'insensitive' } },
                ],
            }),
        };

        const [items, total] = await Promise.all([
            prisma.reviews.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
            prisma.reviews.count({ where })
        ]);

        return res.status(200).json({
            items,
            meta: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit) || 1
            }
        });
    } catch (error) {
        return next(error);
    }
};

export const getReview = async (req, res, next) => {
    try {
        const { id } = req.params;
        if (!isUuid(id)) return res.status(400).json({ error: 'Invalid review id' });
        const review = await prisma.reviews.findUnique({ where: { id } });
        
        if (!review) {
            return res.status(404).json({ error: 'Review not found' });
        }
        
        return res.status(200).json({ review });
    } catch (error) {
        return next(error);
    }
};

export const updateReview = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, country, review, rating } = req.body;

        if (rating && (rating < 1 || rating > 5)) {
            return res.status(400).json({ error: "Rating must be between 1 and 5" });
        }

        const reviewRecord = await prisma.reviews.update({
            where: { id },
            data: {
                name,
                country,
                review,
                rating
            }
        });

        return res.status(200).json({ review: reviewRecord });
    } catch (error) {
        return next(error);
    }
};

export const deleteReview = async (req, res, next) => {
    try {
        const { id } = req.params;
        await prisma.reviews.delete({ where: { id } });
        return res.status(204).send();
    } catch (error) {
        return next(error);
    }
};

export const getProductReviews = async (req, res, next) => {
    try {
        const { productId } = req.params;
        const id = (productId || '').toString().trim();
        if (!isUuid(id)) return res.status(400).json({ error: 'Invalid product id' });

        const page = Math.max(parseInt(req.query.page || '1', 10), 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit || '10', 10), 1), 50);
        const offset = (page - 1) * limit;

        const product = await prisma.products.findUnique({
            where: { id },
            select: { id: true, size: true, mfg: true }
        });
        if (!product) return res.status(404).json({ error: 'Product not found' });
        if (!product.size || !product.mfg) return res.status(404).json({ error: 'Product has no size/mfg' });

        const pd = await prisma.productDetail.findFirst({
            where: {
                size: { equals: product.size, mode: 'insensitive' },
                brand: { equals: product.mfg, mode: 'insensitive' },
            },
            select: { brand: true, size: true }
        });
        if (!pd) return res.status(404).json({ error: 'Product details not found for this fitment' });

        const reviewBrand = (pd.brand || product.mfg || '').toString();
        const reviewSize = (pd.size || product.size || '').toString();

        const reviewStatsRows = await prisma.$queryRaw`
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
                    ) AS star,
                    lower(COALESCE(r."wouldBuyAgain", '')) AS wba,
                    r."Dry"::float8 AS "Dry",
                    r."Wet"::float8 AS "Wet",
                    r."Winter"::float8 AS "Winter",
                    r."Comfort"::float8 AS "Comfort",
                    r."Noise"::float8 AS "Noise",
                    r."Treadwear"::float8 AS "Treadwear"
                FROM "Reviews" r
                WHERE lower(r."brand") = lower(${reviewBrand})
                    AND lower(r."size") = lower(${reviewSize})
            )
            SELECT
                COUNT(*)::int AS "total",
                AVG(star::float8)::float8 AS "avg",
                SUM(CASE WHEN star = 5 THEN 1 ELSE 0 END)::int AS "s5",
                SUM(CASE WHEN star = 4 THEN 1 ELSE 0 END)::int AS "s4",
                SUM(CASE WHEN star = 3 THEN 1 ELSE 0 END)::int AS "s3",
                SUM(CASE WHEN star = 2 THEN 1 ELSE 0 END)::int AS "s2",
                SUM(CASE WHEN star = 1 THEN 1 ELSE 0 END)::int AS "s1",
                SUM(CASE WHEN wba IN ('yes','y','true','1') THEN 1 ELSE 0 END)::int AS "buyAgainYes",
                AVG("Dry")::float8 AS "dryAvg",
                AVG("Wet")::float8 AS "wetAvg",
                AVG("Winter")::float8 AS "winterAvg",
                AVG("Comfort")::float8 AS "comfortAvg",
                AVG("Noise")::float8 AS "noiseAvg",
                AVG("Treadwear")::float8 AS "treadwearAvg"
            FROM scored
        `;
        const rs = Array.isArray(reviewStatsRows) ? reviewStatsRows[0] : null;

        const items = await prisma.reviews.findMany({
            where: {
                brand: { equals: reviewBrand, mode: 'insensitive' },
                size: { equals: reviewSize, mode: 'insensitive' },
            },
            orderBy: { createdAt: 'desc' },
            skip: offset,
            take: limit
        });

        const total = rs?.total ? Number(rs.total) : 0;
        const avg = rs?.avg ? Number(rs.avg) : 0;
        const buyAgainYes = rs?.buyAgainYes ? Number(rs.buyAgainYes) : 0;

        return res.status(200).json({
            items,
            meta: {
                page,
                limit,
                total,
                totalPages: Math.max(1, Math.ceil(total / limit)),
                averageRating: avg,
                buyAgainPercentage: total > 0 ? Math.round((buyAgainYes / total) * 100) : 0,
                starDistribution: {
                    5: Number(rs?.s5 || 0),
                    4: Number(rs?.s4 || 0),
                    3: Number(rs?.s3 || 0),
                    2: Number(rs?.s2 || 0),
                    1: Number(rs?.s1 || 0),
                },
                categoryAverages: {
                    Dry: Number(rs?.dryAvg || 0),
                    Wet: Number(rs?.wetAvg || 0),
                    Winter: Number(rs?.winterAvg || 0),
                    Comfort: Number(rs?.comfortAvg || 0),
                    Noise: Number(rs?.noiseAvg || 0),
                    Treadwear: Number(rs?.treadwearAvg || 0),
                },
            }
        });
    } catch (error) {
        return next(error);
    }
};
