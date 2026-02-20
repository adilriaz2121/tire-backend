import express from "express";
import { errorHandler } from "../handlers/error.handlers.js";
import { getAllArticles, getArticleDetail } from "../controllers/articles.controller.js";
import { getFitment, getFilteredProducts, getSizeOptions } from "../controllers/fitment.controller.js";
import { getProductDetailsById, getStockMatchedProducts, getCartProducts, getFilterOptions } from "../controllers/products.controller.js";
import { createPaymentIntent, stripeWebhook } from "../controllers/payments.controller.js";
import { applyCoupon, validateCoupon } from "../controllers/coupon-apply.controller.js";
import { createContact } from "../controllers/contact.controller.js";
import { createReview, getAllReviews, getReview, getProductReviews } from "../controllers/reviews.controller.js";
import { handleChat, identifyVehicle } from "../controllers/ai.controller.js";
import { searchBusinesses, getBusinessDetails } from "../controllers/yelp.controller.js";
import { validateAddressHandler } from "../controllers/address.controller.js";

const userRouter = express.Router();

userRouter.get("/articles", errorHandler(getAllArticles));
userRouter.get("/articles/:id", errorHandler(getArticleDetail));

userRouter.get("/products/filter", errorHandler(getFilteredProducts));
userRouter.get("/products/stocked", errorHandler(getStockMatchedProducts));
userRouter.get("/products/filter-options", errorHandler(getFilterOptions));
userRouter.get("/products/cart", errorHandler(getCartProducts));
userRouter.get("/products/:id", errorHandler(getProductDetailsById));
userRouter.get("/fitment", errorHandler(getFitment));
userRouter.get("/sizes", errorHandler(getSizeOptions));

userRouter.post("/payments/create-intent", errorHandler(createPaymentIntent));
userRouter.post("/payments/webhook", stripeWebhook);

userRouter.post("/coupons/apply", errorHandler(applyCoupon));
userRouter.get("/coupons/validate/:code", errorHandler(validateCoupon));

userRouter.post("/contact", errorHandler(createContact));

userRouter.post("/reviews", errorHandler(createReview));
userRouter.get("/reviews", errorHandler(getAllReviews));
userRouter.get("/reviews/:id", errorHandler(getReview));
userRouter.get("/products/:productId/reviews", errorHandler(getProductReviews));

userRouter.post("/ai/query", errorHandler(handleChat));
userRouter.post("/ai/identify-vehicle", errorHandler(identifyVehicle));

userRouter.get("/yelp/businesses/search", errorHandler(searchBusinesses));
userRouter.get("/yelp/businesses/:id", errorHandler(getBusinessDetails));

userRouter.post("/validate-address", errorHandler(validateAddressHandler));

export default userRouter;
