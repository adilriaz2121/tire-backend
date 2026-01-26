import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function isUuid(id) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(id || '').trim());
}

export const getAllOrders = async (req, res, next) => {
    try {
        const page = Math.max(parseInt(req.query.page || '1', 10), 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit || '10', 10), 1), 100);
        
        // Filter parameters
        const email = req.query.email?.toString().trim();
        const userName = req.query.userName?.toString().trim();
        const shippingLocation = req.query.shippingLocation?.toString().trim();
        const country = req.query.country?.toString().trim();
        const city = req.query.city?.toString().trim();
        const state = req.query.state?.toString().trim();
        const minAmount = req.query.minAmount ? parseFloat(req.query.minAmount) : null;
        const maxAmount = req.query.maxAmount ? parseFloat(req.query.maxAmount) : null;
        const search = req.query.search?.toString().trim();

        // Build where clause
        const where = {};

        // Email filter
        if (email) {
            where.email = { contains: email, mode: 'insensitive' };
        }

        // User name filter
        if (userName) {
            where.userName = { contains: userName, mode: 'insensitive' };
        }

        // Shipping location filter
        if (shippingLocation && ['MobileInstaller', 'LocalInstaller', 'ShipToMe', 'FedExPickup'].includes(shippingLocation)) {
            where.shippingLocation = shippingLocation;
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
                { userName: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search, mode: 'insensitive' } },
                { address: { contains: search, mode: 'insensitive' } },
                { city: { contains: search, mode: 'insensitive' } },
                { state: { contains: search, mode: 'insensitive' } },
                { country: { contains: search, mode: 'insensitive' } },
                { zip: { contains: search, mode: 'insensitive' } }
            ];
        }

        // Get total count for pagination
        const total = await prisma.orders.count({ where });

        // Get orders with pagination
        const orders = await prisma.orders.findMany({
            where,
            orderBy: { id: 'desc' },
            skip: (page - 1) * limit,
            take: limit,
            include: {
                orderItems: true
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

        // Validate UUID format
        if (!isUuid(id)) {
            return res.status(400).json({ 
                success: false,
                error: 'Invalid order ID format' 
            });
        }

        const order = await prisma.orders.findUnique({
            where: { id },
            include: {
                orderItems: true
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
        const { shippingLocation } = req.body;

        // Validate UUID format
        if (!isUuid(id)) {
            return res.status(400).json({ 
                success: false,
                error: 'Invalid order ID format' 
            });
        }

        // Validate shipping location
        if (shippingLocation && !['MobileInstaller', 'LocalInstaller', 'ShipToMe', 'FedExPickup'].includes(shippingLocation)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid shippingLocation. Must be one of: MobileInstaller, LocalInstaller, ShipToMe, FedExPickup'
            });
        }

        const updateData = {};
        if (shippingLocation) {
            updateData.shippingLocation = shippingLocation;
        }

        // If no valid fields to update, return error
        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No valid fields to update'
            });
        }

        const order = await prisma.orders.update({
            where: { id },
            data: updateData,
            include: {
                orderItems: true
            }
        });

        return res.status(200).json({
            success: true,
            message: 'Order updated successfully',
            data: { order }
        });

    } catch (error) {
        if (error.code === 'P2025') {
            return res.status(404).json({
                success: false,
                error: 'Order not found'
            });
        }
        console.error('Error updating order:', error);
        return next(error);
    }
};

export const getOrderStats = async (req, res, next) => {
    try {
        const stats = await prisma.orders.aggregate({
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

        // Get shipping location breakdown
        const locationBreakdown = await prisma.orders.groupBy({
            by: ['shippingLocation'],
            _count: {
                id: true
            },
            _sum: {
                totalAmount: true
            }
        });

        // Get total order items count
        const totalOrderItems = await prisma.orderItems.aggregate({
            _count: {
                id: true
            },
            _sum: {
                productQuantity: true
            }
        });

        return res.status(200).json({
            success: true,
            data: {
                totalOrders: stats._count.id,
                totalRevenue: stats._sum.totalAmount || 0,
                averageOrderValue: stats._avg.totalAmount || 0,
                totalOrderItems: totalOrderItems._count.id || 0,
                totalProductsSold: totalOrderItems._sum.productQuantity || 0,
                locationBreakdown: locationBreakdown.map(item => ({
                    shippingLocation: item.shippingLocation,
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
