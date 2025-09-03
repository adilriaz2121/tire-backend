import express from "express";
import { errorHandler } from "../handlers/error.handlers.js";
import { authGuard } from "../middlewares/auth.middleware.js";
import { signAdminIn } from "../controllers/admin.controller.js";

const adminAuthRouter = express.Router();

adminAuthRouter.post("/signin", errorHandler(signAdminIn));

export default adminAuthRouter;