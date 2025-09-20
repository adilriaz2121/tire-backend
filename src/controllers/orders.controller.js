import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const getAllOrders = async (req, res, next) => {
    try {
        const page = Math.max(parseInt(req.query.page || '1', 10), 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit || '10', 10), 1), 100);
        
        // Filter parameters
        const status = req.query.status?.toString().trim();
        const email = req.query.email?.toString().trim();
        const name = req.query.name?.toString().trim();
        const paymentIntentId = req.query.paymentIntentId?.toString().trim();
        const country = req.query.country?.toString().trim();
        const city = req.query.city?.toString().trim();
        const state = req.query.state?.toString().trim();
        const dateFrom = req.query.dateFrom?.toString().trim();
        const dateTo = req.query.dateTo?.toString().trim();
        const minAmount = req.query.minAmount ? parseFloat(req.query.minAmount) : null;
        const maxAmount = req.query.maxAmount ? parseFloat(req.query.maxAmount) : null;
        const search = req.query.search?.toString().trim();

        // Build where clause
        const where = {};

        // Status filter
        if (status && ['pending', 'shipped', 'delivered', 'cancelled'].includes(status)) {
            where.status = status;
        }

        // Email filter
        if (email) {
            where.email = { contains: email, mode: 'insensitive' };
        }

        // Name filter
        if (name) {
            where.name = { contains: name, mode: 'insensitive' };
        }

        // Payment Intent ID filter
        if (paymentIntentId) {
            where.paymentIntentId = paymentIntentId;
        }

        // Location filters
        if (country) {
            where.country = { contains: country, mode: 'insensitive' };
        }
        if (city) {
            where.city = { contains: city, mode: 'insensitive' };
        }
        if (state) {
            where.state = { contains: state, mode: 'insensitive' };
        }

        // Date range filters
        if (dateFrom || dateTo) {
            where.createdAt = {};
            if (dateFrom) {
                where.createdAt.gte = new Date(dateFrom);
            }
            if (dateTo) {
                where.createdAt.lte = new Date(dateTo);
            }
        }

        // Amount range filters
        if (minAmount !== null || maxAmount !== null) {
            where.totalAmount = {};
            if (minAmount !== null) {
                where.totalAmount.gte = minAmount;
            }
            if (maxAmount !== null) {
                where.totalAmount.lte = maxAmount;
            }
        }

        // Search filter (searches across multiple fields)
        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search, mode: 'insensitive' } },
                { address: { contains: search, mode: 'insensitive' } },
                { city: { contains: search, mode: 'insensitive' } },
                { state: { contains: search, mode: 'insensitive' } },
                { country: { contains: search, mode: 'insensitive' } },
                { paymentIntentId: { contains: search, mode: 'insensitive' } }
            ];
        }

        // Get total count for pagination
        const total = await prisma.order.count({ where });

        // Get orders with pagination
        const orders = await prisma.order.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip: (page - 1) * limit,
            take: limit,
            select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                totalAmount: true,
                productIds: true,
                address: true,
                city: true,
                state: true,
                zip: true,
                country: true,
                total: true,
                status: true,
                paymentIntentId: true,
                currency: true,
                userInfo: true,
                shippingInfo: true,
                pricingInfo: true,
                productInfo: true,
                createdAt: true,
                updatedAt: true
            }
        });

        // Calculate pagination info
        const totalPages = Math.ceil(total / limit) || 1;
        const hasNextPage = page < totalPages;
        const hasPrevPage = page > 1;

        return res.status(200).json({
            success: true,
            data: {
                orders,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages,
                    hasNextPage,
                    hasPrevPage,
                    nextPage: hasNextPage ? page + 1 : null,
                    prevPage: hasPrevPage ? page - 1 : null
                }
            }
        });

    } catch (error) {
        console.error('Error fetching orders:', error);
        return next(error);
    }
};

export const getOrderById = async (req, res, next) => {
    try {
        const { id } = req.params;

        // Validate ObjectId format
        if (!/^[a-fA-F0-9]{24}$/.test(id)) {
            return res.status(400).json({ 
                success: false,
                error: 'Invalid order ID format' 
            });
        }

        const order = await prisma.order.findUnique({
            where: { id },
            select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                totalAmount: true,
                productIds: true,
                address: true,
                city: true,
                state: true,
                zip: true,
                country: true,
                total: true,
                status: true,
                paymentIntentId: true,
                currency: true,
                userInfo: true,
                shippingInfo: true,
                pricingInfo: true,
                productInfo: true,
                createdAt: true,
                updatedAt: true
            }
        });

        if (!order) {
            return res.status(404).json({
                success: false,
                error: 'Order not found'
            });
        }

        return res.status(200).json({
            success: true,
            data: { order }
        });

    } catch (error) {
        console.error('Error fetching order:', error);
        return next(error);
    }
};

export const updateOrderStatus = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        // Validate ObjectId format
        if (!/^[a-fA-F0-9]{24}$/.test(id)) {
            return res.status(400).json({ 
                success: false,
                error: 'Invalid order ID format' 
            });
        }

        // Validate status
        if (!status || !['pending', 'shipped', 'delivered', 'cancelled'].includes(status)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid status. Must be one of: pending, shipped, delivered, cancelled'
            });
        }

        const order = await prisma.order.update({
            where: { id },
            data: { status },
            select: {
                id: true,
                name: true,
                email: true,
                status: true,
                updatedAt: true
            }
        });

        return res.status(200).json({
            success: true,
            message: `Order status updated to ${status}`,
            data: { order }
        });

    } catch (error) {
        if (error.code === 'P2025') {
            return res.status(404).json({
                success: false,
                error: 'Order not found'
            });
        }
        console.error('Error updating order status:', error);
        return next(error);
    }
};

export const getOrderStats = async (req, res, next) => {
    try {
        const stats = await prisma.order.aggregate({
            _count: {
                id: true
            },
            _sum: {
                totalAmount: true
            },
            _avg: {
                totalAmount: true
            }
        });

        // Get status breakdown
        const statusBreakdown = await prisma.order.groupBy({
            by: ['status'],
            _count: {
                id: true
            },
            _sum: {
                totalAmount: true
            }
        });

        // Get recent orders count (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const recentOrders = await prisma.order.count({
            where: {
                createdAt: {
                    gte: thirtyDaysAgo
                }
            }
        });

        return res.status(200).json({
            success: true,
            data: {
                totalOrders: stats._count.id,
                totalRevenue: stats._sum.totalAmount || 0,
                averageOrderValue: stats._avg.totalAmount || 0,
                recentOrders,
                statusBreakdown: statusBreakdown.map(item => ({
                    status: item.status,
                    count: item._count.id,
                    revenue: item._sum.totalAmount || 0
                }))
            }
        });

    } catch (error) {
        console.error('Error fetching order stats:', error);
        return next(error);
    }
};
