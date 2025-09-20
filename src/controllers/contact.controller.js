import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// User creates a contact message
export const createContact = async (req, res, next) => {
    try {
        const { name, email, phone, subject, message } = req.body;

        // Validate required fields
        if (!name || !email || !subject || !message) {
            return res.status(400).json({
                success: false,
                error: 'Name, email, subject, and message are required'
            });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                success: false,
                error: 'Please provide a valid email address'
            });
        }

        // Validate phone format (basic validation)
        if (phone && phone.length < 10) {
            return res.status(400).json({
                success: false,
                error: 'Please provide a valid phone number'
            });
        }

        const contact = await prisma.contact.create({
            data: {
                name: name.trim(),
                email: email.trim().toLowerCase(),
                phone: phone ? phone.trim() : '',
                subject: subject.trim(),
                message: message.trim(),
                isRead: 'false'
            },
            select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                subject: true,
                message: true,
                isRead: true,
                createdAt: true
            }
        });

        return res.status(201).json({
            success: true,
            message: 'Your message has been sent successfully. We will get back to you soon!',
            data: { contact }
        });

    } catch (error) {
        console.error('Error creating contact:', error);
        return next(error);
    }
};

// Admin gets all contacts with filters and pagination
export const getAllContacts = async (req, res, next) => {
    try {
        const page = Math.max(parseInt(req.query.page || '1', 10), 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit || '10', 10), 1), 100);
        
        // Filter parameters
        const isRead = req.query.isRead?.toString().trim();
        const email = req.query.email?.toString().trim();
        const name = req.query.name?.toString().trim();
        const subject = req.query.subject?.toString().trim();
        const dateFrom = req.query.dateFrom?.toString().trim();
        const dateTo = req.query.dateTo?.toString().trim();
        const search = req.query.search?.toString().trim();

        // Build where clause
        const where = {};

        // Read status filter
        if (isRead && ['true', 'false'].includes(isRead)) {
            where.isRead = isRead;
        }

        // Email filter
        if (email) {
            where.email = { contains: email, mode: 'insensitive' };
        }

        // Name filter
        if (name) {
            where.name = { contains: name, mode: 'insensitive' };
        }

        // Subject filter
        if (subject) {
            where.subject = { contains: subject, mode: 'insensitive' };
        }

        // Date range filters
        if (dateFrom || dateTo) {
            where.createdAt = {};
            if (dateFrom) {
                where.createdAt.gte = new Date(dateFrom);
            }
            if (dateTo) {
                where.createdAt.lte = new Date(dateTo);
            }
        }

        // Search filter (searches across multiple fields)
        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
                { subject: { contains: search, mode: 'insensitive' } },
                { message: { contains: search, mode: 'insensitive' } }
            ];
        }

        // Get total count for pagination
        const total = await prisma.contact.count({ where });

        // Get contacts with pagination
        const contacts = await prisma.contact.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip: (page - 1) * limit,
            take: limit,
            select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                subject: true,
                message: true,
                isRead: true,
                createdAt: true,
                updatedAt: true
            }
        });

        // Calculate pagination info
        const totalPages = Math.ceil(total / limit) || 1;
        const hasNextPage = page < totalPages;
        const hasPrevPage = page > 1;

        return res.status(200).json({
            success: true,
            data: {
                contacts,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages,
                    hasNextPage,
                    hasPrevPage,
                    nextPage: hasNextPage ? page + 1 : null,
                    prevPage: hasPrevPage ? page - 1 : null
                }
            }
        });

    } catch (error) {
        console.error('Error fetching contacts:', error);
        return next(error);
    }
};

// Admin gets contact by ID
export const getContactById = async (req, res, next) => {
    try {
        const { id } = req.params;

        // Validate ObjectId format
        if (!/^[a-fA-F0-9]{24}$/.test(id)) {
            return res.status(400).json({ 
                success: false,
                error: 'Invalid contact ID format' 
            });
        }

        const contact = await prisma.contact.findUnique({
            where: { id },
            select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                subject: true,
                message: true,
                isRead: true,
                createdAt: true,
                updatedAt: true
            }
        });

        if (!contact) {
            return res.status(404).json({
                success: false,
                error: 'Contact not found'
            });
        }

        return res.status(200).json({
            success: true,
            data: { contact }
        });

    } catch (error) {
        console.error('Error fetching contact:', error);
        return next(error);
    }
};

