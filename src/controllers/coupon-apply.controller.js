import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const applyCoupon = async (req, res, next) => {
    try {
        const { code, totalAmount } = req.body;
        
        // Validate input
        if (!code || typeof code !== 'string') {
            return res.status(400).json({ 
                success: false,
                error: "Coupon code is required and must be a string" 
            });
        }

        if (typeof totalAmount !== 'number' || totalAmount < 0) {
            return res.status(400).json({ 
                success: false,
                error: "Total amount is required and must be a non-negative number" 
            });
        }

        // Normalize code to uppercase (matching schema constraint)
        const normalizedCode = code.toUpperCase().trim();
        if (!normalizedCode) {
            return res.status(400).json({ 
                success: false,
                error: "Coupon code cannot be empty" 
            });
        }

        // Find coupon by code
        const coupon = await prisma.coupons.findFirst({
            where: { code: normalizedCode }
        });

        if (!coupon) {
            return res.status(404).json({ 
                success: false,
                error: "Invalid coupon code" 
            });
        }

        // Validate coupon is active
        if (!coupon.isActive) {
            return res.status(400).json({ 
                success: false,
                error: "Coupon is not active" 
            });
        }

        // Validate date range
        const now = new Date();
        if (coupon.validFrom && now < coupon.validFrom) {
            return res.status(400).json({ 
                success: false,
                error: "Coupon is not yet valid" 
            });
        }

        if (coupon.validTo && now > coupon.validTo) {
            return res.status(400).json({ 
                success: false,
                error: "Coupon has expired" 
            });
        }

        // Validate usage limit
        if (coupon.maxUse !== null && coupon.maxUse !== undefined && coupon.usedCount >= coupon.maxUse) {
            return res.status(400).json({ 
                success: false,
                error: "Coupon usage limit exceeded" 
            });
        }

        // Validate discountType enum (should already be valid from schema, but double-check)
        if (!['percentage', 'fixed'].includes(coupon.discountType)) {
            return res.status(500).json({ 
                success: false,
                error: "Invalid discount type in coupon" 
            });
        }

        // Calculate discount amount
        let discountAmount = 0;
        if (coupon.discountType === 'percentage') {
            // Ensure percentage is between 0 and 100
            const percentage = Math.max(0, Math.min(100, coupon.discount));
            discountAmount = (totalAmount * percentage) / 100;
        } else if (coupon.discountType === 'fixed') {
            // Fixed discount cannot exceed total amount
            discountAmount = Math.min(coupon.discount, totalAmount);
        }

        // Ensure discount is non-negative
        discountAmount = Math.max(0, discountAmount);

        // Calculate final amount (cannot be negative)
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
                usedCount: coupon.usedCount,
                isActive: coupon.isActive
            },
            calculation: {
                originalAmount: totalAmount,
                discountAmount: Number(discountAmount.toFixed(2)),
                finalAmount: Number(finalAmount.toFixed(2))
            }
        });
    } catch (error) {
        console.error('Error applying coupon:', error);
        return next(error);
    }
};

export const validateCoupon = async (req, res, next) => {
    try {
        const { code } = req.params;
        
        // Validate input
        if (!code || typeof code !== 'string') {
            return res.status(400).json({ 
                success: false,
                valid: false,
                error: "Coupon code is required and must be a string" 
            });
        }

        // Normalize code to uppercase (matching schema constraint)
        const normalizedCode = code.toUpperCase().trim();
        if (!normalizedCode) {
            return res.status(400).json({ 
                success: false,
                valid: false,
                error: "Coupon code cannot be empty" 
            });
        }
        
        // Find coupon by code
        const coupon = await prisma.coupons.findFirst({
            where: { code: normalizedCode }
        });

        if (!coupon) {
            return res.status(404).json({ 
                success: false,
                valid: false,
                error: "Coupon not found" 
            });
        }

        // Validate all conditions
        const now = new Date();
        const isValid = coupon.isActive && 
                       (!coupon.validFrom || now >= coupon.validFrom) &&
                       (!coupon.validTo || now <= coupon.validTo) &&
                       (coupon.maxUse === null || coupon.maxUse === undefined || coupon.usedCount < coupon.maxUse);

        return res.status(200).json({
            success: true,
            valid: isValid,
            coupon: {
                id: coupon.id,
                code: coupon.code,
                discountType: coupon.discountType,
                discount: coupon.discount,
                validFrom: coupon.validFrom,
                validTo: coupon.validTo,
                maxUse: coupon.maxUse,
                usedCount: coupon.usedCount,
                isActive: coupon.isActive
            },
            ...(isValid ? {} : {
                reason: !coupon.isActive ? "Coupon is not active" :
                       (coupon.validFrom && now < coupon.validFrom) ? "Coupon is not yet valid" :
                       (coupon.validTo && now > coupon.validTo) ? "Coupon has expired" :
                       (coupon.maxUse !== null && coupon.maxUse !== undefined && coupon.usedCount >= coupon.maxUse) ? "Coupon usage limit exceeded" :
                       "Unknown validation error"
            })
        });
    } catch (error) {
        console.error('Error validating coupon:', error);
        return next(error);
    }
};
