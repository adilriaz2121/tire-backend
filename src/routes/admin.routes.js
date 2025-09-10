import express from "express";
import { errorHandler } from "../handlers/error.handlers.js";
import { authGuard } from "../middlewares/auth.middleware.js";
import { signAdminIn, uploadImage } from "../controllers/admin.controller.js";
import { createArticle, updateArticle, deleteArticle } from "../controllers/articles.controller.js";
import { createCoupon, listCoupons, getCoupon, updateCoupon, deleteCoupon, setCouponActive, incrementCouponUsage } from "../controllers/coupons.controller.js";
import { createProduct, getAllProducts, getProduct, updateProduct, deleteProduct, toggleProductActive } from "../controllers/products.controller.js";
import { getAllContacts, getContact, updateContactStatus, deleteContact } from "../controllers/contact.controller.js";
import { getAllReviews, getReview, updateReview, deleteReview } from "../controllers/reviews.controller.js";
import multer from "multer";

const upload = multer({ storage: multer.memoryStorage() });

const adminAuthRouter = express.Router();

adminAuthRouter.post("/signin", errorHandler(signAdminIn));
adminAuthRouter.post("/upload", authGuard('admin'), upload.single('file'), errorHandler(uploadImage));

// Articles
adminAuthRouter.post("/articles", authGuard('admin'), errorHandler(createArticle));
adminAuthRouter.put("/articles/:id", authGuard('admin'), errorHandler(updateArticle));
adminAuthRouter.delete("/articles/:id", authGuard('admin'), errorHandler(deleteArticle));

// Coupons
adminAuthRouter.post("/coupons", authGuard('admin'), errorHandler(createCoupon));
adminAuthRouter.get("/coupons", authGuard('admin'), errorHandler(listCoupons));
adminAuthRouter.get("/coupons/:id", authGuard('admin'), errorHandler(getCoupon));
adminAuthRouter.put("/coupons/:id", authGuard('admin'), errorHandler(updateCoupon));
adminAuthRouter.delete("/coupons/:id", authGuard('admin'), errorHandler(deleteCoupon));
adminAuthRouter.patch("/coupons/:id/active", authGuard('admin'), errorHandler(setCouponActive));
adminAuthRouter.post("/coupons/:id/increment", authGuard('admin'), errorHandler(incrementCouponUsage));

// Products
adminAuthRouter.post("/products", authGuard('admin'), errorHandler(createProduct));
adminAuthRouter.get("/products", authGuard('admin'), errorHandler(getAllProducts));
adminAuthRouter.get("/products/:id", authGuard('admin'), errorHandler(getProduct));
adminAuthRouter.put("/products/:id", authGuard('admin'), errorHandler(updateProduct));
adminAuthRouter.delete("/products/:id", authGuard('admin'), errorHandler(deleteProduct));
adminAuthRouter.patch("/products/:id/toggle-active", authGuard('admin'), errorHandler(toggleProductActive));

// Contacts
adminAuthRouter.get("/contacts", authGuard('admin'), errorHandler(getAllContacts));
adminAuthRouter.get("/contacts/:id", authGuard('admin'), errorHandler(getContact));
adminAuthRouter.patch("/contacts/:id/status", authGuard('admin'), errorHandler(updateContactStatus));
adminAuthRouter.delete("/contacts/:id", authGuard('admin'), errorHandler(deleteContact));

// Reviews
adminAuthRouter.get("/reviews", authGuard('admin'), errorHandler(getAllReviews));
adminAuthRouter.get("/reviews/:id", authGuard('admin'), errorHandler(getReview));
adminAuthRouter.put("/reviews/:id", authGuard('admin'), errorHandler(updateReview));
adminAuthRouter.delete("/reviews/:id", authGuard('admin'), errorHandler(deleteReview));

export default adminAuthRouter;