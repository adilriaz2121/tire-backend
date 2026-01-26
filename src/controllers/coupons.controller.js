import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const createCoupon = async (req, res, next) => {
    try {
        const { code, discountType, discount, validFrom, validTo, maxUse, isActive } = req.body;
        if (!code || !discountType || typeof discount !== 'number') {
            return res.status(400).json({ error: "code, discountType and numeric discount are required" });
        }

        // Validate discountType enum
        if (!['percentage', 'fixed'].includes(discountType)) {
            return res.status(400).json({ error: "discountType must be 'percentage' or 'fixed'" });
        }

        // Validate discount value
        if (discountType === 'percentage' && (discount < 0 || discount > 100)) {
            return res.status(400).json({ error: "Percentage discount must be between 0 and 100" });
        }
        if (discountType === 'fixed' && discount < 0) {
            return res.status(400).json({ error: "Fixed discount must be a positive number" });
        }

        // Normalize code to uppercase
        const normalizedCode = code.toUpperCase().trim();
        if (!normalizedCode) {
            return res.status(400).json({ error: "Coupon code cannot be empty" });
        }

        const existing = await prisma.coupons.findFirst({ where: { code: normalizedCode } });
        if (existing) {
            return res.status(409).json({ error: "Coupon code already exists" });
        }

        const coupon = await prisma.coupons.create({
            data: {
                code: normalizedCode,
                discountType,
                discount,
                validFrom: validFrom ? new Date(validFrom) : null,
                validTo: validTo ? new Date(validTo) : null,
                maxUse: maxUse && maxUse > 0 ? maxUse : null,
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
        
        // Validate UUID format
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(id)) {
            return res.status(400).json({ error: 'Invalid coupon ID format' });
        }
        
        const coupon = await prisma.coupons.findUnique({ where: { id } });
        if (!coupon) {
            return res.status(404).json({ error: 'Coupon not found' });
        }
        return res.status(200).json({ coupon });
    } catch (error) {
        return next(error);
    }
};

export const updateCoupon = async (req, res, next) => {
    try {
        const { id } = req.params;
        
        // Check if coupon exists first
        const existingCoupon = await prisma.coupons.findUnique({ 
            where: { id },
            select: { id: true, discountType: true }
        });
        
        if (!existingCoupon) {
            return res.status(404).json({ error: 'Coupon not found' });
        }

        const { code, discountType, discount, validFrom, validTo, maxUse, isActive } = req.body;

        // Validate discountType if provided
        if (discountType && !['percentage', 'fixed'].includes(discountType)) {
            return res.status(400).json({ error: "discountType must be 'percentage' or 'fixed'" });
        }

        // Validate discount value if provided
        if (typeof discount === 'number') {
            const effectiveDiscountType = discountType || existingCoupon.discountType;
            if (effectiveDiscountType === 'percentage' && (discount < 0 || discount > 100)) {
                return res.status(400).json({ error: "Percentage discount must be between 0 and 100" });
            }
            if (effectiveDiscountType === 'fixed' && discount < 0) {
                return res.status(400).json({ error: "Fixed discount must be a positive number" });
            }
        }

        // Normalize code to uppercase if provided
        let normalizedCode = code;
        if (code !== undefined && code !== null) {
            normalizedCode = String(code).toUpperCase().trim();
            if (!normalizedCode) {
                return res.status(400).json({ error: "Coupon code cannot be empty" });
            }
            const duplicate = await prisma.coupons.findFirst({ 
                where: { code: normalizedCode, NOT: { id } } 
            });
            if (duplicate) {
                return res.status(409).json({ error: 'Coupon code already exists' });
            }
        }

        // Build update data object
        const updateData = {};
        if (normalizedCode) updateData.code = normalizedCode;
        if (discountType) updateData.discountType = discountType;
        if (typeof discount === 'number') updateData.discount = discount;
        if (validFrom !== undefined) updateData.validFrom = validFrom ? new Date(validFrom) : null;
        if (validTo !== undefined) updateData.validTo = validTo ? new Date(validTo) : null;
        if (maxUse !== undefined) updateData.maxUse = maxUse && maxUse > 0 ? parseInt(maxUse) : null;
        if (typeof isActive === 'boolean') updateData.isActive = isActive;

        // Check if there's anything to update
        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({ error: "No valid fields to update" });
        }

        const coupon = await prisma.coupons.update({
            where: { id },
            data: updateData
        });

        return res.status(200).json({ coupon });
    } catch (error) {
        if (error.code === 'P2025') {
            return res.status(404).json({ error: 'Coupon not found' });
        }
        return next(error);
    }
};

export const deleteCoupon = async (req, res, next) => {
    try {
        const { id } = req.params;
        
        // Validate UUID format
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(id)) {
            return res.status(400).json({ error: 'Invalid coupon ID format' });
        }
        
        await prisma.coupons.delete({ where: { id } });
        return res.status(200).json({ 
            success: true,
            message: 'Coupon deleted successfully' 
        });
    } catch (error) {
        if (error.code === 'P2025') {
            return res.status(404).json({ error: 'Coupon not found' });
        }
        return next(error);
    }
};

export const setCouponActive = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { isActive } = req.body;
        
        // Validate UUID format
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(id)) {
            return res.status(400).json({ error: 'Invalid coupon ID format' });
        }
        
        if (typeof isActive !== 'boolean') {
            return res.status(400).json({ error: 'isActive must be a boolean value' });
        }
        
        const coupon = await prisma.coupons.update({ 
            where: { id }, 
            data: { isActive: isActive } 
        });
        return res.status(200).json({ coupon });
    } catch (error) {
        if (error.code === 'P2025') {
            return res.status(404).json({ error: 'Coupon not found' });
        }
        return next(error);
    }
};

export const incrementCouponUsage = async (req, res, next) => {
    try {
        const { id } = req.params;
        
        // Validate UUID format
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(id)) {
            return res.status(400).json({ error: 'Invalid coupon ID format' });
        }
        
        const coupon = await prisma.coupons.update({ 
            where: { id }, 
            data: { usedCount: { increment: 1 } } 
        });
        return res.status(200).json({ coupon });
    } catch (error) {
        if (error.code === 'P2025') {
            return res.status(404).json({ error: 'Coupon not found' });
        }
        return next(error);
    }
};
