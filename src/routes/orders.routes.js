import express from "express";
import { errorHandler } from "../handlers/error.handlers.js";
import { getAllOrders, getOrderById, updateOrderStatus, getOrderStats, shipOrder } from "../controllers/orders.controller.js";

const ordersRouter = express.Router();

// Get all orders with filters and pagination
ordersRouter.get("/", errorHandler(getAllOrders));

// Get order statistics (must be before /:id to avoid conflict)
ordersRouter.get("/stats/overview", errorHandler(getOrderStats));

// Get order by ID
ordersRouter.get("/:id", errorHandler(getOrderById));

// Update order (status and/or shippingLocation)
ordersRouter.patch("/:id", errorHandler(updateOrderStatus));

// Ship order via FedEx
ordersRouter.post("/:id/ship", errorHandler(shipOrder));

export default ordersRouter;
