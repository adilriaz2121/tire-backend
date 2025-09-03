import express from "express";
import { assignHTTPError, errorResponder, invalidPathHandler } from "../middlewares/error.middlewares.js";
import adminAuthRouter from "./admin.routes.js";
import articlesRouter from "./user.routes.js";

const router = express.Router();

router.use("/admin", adminAuthRouter);
router.use("/user", articlesRouter);

router.use(assignHTTPError);
router.use(errorResponder);
router.use(invalidPathHandler);

export default router;