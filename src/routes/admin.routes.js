import express from "express";
import { errorHandler } from "../handlers/error.handlers.js";
import { authGuard } from "../middlewares/auth.middleware.js";
import { signAdminIn, uploadImage } from "../controllers/admin.controller.js";
import { createArticle, updateArticle, deleteArticle } from "../controllers/articles.controller.js";
import multer from "multer";

const upload = multer({ storage: multer.memoryStorage() });

const adminAuthRouter = express.Router();

adminAuthRouter.post("/signin", errorHandler(signAdminIn));
adminAuthRouter.post("/upload", authGuard('admin'), upload.single('file'), errorHandler(uploadImage));

adminAuthRouter.post("/articles", authGuard('admin'), errorHandler(createArticle));
adminAuthRouter.put("/articles/:id", authGuard('admin'), errorHandler(updateArticle));
adminAuthRouter.delete("/articles/:id", authGuard('admin'), errorHandler(deleteArticle));

export default adminAuthRouter;