// Admin marks contact as read
export const markContactAsRead = async (req, res, next) => {
    try {
        const { id } = req.params;

        // Validate ObjectId format
        if (!/^[a-fA-F0-9]{24}$/.test(id)) {
            return res.status(400).json({ 
                success: false,
                error: 'Invalid contact ID format' 
            });
        }

        const contact = await prisma.contact.update({
            where: { id },
            data: { isRead: 'true' },
            select: {
                id: true,
                name: true,
                email: true,
                subject: true,
                isRead: true,
                updatedAt: true
            }
        });

        return res.status(200).json({
            success: true,
            message: 'Contact marked as read',
            data: { contact }
        });

    } catch (error) {
        if (error.code === 'P2025') {
            return res.status(404).json({
                success: false,
                error: 'Contact not found'
            });
        }
        console.error('Error marking contact as read:', error);
        return next(error);
    }
};

// Admin marks all contacts as read
export const markAllContactsAsRead = async (req, res, next) => {
    try {
        const result = await prisma.contact.updateMany({
            where: { isRead: 'false' },
            data: { isRead: 'true' }
        });

        return res.status(200).json({
            success: true,
            message: `${result.count} contacts marked as read`,
            data: { updatedCount: result.count }
        });

    } catch (error) {
        console.error('Error marking all contacts as read:', error);
        return next(error);
    }
};

// Admin deletes a contact
export const deleteContact = async (req, res, next) => {
    try {
        const { id } = req.params;

        // Validate ObjectId format
        if (!/^[a-fA-F0-9]{24}$/.test(id)) {
            return res.status(400).json({ 
                success: false,
                error: 'Invalid contact ID format' 
            });
        }

        await prisma.contact.delete({
            where: { id }
        });

        return res.status(200).json({
            success: true,
            message: 'Contact deleted successfully'
        });

    } catch (error) {
        if (error.code === 'P2025') {
            return res.status(404).json({
                success: false,
                error: 'Contact not found'
            });
        }
        console.error('Error deleting contact:', error);
        return next(error);
    }
};

// Admin deletes multiple contacts
export const deleteMultipleContacts = async (req, res, next) => {
    try {
        const { contactIds } = req.body;

        if (!Array.isArray(contactIds) || contactIds.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'contactIds array is required and must not be empty'
            });
        }

        // Validate all IDs
        const invalidIds = contactIds.filter(id => !/^[a-fA-F0-9]{24}$/.test(id));
        if (invalidIds.length > 0) {
            return res.status(400).json({
                success: false,
                error: 'Invalid contact ID format(s)',
                invalidIds
            });
        }

        const result = await prisma.contact.deleteMany({
            where: {
                id: { in: contactIds }
            }
        });

        return res.status(200).json({
            success: true,
            message: `${result.count} contacts deleted successfully`,
            data: { deletedCount: result.count }
        });

    } catch (error) {
        console.error('Error deleting multiple contacts:', error);
        return next(error);
    }
};

// Admin gets contact statistics
export const getContactStats = async (req, res, next) => {
    try {
        const stats = await prisma.contact.aggregate({
            _count: {
                id: true
            }
        });

        // Get read/unread breakdown
        const readStatus = await prisma.contact.groupBy({
            by: ['isRead'],
            _count: {
                id: true
            }
        });

        // Get recent contacts count (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const recentContacts = await prisma.contact.count({
            where: {
                createdAt: {
                    gte: thirtyDaysAgo
                }
            }
        });

        // Get unread count
        const unreadCount = await prisma.contact.count({
            where: { isRead: 'false' }
        });

        return res.status(200).json({
            success: true,
            data: {
                totalContacts: stats._count.id,
                unreadContacts: unreadCount,
                recentContacts,
                readStatus: readStatus.map(item => ({
                    status: item.isRead === 'true' ? 'read' : 'unread',
                    count: item._count.id
                }))
            }
        });

    } catch (error) {
        console.error('Error fetching contact stats:', error);
        return next(error);
    }
};