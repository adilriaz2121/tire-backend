import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const createReview = async (req, res, next) => {
    try {
        const { name, country, review, rating, productsId } = req.body;
        
        if (!name || !review || !rating || !productsId) {
            return res.status(400).json({ error: "Name, review, rating, and product ID are required" });
        }

        if (rating < 1 || rating > 5) {
            return res.status(400).json({ error: "Rating must be between 1 and 5" });
        }

        // Check if product exists
        const product = await prisma.products.findUnique({ where: { id: productsId } });
        if (!product) {
            return res.status(404).json({ error: "Product not found" });
        }

        const reviewRecord = await prisma.reviews.create({
            data: {
                name,
                country: country || null,
                review,
                rating,
                productsId
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
        const rating = req.query.rating ? parseInt(req.query.rating) : null;
        const productsId = req.query.productId;

        const where = {
            isApproved: true,
            ...(search && {
                OR: [
                    { name: { contains: search, mode: 'insensitive' } },
                    { review: { contains: search, mode: 'insensitive' } },
                ],
            }),
            ...(rating && { rating }),
            ...(productsId && { productsId })
        };

        const [items, total] = await Promise.all([
            prisma.reviews.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
                include: {
                    products: {
                        select: {
                            id: true,
                            make: true,
                            model: true,
                            year: true,
                            item: true
                        }
                    }
                }
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
        const review = await prisma.reviews.findUnique({
            where: { id },
            include: {
                products: {
                    select: {
                        id: true,
                        make: true,
                        model: true,
                        year: true,
                        item: true
                    }
                }
            }
        });
        
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
        const page = Math.max(parseInt(req.query.page || '1', 10), 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit || '10', 10), 1), 100);
        const rating = req.query.rating ? parseInt(req.query.rating) : null;

        const where = {
            productsId: productId,
            ...(rating && { rating })
        };

        const [items, total] = await Promise.all([
            prisma.reviews.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit
            }),
            prisma.reviews.count({ where })
        ]);

        // Calculate average rating
        const avgRating = await prisma.reviews.aggregate({
            where: { productsId: productId },
            _avg: { rating: true }
        });

        return res.status(200).json({
            items,
            meta: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit) || 1,
                averageRating: avgRating._avg.rating || 0
            }
        });
    } catch (error) {
        return next(error);
    }
};
