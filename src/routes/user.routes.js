import express from "express";
import { errorHandler } from "../handlers/error.handlers.js";
import { getAllArticles, getArticleDetail } from "../controllers/articles.controller.js";

const articlesRouter = express.Router();

articlesRouter.get("/articles", errorHandler(getAllArticles));
articlesRouter.get("/articles/:id", errorHandler(getArticleDetail));

export default articlesRouter;
