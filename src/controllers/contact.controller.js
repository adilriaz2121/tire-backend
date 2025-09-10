import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const createContact = async (req, res, next) => {
    try {
        const { name, email, subject, message, phone } = req.body;
        
        if (!name || !email || !subject || !message) {
            return res.status(400).json({ error: "Name, email, subject, and message are required" });
        }

        const contact = await prisma.contact.create({
            data: {
                name,
                email,
                subject,
                message,
                phone: phone || null
            }
        });

        return res.status(201).json({ 
            success: true,
            message: "Contact form submitted successfully",
            contact 
        });
    } catch (error) {
        return next(error);
    }
};

export const getAllContacts = async (req, res, next) => {
    try {
        const page = Math.max(parseInt(req.query.page || '1', 10), 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit || '10', 10), 1), 100);
        const search = (req.query.q || '').toString().trim();
        const status = req.query.status;

        const where = {
            ...(search && {
                OR: [
                    { name: { contains: search, mode: 'insensitive' } },
                    { email: { contains: search, mode: 'insensitive' } },
                    { subject: { contains: search, mode: 'insensitive' } },
                    { message: { contains: search, mode: 'insensitive' } },
                ],
            }),
            ...(status && { status })
        };

        const [items, total] = await Promise.all([
            prisma.contact.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit
            }),
            prisma.contact.count({ where })
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

export const getContact = async (req, res, next) => {
    try {
        const { id } = req.params;
        const contact = await prisma.contact.findUnique({ where: { id } });
        
        if (!contact) {
            return res.status(404).json({ error: 'Contact not found' });
        }
        
        return res.status(200).json({ contact });
    } catch (error) {
        return next(error);
    }
};

export const updateContactStatus = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        
        if (!status) {
            return res.status(400).json({ error: "Status is required" });
        }

        const contact = await prisma.contact.update({
            where: { id },
            data: { status }
        });

        return res.status(200).json({ contact });
    } catch (error) {
        return next(error);
    }
};

export const deleteContact = async (req, res, next) => {
    try {
        const { id } = req.params;
        await prisma.contact.delete({ where: { id } });
        return res.status(204).send();
    } catch (error) {
        return next(error);
    }
};
