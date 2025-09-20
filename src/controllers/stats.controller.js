import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Get admin dashboard stats (4 cards)
export const getAdminStats = async (req, res, next) => {
    try {
        // Get total unread contacts
        const totalUnreadContacts = await prisma.contact.count({
            where: { isRead: 'false' }
        });

        // Get total delivered orders
        const totalDeliveredOrders = await prisma.order.count({
            where: { status: 'delivered' }
        });

        // Get total revenue (sum of totalAmount for delivered orders)
        const totalRevenue = await prisma.order.aggregate({
            where: { status: 'delivered' },
            _sum: { totalAmount: true }
        });

        // Get total processing orders (pending + shipped)
        const totalProcessingOrders = await prisma.order.count({
            where: {
                status: {
                    in: ['pending', 'shipped']
                }
            }
        });

        const stats = {
            totalUnreadContacts: totalUnreadContacts || 0,
            totalDeliveredOrders: totalDeliveredOrders || 0,
            totalRevenue: totalRevenue._sum.totalAmount || 0,
            totalProcessingOrders: totalProcessingOrders || 0
        };

        return res.status(200).json({
            success: true,
            data: stats
        });
    } catch (error) {
        return next(error);
    }
};

// Get products chart data (throughout the year)
export const getProductsChartData = async (req, res, next) => {
    try {
        const currentYear = new Date().getFullYear();
        const startOfYear = new Date(currentYear, 0, 1);
        const endOfYear = new Date(currentYear, 11, 31, 23, 59, 59);

        // Get products created by month
        const productsByMonth = await prisma.products.groupBy({
            by: ['createdAt'],
            where: {
                createdAt: {
                    gte: startOfYear,
                    lte: endOfYear
                }
            },
            _count: {
                id: true
            }
        });

        // Create a complete year array with 0 values for months with no products
        const monthlyData = Array.from({ length: 12 }, (_, index) => {
            const month = index + 1;
            const monthData = productsByMonth.find(item => {
                const itemMonth = new Date(item.createdAt).getMonth() + 1;
                return itemMonth === month;
            });
            return {
                month: month,
                count: monthData ? monthData._count.id : 0
            };
        });

        // Get total products count
        const totalProducts = await prisma.products.count();

        // Get active products count
        const activeProducts = await prisma.products.count({
            where: { isActive: true }
        });

        // Get inactive products count
        const inactiveProducts = await prisma.products.count({
            where: { isActive: false }
        });

        const chartData = {
            monthlyData,
            summary: {
                total: totalProducts,
                active: activeProducts,
                inactive: inactiveProducts
            }
        };

        return res.status(200).json({
            success: true,
            data: chartData
        });
    } catch (error) {
        return next(error);
    }
};

// Get orders chart data (throughout the year)
export const getOrdersChartData = async (req, res, next) => {
    try {
        const currentYear = new Date().getFullYear();
        const startOfYear = new Date(currentYear, 0, 1);
        const endOfYear = new Date(currentYear, 11, 31, 23, 59, 59);

        // Get orders by month
        const ordersByMonth = await prisma.order.groupBy({
            by: ['createdAt'],
            where: {
                createdAt: {
                    gte: startOfYear,
                    lte: endOfYear
                }
            },
            _count: {
                id: true
            },
            _sum: {
                totalAmount: true
            }
        });

        // Create a complete year array with 0 values for months with no orders
        const monthlyData = Array.from({ length: 12 }, (_, index) => {
            const month = index + 1;
            const monthData = ordersByMonth.find(item => {
                const itemMonth = new Date(item.createdAt).getMonth() + 1;
                return itemMonth === month;
            });
            return {
                month: month,
                count: monthData ? monthData._count.id : 0,
                revenue: monthData ? (monthData._sum.totalAmount || 0) : 0
            };
        });

        // Get order status breakdown
        const orderStatusBreakdown = await prisma.order.groupBy({
            by: ['status'],
            _count: {
                id: true
            }
        });

        // Get total orders count
        const totalOrders = await prisma.order.count();

        // Get total revenue
        const totalRevenue = await prisma.order.aggregate({
            _sum: { totalAmount: true }
        });

        // Get average order value
        const avgOrderValue = totalOrders > 0 ? (totalRevenue._sum.totalAmount || 0) / totalOrders : 0;

        const chartData = {
            monthlyData,
            summary: {
                total: totalOrders,
                revenue: totalRevenue._sum.totalAmount || 0,
                averageOrderValue: avgOrderValue
            },
            statusBreakdown: orderStatusBreakdown.map(item => ({
                status: item.status,
                count: item._count.id
            }))
        };

        return res.status(200).json({
            success: true,
            data: chartData
        });
    } catch (error) {
        return next(error);
    }
};

