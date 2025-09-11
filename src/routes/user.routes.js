import express from "express";
import { errorHandler } from "../handlers/error.handlers.js";
import { getAllArticles, getArticleDetail } from "../controllers/articles.controller.js";
import { getAllProducts, getProduct } from "../controllers/products.controller.js";
import { getFitment, getFilteredProducts } from "../controllers/fitment.controller.js";
import { applyCoupon, validateCoupon } from "../controllers/coupon-apply.controller.js";
import { createContact } from "../controllers/contact.controller.js";
import { createReview, getAllReviews, getReview, getProductReviews } from "../controllers/reviews.controller.js";

const userRouter = express.Router();

// Articles
userRouter.get("/articles", errorHandler(getAllArticles));
userRouter.get("/articles/:id", errorHandler(getArticleDetail));

// Products
userRouter.get("/products", errorHandler(getAllProducts));
userRouter.get("/products/filter", errorHandler(getFilteredProducts));
userRouter.get("/products/:id", errorHandler(getProduct));
userRouter.get("/fitment", errorHandler(getFitment));

// Coupons
userRouter.post("/coupons/apply", errorHandler(applyCoupon));
userRouter.get("/coupons/validate/:code", errorHandler(validateCoupon));

// Contact
userRouter.post("/contact", errorHandler(createContact));

// Reviews
userRouter.post("/reviews", errorHandler(createReview));
userRouter.get("/reviews", errorHandler(getAllReviews));
userRouter.get("/reviews/:id", errorHandler(getReview));
userRouter.get("/products/:productId/reviews", errorHandler(getProductReviews));

export default userRouter;
