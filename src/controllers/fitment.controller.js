import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();


export const getFitment = async (req, res, next) => {
    try {
        const step = parseInt((req.query.step || '1'), 10);
        const company = (req.query.company || '').toString().trim();
        const year = (req.query.year || '').toString().trim();
        const model = (req.query.model || '').toString().trim();

        if (Number.isNaN(step) || step < 1 || step > 4) {
            return res.status(400).json({ error: 'Invalid step. Must be 1-4.' });
        }

        if (step === 1) {
            // Return all companies
            const companies = await prisma.company.findMany({
                select: { name: true },
                orderBy: { name: 'asc' }
            });
            return res.status(200).json({ step, companies: companies.map(c => c.name) });
        }

        if (step === 2) {
            if (!company) {
                return res.status(400).json({ error: 'company is required for step 2' });
            }
            const years = await prisma.products.findMany({
                where: { make: { equals: company, mode: 'insensitive' } },
                distinct: ['year'],
                select: { year: true },
                orderBy: { year: 'desc' }
            });
            return res.status(200).json({ step, company, years: years.map(y => y.year) });
        }

        if (step === 3) {
            if (!company || !year) {
                return res.status(400).json({ error: 'company and year are required for step 3' });
            }
            const models = await prisma.products.findMany({
                where: {
                    make: { equals: company, mode: 'insensitive' },
                    year: { equals: year }
                },
                distinct: ['model'],
                select: { model: true },
                orderBy: { model: 'asc' }
            });
            return res.status(200).json({ step, company, year, models: models.map(m => m.model) });
        }

        // step 4
        if (!company || !year || !model) {
            return res.status(400).json({ error: 'company, year and model are required for step 4' });
        }
        const sizes = await prisma.products.findMany({
            where: {
                make: { equals: company, mode: 'insensitive' },
                year: { equals: year },
                model: { equals: model, mode: 'insensitive' }
            },
            distinct: ['size'],
            select: { size: true },
            orderBy: { size: 'asc' }
        });
        return res.status(200).json({ step, company, year, model, sizes: sizes.map(s => s.size) });
    } catch (error) {
        return next(error);
    }
};

// Paginated products filtered by company(make), year, model, size
export const getFilteredProducts = async (req, res, next) => {
    try {
        const page = Math.max(parseInt(req.query.page || '1', 10), 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit || '12', 10), 1), 100);
        const company = (req.query.company || req.query.make || '').toString().trim();
        const model = (req.query.model || '').toString().trim();
        const year = (req.query.year || '').toString().trim();
        const size = (req.query.size || '').toString().trim();

        // Determine size filter: if it's a rim diameter like "16" or "17", use endsWith
        const sizeCondition = size
            ? (/^\d{2,3}$/.test(size)
                ? { endsWith: size, mode: 'insensitive' }
                : { equals: size, mode: 'insensitive' })
            : undefined;

        const where = {
            ...(company && { make: { contains: company, mode: 'insensitive' } }),
            ...(model && { model: { contains: model, mode: 'insensitive' } }),
            ...(year && { year: { equals: year } }),
            ...(sizeCondition && { size: sizeCondition }),
            isActive: true
        };

        const [items, total] = await Promise.all([
            prisma.products.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
                include: {
                    reviews: {
                        select: { id: true, name: true, country: true, review: true, rating: true, createdAt: true }
                    }
                }
            }),
            prisma.products.count({ where })
        ]);

        return res.status(200).json({
            items,
            meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 }
        });
    } catch (error) {
        return next(error);
    }
};

// Sizes flow: step 1 returns all unique sizes, step 2 returns sizes ending with provided rim (e.g., "16")
export const getSizeOptions = async (req, res, next) => {
    try {
        const step = Math.max(parseInt((req.query.step || '1'), 10), 1);
        const rim = (req.query.rim || req.query.end || '').toString().trim();

        if (Number.isNaN(step) || step < 1 || step > 2) {
            return res.status(400).json({ error: 'Invalid step. Must be 1-2.' });
        }

        if (step === 1) {
            const sizes = await prisma.products.findMany({
                distinct: ['size'],
                select: { size: true },
                orderBy: { size: 'asc' }
            });
            return res.status(200).json({ step, sizes: sizes.map(s => s.size) });
        }

        // step 2
        if (!rim) {
            return res.status(400).json({ error: 'rim is required for step 2' });
        }

        const sizes = await prisma.products.findMany({
            where: { size: { endsWith: rim, mode: 'insensitive' } },
            distinct: ['size'],
            select: { size: true },
            orderBy: { size: 'asc' }
        });

        return res.status(200).json({ step, rim, sizes: sizes.map(s => s.size) });
    } catch (error) {
        return next(error);
    }
};


