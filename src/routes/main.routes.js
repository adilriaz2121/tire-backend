import express from "express";
import { assignHTTPError, errorResponder, invalidPathHandler } from "../middlewares/error.middlewares.js";
import adminAuthRouter from "./admin.routes.js";

const router = express.Router();

router.use("/admin", adminAuthRouter);


router.use(assignHTTPError);
router.use(errorResponder);
router.use(invalidPathHandler);

export default router;