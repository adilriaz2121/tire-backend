import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const createCoupon = async (req, res, next) => {
    try {
        const { code, discountType, discount, validFrom, validTo, maxUse, isActive } = req.body;
        if (!code || !discountType || typeof discount !== 'number') {
            return res.status(400).json({ error: "code, discountType and numeric discount are required" });
        }

        const existing = await prisma.coupons.findFirst({ where: { code } });
        if (existing) {
            return res.status(409).json({ error: "Coupon code already exists" });
        }

        const coupon = await prisma.coupons.create({
            data: {
                code,
                discountType,
                discount,
                validFrom: validFrom ? new Date(validFrom) : null,
                validTo: validTo ? new Date(validTo) : null,
                maxUse: maxUse ?? null,
                isActive: typeof isActive === 'boolean' ? isActive : true,
            }
        });

        return res.status(201).json({ coupon });
    } catch (error) {
        return next(error);
    }
};

export const listCoupons = async (req, res, next) => {
    try {
        const page = Math.max(parseInt(req.query.page || '1', 10), 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit || '10', 10), 1), 100);
        const search = (req.query.q || '').toString().trim();

        const where = search ? { code: { contains: search, mode: 'insensitive' } } : {};

        const [items, total] = await Promise.all([
            prisma.coupons.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
            prisma.coupons.count({ where })
        ]);

        return res.status(200).json({
            items,
            meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 }
        });
    } catch (error) {
        return next(error);
    }
};

export const getCoupon = async (req, res, next) => {
    try {
        const { id } = req.params;
        const coupon = await prisma.coupons.findUnique({ where: { id } });
        if (!coupon) return res.status(404).json({ error: 'Coupon not found' });
        return res.status(200).json({ coupon });
    } catch (error) {
        return next(error);
    }
};

export const updateCoupon = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { code, discountType, discount, validFrom, validTo, maxUse, isActive } = req.body;

        if (code) {
            const existing = await prisma.coupons.findFirst({ where: { code, NOT: { id } } });
            if (existing) return res.status(409).json({ error: 'Coupon code already exists' });
        }

        const coupon = await prisma.coupons.update({
            where: { id },
            data: {
                code,
                discountType,
                discount,
                validFrom: validFrom !== undefined ? (validFrom ? new Date(validFrom) : null) : undefined,
                validTo: validTo !== undefined ? (validTo ? new Date(validTo) : null) : undefined,
                maxUse,
                isActive,
            }
        });

        return res.status(200).json({ coupon });
    } catch (error) {
        return next(error);
    }
};

export const deleteCoupon = async (req, res, next) => {
    try {
        const { id } = req.params;
        await prisma.coupons.delete({ where: { id } });
        return res.status(204).send();
    } catch (error) {
        return next(error);
    }
};

export const setCouponActive = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { isActive } = req.body;
        const coupon = await prisma.coupons.update({ where: { id }, data: { isActive: !!isActive } });
        return res.status(200).json({ coupon });
    } catch (error) {
        return next(error);
    }
};

export const incrementCouponUsage = async (req, res, next) => {
    try {
        const { id } = req.params;
        const coupon = await prisma.coupons.update({ where: { id }, data: { usedCount: { increment: 1 } } });
        return res.status(200).json({ coupon });
    } catch (error) {
        return next(error);
    }
};
