import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const createProduct = async (req, res, next) => {
    try {
            const { make, model, year, trim, size, mfg, item, detail, description, quantity, price, images } = req.body;
        
        if (!make || !model || !year || !trim || !size || !mfg || !item || !detail || !description || typeof quantity !== 'number' || typeof price !== 'number') {
            return res.status(400).json({ error: "All fields are required: make, model, year, trim, size, mfg, item, detail, description, quantity (number), price (number)" });
        }

        if (images && !Array.isArray(images)) {
            return res.status(400).json({ error: "Images must be an array of URLs" });
        }

        let company = await prisma.company.findUnique({
            where: { name: make }
        });

        if (!company) {
            company = await prisma.company.create({
                data: { name: make }
            });
        }

        const product = await prisma.products.create({
            data: {
                make,
                model,
                year,
                trim,
                size,
                mfg,
                item,
                detail,
                description,
                quantity,
                price,
                images: images || []
            }
        });

        return res.status(201).json({ product });
    } catch (error) {
        return next(error);
    }
};

export const getAllProducts = async (req, res, next) => {
    try {
        const page = Math.max(parseInt(req.query.page || '1', 10), 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit || '10', 10), 1), 100);
        const search = (req.query.q || '').toString().trim();
        const make = (req.query.make || '').toString().trim();
        const model = (req.query.model || '').toString().trim();
        const year = (req.query.year || '').toString().trim();

        const where = {
            ...(search && {
                OR: [
                    { make: { contains: search, mode: 'insensitive' } },
                    { model: { contains: search, mode: 'insensitive' } },
                    { item: { contains: search, mode: 'insensitive' } },
                    { detail: { contains: search, mode: 'insensitive' } },
                    { description: { contains: search, mode: 'insensitive' } },
                ],
            }),
            ...(make && { make: { contains: make, mode: 'insensitive' } }),
            ...(model && { model: { contains: model, mode: 'insensitive' } }),
            ...(year && { year: { contains: year, mode: 'insensitive' } }),
        };

        const [items, total] = await Promise.all([
            prisma.products.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
                include: {
                    reviews: {
                        select: {
                            id: true,
                            name: true,
                            country: true,
                            review: true,
                            rating: true,
                            createdAt: true
                        }
                    }
                }
            }),
            prisma.products.count({ where })
        ]);

        return res.status(200).json({
            items,
            meta: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit) || 1
            }
        });
    } catch (error) {
        return next(error);
    }
};

export const getProduct = async (req, res, next) => {
    try {
        const { id } = req.params;
        const product = await prisma.products.findUnique({
            where: { id },
            include: {
                reviews: {
                    select: {
                        id: true,
                        name: true,
                        country: true,
                        review: true,
                        rating: true,
                        createdAt: true
                    }
                }
            }
        });
        
        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }
        
        return res.status(200).json({ product });
    } catch (error) {
        return next(error);
    }
};

export const updateProduct = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { make, model, year, trim, size, mfg, item, detail, description, quantity, price, images } = req.body;

        // Validate images array if provided
        if (images && !Array.isArray(images)) {
            return res.status(400).json({ error: "Images must be an array of URLs" });
        }

        const product = await prisma.products.update({
            where: { id },
            data: {
                make,
                model,
                year,
                trim,
                size,
                mfg,
                item,
                detail,
                description,
                quantity,
                price,
                images
            }
        });

        return res.status(200).json({ product });
    } catch (error) {
        return next(error);
    }
};

export const deleteProduct = async (req, res, next) => {
    try {
        const { id } = req.params;
        await prisma.products.delete({ where: { id } });
        return res.status(204).send();
    } catch (error) {
        return next(error);
    }
};

export const toggleProductActive = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { isActive } = req.body;
        
        if (typeof isActive !== 'boolean') {
            return res.status(400).json({ error: "isActive must be a boolean value" });
        }

        const product = await prisma.products.update({
            where: { id },
            data: { isActive }
        });

        return res.status(200).json({ 
            success: true,
            message: `Product ${isActive ? 'activated' : 'deactivated'} successfully`,
            product 
        });
    } catch (error) {
        return next(error);
    }
};
