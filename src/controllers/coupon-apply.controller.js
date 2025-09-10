import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const applyCoupon = async (req, res, next) => {
    try {
        const { code, totalAmount } = req.body;
        
        if (!code || typeof totalAmount !== 'number') {
            return res.status(400).json({ error: "Coupon code and total amount are required" });
        }

        const coupon = await prisma.coupons.findFirst({
            where: { code: code.toUpperCase() }
        });

        if (!coupon) {
            return res.status(404).json({ error: "Invalid coupon code" });
        }

        if (!coupon.isActive) {
            return res.status(400).json({ error: "Coupon is not active" });
        }

        const now = new Date();
        if (coupon.validFrom && now < coupon.validFrom) {
            return res.status(400).json({ error: "Coupon is not yet valid" });
        }

        if (coupon.validTo && now > coupon.validTo) {
            return res.status(400).json({ error: "Coupon has expired" });
        }

        if (coupon.maxUse && coupon.usedCount >= coupon.maxUse) {
            return res.status(400).json({ error: "Coupon usage limit exceeded" });
        }

        let discountAmount = 0;
        if (coupon.discountType === 'percentage') {
            discountAmount = (totalAmount * coupon.discount) / 100;
        } else if (coupon.discountType === 'fixed') {
            discountAmount = coupon.discount;
        }

        const finalAmount = Math.max(0, totalAmount - discountAmount);

        return res.status(200).json({
            success: true,
            coupon: {
                id: coupon.id,
                code: coupon.code,
                discountType: coupon.discountType,
                discount: coupon.discount,
                validFrom: coupon.validFrom,
                validTo: coupon.validTo,
                maxUse: coupon.maxUse,
                usedCount: coupon.usedCount
            },
            calculation: {
                originalAmount: totalAmount,
                discountAmount,
                finalAmount
            }
        });
    } catch (error) {
        return next(error);
    }
};

export const validateCoupon = async (req, res, next) => {
    try {
        const { code } = req.params;
        
        const coupon = await prisma.coupons.findFirst({
            where: { code: code.toUpperCase() }
        });

        if (!coupon) {
            return res.status(404).json({ error: "Coupon not found" });
        }

        const now = new Date();
        const isValid = coupon.isActive && 
                       (!coupon.validFrom || now >= coupon.validFrom) &&
                       (!coupon.validTo || now <= coupon.validTo) &&
                       (!coupon.maxUse || coupon.usedCount < coupon.maxUse);

        return res.status(200).json({
            valid: isValid,
            coupon: {
                id: coupon.id,
                code: coupon.code,
                discountType: coupon.discountType,
                discount: coupon.discount,
                validFrom: coupon.validFrom,
                validTo: coupon.validTo,
                maxUse: coupon.maxUse,
                usedCount: coupon.usedCount
            }
        });
    } catch (error) {
        return next(error);
    }
};
