import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Get admin dashboard stats (4 cards) - Optimized with raw SQL
export const getAdminStats = async (req, res, next) => {
    try {
        // Execute all queries in parallel using raw SQL for better performance
        const [
            contactsResult,
            ordersResult
        ] = await Promise.all([
            // Get total unread contacts
            prisma.$queryRaw`
                SELECT COUNT(*)::int as count
                FROM "Contacts"
                WHERE "isRead" = false
            `,
            // Get all order stats in one query
            prisma.$queryRaw`
                SELECT 
                    COUNT(*) FILTER (WHERE status = 'delivered')::int as delivered_count,
                    COUNT(*) FILTER (WHERE status IN ('confirmed', 'shipped'))::int as processing_count,
                    COALESCE(SUM("totalAmount"), 0)::float as total_revenue
                FROM "Orders"
            `
        ]);

        const stats = {
            totalUnreadContacts: Number(contactsResult[0]?.count || 0),
            totalDeliveredOrders: Number(ordersResult[0]?.delivered_count || 0),
            totalRevenue: Number(ordersResult[0]?.total_revenue || 0),
            totalProcessingOrders: Number(ordersResult[0]?.processing_count || 0)
        };

        return res.status(200).json({
            success: true,
            data: stats
        });
    } catch (error) {
        return next(error);
    }
};

