import express from "express";
import { errorHandler } from "../handlers/error.handlers.js";
import { getAllOrders, getOrderById, updateOrderStatus, getOrderStats } from "../controllers/orders.controller.js";

const ordersRouter = express.Router();

// Get all orders with filters and pagination
ordersRouter.get("/", errorHandler(getAllOrders));

// Get order by ID
ordersRouter.get("/:id", errorHandler(getOrderById));

// Update order status
ordersRouter.patch("/:id/status", errorHandler(updateOrderStatus));

// Get order statistics
ordersRouter.get("/stats/overview", errorHandler(getOrderStats));

export default ordersRouter;
