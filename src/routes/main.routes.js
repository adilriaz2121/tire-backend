import express from "express";
import { assignHTTPError, errorResponder, invalidPathHandler } from "../middlewares/error.middlewares.js";
import adminAuthRouter from "./admin.routes.js";
import articlesRouter from "./user.routes.js";
import ordersRouter from "./orders.routes.js";
import contactRouter from "./contact.routes.js";

const router = express.Router();

router.use("/admin", adminAuthRouter);
router.use("/user", articlesRouter);
router.use("/orders", ordersRouter);
router.use("/contacts", contactRouter);

router.use(assignHTTPError);
router.use(errorResponder);
router.use(invalidPathHandler);

export default router;