// Get comprehensive dashboard data (all stats in one call)
export const getDashboardData = async (req, res, next) => {
    try {
        // Get all stats in parallel
        const [
            totalUnreadContacts,
            totalDeliveredOrders,
            totalRevenue,
            totalProcessingOrders,
            totalProducts,
            activeProducts,
            totalOrders,
            orderStatusBreakdown
        ] = await Promise.all([
            prisma.contact.count({ where: { isRead: 'false' } }),
            prisma.order.count({ where: { status: 'delivered' } }),
            prisma.order.aggregate({
                where: { status: 'delivered' },
                _sum: { totalAmount: true }
            }),
            prisma.order.count({
                where: { status: { in: ['pending', 'shipped'] } }
            }),
            prisma.products.count(),
            prisma.products.count({ where: { isActive: true } }),
            prisma.order.count(),
            prisma.order.groupBy({
                by: ['status'],
                _count: { id: true }
            })
        ]);

        // Get monthly data for charts
        const currentYear = new Date().getFullYear();
        const startOfYear = new Date(currentYear, 0, 1);
        const endOfYear = new Date(currentYear, 11, 31, 23, 59, 59);

        const [productsByMonth, ordersByMonth] = await Promise.all([
            prisma.products.groupBy({
                by: ['createdAt'],
                where: {
                    createdAt: { gte: startOfYear, lte: endOfYear }
                },
                _count: { id: true }
            }),
            prisma.order.groupBy({
                by: ['createdAt'],
                where: {
                    createdAt: { gte: startOfYear, lte: endOfYear }
                },
                _count: { id: true },
                _sum: { totalAmount: true }
            })
        ]);

        // Process monthly data
        const productsMonthlyData = Array.from({ length: 12 }, (_, index) => {
            const month = index + 1;
            const monthData = productsByMonth.find(item => {
                const itemMonth = new Date(item.createdAt).getMonth() + 1;
                return itemMonth === month;
            });
            return {
                month: month,
                count: monthData ? monthData._count.id : 0
            };
        });

        const ordersMonthlyData = Array.from({ length: 12 }, (_, index) => {
            const month = index + 1;
            const monthData = ordersByMonth.find(item => {
                const itemMonth = new Date(item.createdAt).getMonth() + 1;
                return itemMonth === month;
            });
            return {
                month: month,
                count: monthData ? monthData._count.id : 0,
                revenue: monthData ? (monthData._sum.totalAmount || 0) : 0
            };
        });

        const dashboardData = {
            cards: {
                totalUnreadContacts: totalUnreadContacts || 0,
                totalDeliveredOrders: totalDeliveredOrders || 0,
                totalRevenue: totalRevenue._sum.totalAmount || 0,
                totalProcessingOrders: totalProcessingOrders || 0
            },
            charts: {
                products: {
                    monthlyData: productsMonthlyData,
                    summary: {
                        total: totalProducts,
                        active: activeProducts,
                        inactive: totalProducts - activeProducts
                    }
                },
                orders: {
                    monthlyData: ordersMonthlyData,
                    summary: {
                        total: totalOrders,
                        revenue: totalRevenue._sum.totalAmount || 0,
                        averageOrderValue: totalOrders > 0 ? (totalRevenue._sum.totalAmount || 0) / totalOrders : 0
                    },
                    statusBreakdown: orderStatusBreakdown.map(item => ({
                        status: item.status,
                        count: item._count.id
                    }))
                }
            }
        };

        return res.status(200).json({
            success: true,
            data: dashboardData
        });
    } catch (error) {
        return next(error);
    }
};