// Get products chart data (throughout the year) - Optimized with raw SQL
export const getProductsChartData = async (req, res, next) => {
    try {
        const currentYear = new Date().getFullYear();
        const startOfYear = new Date(currentYear, 0, 1).toISOString();
        const endOfYear = new Date(currentYear, 11, 31, 23, 59, 59).toISOString();

        // Get monthly product counts and total in one query
        const [monthlyDataResult, totalResult] = await Promise.all([
            prisma.$queryRaw`
                SELECT 
                    EXTRACT(MONTH FROM "createdAt")::int as month,
                    COUNT(*)::int as count
                FROM "Products"
                WHERE "createdAt" >= ${startOfYear}::timestamp
                  AND "createdAt" <= ${endOfYear}::timestamp
                GROUP BY EXTRACT(MONTH FROM "createdAt")
                ORDER BY month
            `,
            prisma.$queryRaw`
                SELECT COUNT(*)::int as total
                FROM "Products"
            `
        ]);

        // Create a map for quick lookup
        const monthlyMap = new Map();
        monthlyDataResult.forEach(row => {
            monthlyMap.set(Number(row.month), Number(row.count));
        });

        // Create a complete year array with 0 values for months with no products
        const monthlyData = Array.from({ length: 12 }, (_, index) => {
            const month = index + 1;
            return {
                month: month,
                count: monthlyMap.get(month) || 0
            };
        });

        const totalProducts = Number(totalResult[0]?.total || 0);

        const chartData = {
            monthlyData,
            summary: {
                total: totalProducts,
                active: totalProducts,
                inactive: 0
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

// Get orders chart data (throughout the year) - Optimized with raw SQL
export const getOrdersChartData = async (req, res, next) => {
    try {
        const currentYear = new Date().getFullYear();
        const startOfYear = new Date(currentYear, 0, 1).toISOString();
        const endOfYear = new Date(currentYear, 11, 31, 23, 59, 59).toISOString();

        // Execute all queries in parallel using optimized raw SQL
        const [
            monthlyDataResult,
            statusBreakdownResult,
            summaryResult
        ] = await Promise.all([
            // Get monthly order counts and revenue using the first order item's createdAt
            // Use subquery to get the month for each order based on its first order item
            prisma.$queryRaw`
                SELECT 
                    month::int,
                    COUNT(*)::int as count,
                    COALESCE(SUM("totalAmount"), 0)::float as revenue
                FROM (
                    SELECT 
                        o.id,
                        o."totalAmount",
                        EXTRACT(MONTH FROM MIN(oi."createdAt")) as month
                    FROM "Orders" o
                    INNER JOIN "OrderItems" oi ON o.id = oi."orderId"
                    WHERE oi."createdAt" >= ${startOfYear}::timestamp
                      AND oi."createdAt" <= ${endOfYear}::timestamp
                    GROUP BY o.id, o."totalAmount"
                ) monthly_orders
                GROUP BY month
                ORDER BY month
            `,
            // Get order status breakdown
            prisma.$queryRaw`
                SELECT 
                    status,
                    COUNT(*)::int as count
                FROM "Orders"
                GROUP BY status
            `,
            // Get total orders, revenue, and average in one query
            prisma.$queryRaw`
                SELECT 
                    COUNT(*)::int as total_orders,
                    COALESCE(SUM("totalAmount"), 0)::float as total_revenue,
                    CASE 
                        WHEN COUNT(*) > 0 THEN COALESCE(SUM("totalAmount"), 0) / COUNT(*)::float
                        ELSE 0
                    END as avg_order_value
                FROM "Orders"
            `
        ]);

        // Create a map for quick lookup
        const monthlyMap = new Map();
        monthlyDataResult.forEach(row => {
            monthlyMap.set(Number(row.month), {
                count: Number(row.count),
                revenue: Number(row.revenue)
            });
        });

        // Create a complete year array with 0 values for months with no orders
        const monthlyData = Array.from({ length: 12 }, (_, index) => {
            const month = index + 1;
            const monthData = monthlyMap.get(month);
            return {
                month: month,
                count: monthData ? monthData.count : 0,
                revenue: monthData ? monthData.revenue : 0
            };
        });

        // Format status breakdown
        const orderStatusBreakdown = statusBreakdownResult.map(row => ({
            status: row.status,
            count: Number(row.count)
        }));

        const summary = summaryResult[0];

        const chartData = {
            monthlyData,
            summary: {
                total: Number(summary?.total_orders || 0),
                revenue: Number(summary?.total_revenue || 0),
                averageOrderValue: Number(summary?.avg_order_value || 0)
            },
            statusBreakdown: orderStatusBreakdown
        };

        return res.status(200).json({
            success: true,
            data: chartData
        });
    } catch (error) {
        return next(error);
    }
};

// Get comprehensive dashboard data (all stats in one call) - Optimized with raw SQL
export const getDashboardData = async (req, res, next) => {
    try {
        const currentYear = new Date().getFullYear();
        const startOfYear = new Date(currentYear, 0, 1).toISOString();
        const endOfYear = new Date(currentYear, 11, 31, 23, 59, 59).toISOString();

        // Execute all queries in parallel using optimized raw SQL
        const [
            contactsResult,
            ordersStatsResult,
            monthlyDataResult,
            statusBreakdownResult
        ] = await Promise.all([
            // Get total unread contacts
            prisma.$queryRaw`
                SELECT COUNT(*)::int as count
                FROM "Contacts"
                WHERE "isRead" = false
            `,
            // Get all order stats in one query
            prisma.$queryRaw`
                SELECT 
                    COUNT(*) FILTER (WHERE status = 'delivered')::int as delivered_count,
                    COUNT(*) FILTER (WHERE status IN ('confirmed', 'shipped'))::int as processing_count,
                    COUNT(*)::int as total_orders,
                    COALESCE(SUM("totalAmount"), 0)::float as total_revenue,
                    CASE 
                        WHEN COUNT(*) > 0 THEN COALESCE(SUM("totalAmount"), 0) / COUNT(*)::float
                        ELSE 0
                    END as avg_order_value
                FROM "Orders"
            `,
            // Get monthly order counts and revenue using the first order item's createdAt
            // Use subquery to get the month for each order based on its first order item
            prisma.$queryRaw`
                SELECT 
                    month::int,
                    COUNT(*)::int as count,
                    COALESCE(SUM("totalAmount"), 0)::float as revenue
                FROM (
                    SELECT 
                        o.id,
                        o."totalAmount",
                        EXTRACT(MONTH FROM MIN(oi."createdAt")) as month
                    FROM "Orders" o
                    INNER JOIN "OrderItems" oi ON o.id = oi."orderId"
                    WHERE oi."createdAt" >= ${startOfYear}::timestamp
                      AND oi."createdAt" <= ${endOfYear}::timestamp
                    GROUP BY o.id, o."totalAmount"
                ) monthly_orders
                GROUP BY month
                ORDER BY month
            `,
            // Get order status breakdown
            prisma.$queryRaw`
                SELECT 
                    status,
                    COUNT(*)::int as count
                FROM "Orders"
                GROUP BY status
            `
        ]);

        // Process monthly data
        const monthlyMap = new Map();
        monthlyDataResult.forEach(row => {
            monthlyMap.set(Number(row.month), {
                count: Number(row.count),
                revenue: Number(row.revenue)
            });
        });

        const ordersMonthlyData = Array.from({ length: 12 }, (_, index) => {
            const month = index + 1;
            const monthData = monthlyMap.get(month);
            return {
                month: month,
                count: monthData ? monthData.count : 0,
                revenue: monthData ? monthData.revenue : 0
            };
        });

        // Format status breakdown
        const orderStatusBreakdown = statusBreakdownResult.map(row => ({
            status: row.status,
            count: Number(row.count)
        }));

        const ordersStats = ordersStatsResult[0];

        const dashboardData = {
            cards: {
                totalUnreadContacts: Number(contactsResult[0]?.count || 0),
                totalDeliveredOrders: Number(ordersStats?.delivered_count || 0),
                totalRevenue: Number(ordersStats?.total_revenue || 0),
                totalProcessingOrders: Number(ordersStats?.processing_count || 0)
            },
            charts: {
                orders: {
                    monthlyData: ordersMonthlyData,
                    summary: {
                        total: Number(ordersStats?.total_orders || 0),
                        revenue: Number(ordersStats?.total_revenue || 0),
                        averageOrderValue: Number(ordersStats?.avg_order_value || 0)
                    },
                    statusBreakdown: orderStatusBreakdown
                }
            }
        };

        return res.status(200).json({
            success: true,
            data: dashboardData
        });
    } catch (error) {
        console.error('Error in getDashboardData:', error);
        return next(error);
    }
};
