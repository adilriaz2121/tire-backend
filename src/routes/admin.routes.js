import express from "express";
import { errorHandler } from "../handlers/error.handlers.js";
import { authGuard } from "../middlewares/auth.middleware.js";
import { signAdminIn, uploadImage } from "../controllers/admin.controller.js";
import { createArticle, updateArticle, deleteArticle } from "../controllers/articles.controller.js";
import { createCoupon, listCoupons, getCoupon, updateCoupon, deleteCoupon, setCouponActive, incrementCouponUsage } from "../controllers/coupons.controller.js";
import { getAllContacts, getContactById, markContactAsRead, markAllContactsAsRead, deleteContact, deleteMultipleContacts, getContactStats } from "../controllers/contact.controller.js";
import { getAllReviews, getReview, updateReview, deleteReview } from "../controllers/reviews.controller.js";
import multer from "multer";

const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    }
});

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

// Contacts
adminAuthRouter.get("/contacts", authGuard('admin'), errorHandler(getAllContacts));
adminAuthRouter.get("/contacts/stats", authGuard('admin'), errorHandler(getContactStats));
adminAuthRouter.get("/contacts/:id", authGuard('admin'), errorHandler(getContactById));
adminAuthRouter.patch("/contacts/:id/read", authGuard('admin'), errorHandler(markContactAsRead));
adminAuthRouter.patch("/contacts/mark-all-read", authGuard('admin'), errorHandler(markAllContactsAsRead));
adminAuthRouter.delete("/contacts/:id", authGuard('admin'), errorHandler(deleteContact));
adminAuthRouter.delete("/contacts/bulk/delete", authGuard('admin'), errorHandler(deleteMultipleContacts));

// Reviews
adminAuthRouter.get("/reviews", errorHandler(getAllReviews));
adminAuthRouter.get("/reviews/:id", authGuard('admin'), errorHandler(getReview));
adminAuthRouter.put("/reviews/:id", authGuard('admin'), errorHandler(updateReview));
adminAuthRouter.delete("/reviews/:id", authGuard('admin'), errorHandler(deleteReview));

export default adminAuthRouter;