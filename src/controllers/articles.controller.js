import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const createArticle = async (req, res, next) => {
    try {
        const { title, detail, content, image } = req.body;
        if (!title || !detail || !content || !image) {
            return res.status(400).json({ error: "title, detail, content, and image are required" });
        }

        const article = await prisma.articles.create({
            data: { title, detail, content, image }
        });

        return res.status(201).json({ article });
    } catch (error) {
        return next(error);
    }
};

export const updateArticle = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { title, detail, content, image } = req.body;

        const article = await prisma.articles.update({
            where: { id },
            data: { title, detail, content, image }
        });

        return res.status(200).json({ article });
    } catch (error) {
        return next(error);
    }
};

export const deleteArticle = async (req, res, next) => {
    try {
        const { id } = req.params;

        await prisma.articles.delete({ where: { id } });
        return res.status(204).send();
    } catch (error) {
        return next(error);
    }
};

export const getAllArticles = async (req, res, next) => {
    try {
        const page = Math.max(parseInt(req.query.page || '1', 10), 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit || '10', 10), 1), 100);
        const search = (req.query.q || '').toString().trim();

        const where = search
            ? {
                OR: [
                    { title: { contains: search, mode: 'insensitive' } },
                    { detail: { contains: search, mode: 'insensitive' } },
                    { content: { contains: search, mode: 'insensitive' } },
                ],
              }
            : {};

        const [items, total] = await Promise.all([
            prisma.articles.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
            prisma.articles.count({ where }),
        ]);

        const totalPages = Math.ceil(total / limit) || 1;

        return res.status(200).json({
            items,
            meta: {
                page,
                limit,
                total,
                totalPages,
            },
        });
    } catch (error) {
        return next(error);
    }
};

export const getArticleDetail = async (req, res, next) => {
    try {
        const { id } = req.params;
        const article = await prisma.articles.findUnique({ where: { id } });
        if (!article) {
            return res.status(404).json({ error: 'Article not found' });
        }
        return res.status(200).json({ article });
    } catch (error) {
        return next(error);
    }
};
