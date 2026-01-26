import express from "express";
import { errorHandler } from "../handlers/error.handlers.js";
import { authGuard } from "../middlewares/auth.middleware.js";
import {
    getAdminStats,
    getProductsChartData,
    getOrdersChartData,
    getDashboardData
} from "../controllers/stats.controller.js";

const statsRouter = express.Router();

// All stats routes require admin authentication
statsRouter.get("/dashboard", authGuard('admin'), errorHandler(getDashboardData));
statsRouter.get("/cards", authGuard('admin'), errorHandler(getAdminStats));
statsRouter.get("/charts/products", authGuard('admin'), errorHandler(getProductsChartData));
statsRouter.get("/charts/orders", authGuard('admin'), errorHandler(getOrdersChartData));

export default statsRouter;
