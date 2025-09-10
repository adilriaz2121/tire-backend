import { PrismaClient } from '@prisma/client';
import csv from 'csv-parser';
import XLSX from 'xlsx';
import { Readable } from 'stream';

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

export const bulkUploadProducts = async (req, res, next) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No file uploaded" });
        }

        // Check file size (5MB limit)
        const maxSize = 5 * 1024 * 1024; // 5MB in bytes
        if (req.file.size > maxSize) {
            return res.status(400).json({ 
                error: `File size too large. Maximum allowed size is 5MB. Your file size: ${(req.file.size / (1024 * 1024)).toFixed(2)}MB` 
            });
        }

        // Map Excel column names to database fields (note: Excel has trailing spaces)
        const columnMapping = {
            'Make ': 'make',  // Note the trailing space
            'Model': 'model', 
            'Year ': 'year',  // Note the trailing space
            'Trim': 'trim',
            'Size': 'size',
            'Mfg': 'mfg',
            'Item': 'item',
            'Description': 'detail',
            'Qty': 'quantity',
            'pictures': 'images', 
            'desc': 'description', 
            'Price': 'price'
        };

        const requiredColumns = ['Make ', 'Model', 'Year ', 'Trim', 'Size', 'Mfg', 'Item', 'Description', 'Qty', 'desc', 'Price'];

        let products = [];
        const fileExtension = req.file.originalname.split('.').pop().toLowerCase();

        if (fileExtension === 'csv') {
            products = await parseCSV(req.file.buffer, requiredColumns);
        } else if (['xlsx', 'xls'].includes(fileExtension)) {
            products = await parseExcel(req.file.buffer, requiredColumns);
        } else {
            return res.status(400).json({ error: "Unsupported file format. Please upload CSV or Excel files." });
        }

        if (products.length === 0) {
            return res.status(400).json({ error: "No valid products found in the file" });
        }

        console.log("🚀 ~ Raw products from file:", JSON.stringify(products.slice(0, 2), null, 2)); // Log first 2 products
        console.log("🚀 ~ Total products found:", products.length);

        // Map Excel columns to database fields and validate
        const validationErrors = [];
        const mappedProducts = [];

        for (let i = 0; i < products.length; i++) {
            const excelProduct = products[i];
            const rowNumber = i + 2; // +2 because array is 0-indexed and we skip header
            const mappedProduct = {};

            console.log(`🚀 ~ Processing row ${rowNumber}:`, JSON.stringify(excelProduct, null, 2));

            // Map Excel columns to database fields
            for (const [excelColumn, dbField] of Object.entries(columnMapping)) {
                if (excelProduct[excelColumn] !== undefined) {
                    mappedProduct[dbField] = excelProduct[excelColumn];
                }
            }

            console.log(`🚀 ~ Mapped product for row ${rowNumber}:`, JSON.stringify(mappedProduct, null, 2));

            // Check required fields
            for (const column of requiredColumns) {
                if (!excelProduct[column] || excelProduct[column].toString().trim() === '') {
                    console.log(`❌ ~ Missing required field: ${column} in row ${rowNumber}`);
                    validationErrors.push(`Row ${rowNumber}: ${column} is required`);
                }
            }

            // Validate numeric fields
            if (mappedProduct.quantity && isNaN(parseInt(mappedProduct.quantity))) {
                validationErrors.push(`Row ${rowNumber}: Qty must be a number`);
            }
            if (mappedProduct.price && isNaN(parseFloat(mappedProduct.price))) {
                validationErrors.push(`Row ${rowNumber}: Price must be a number`);
            }

            // Process images (pictuyred column)
            if (mappedProduct.images && typeof mappedProduct.images === 'string') {
                mappedProduct.images = mappedProduct.images.split(',').map(url => url.trim()).filter(url => url);
            } else if (mappedProduct.images && !Array.isArray(mappedProduct.images)) {
                validationErrors.push(`Row ${rowNumber}: pictuyred must be comma-separated URLs`);
            } else if (!mappedProduct.images) {
                mappedProduct.images = [];
            }

            mappedProducts.push(mappedProduct);
        }

        if (validationErrors.length > 0) {
            console.log("❌ ~ Validation errors found:", validationErrors);
            return res.status(400).json({ 
                error: "Validation errors found", 
                details: validationErrors 
            });
        }

        console.log("✅ ~ All validation passed, processing products...");

        // Process mapped products and create companies
        const results = {
            success: 0,
            failed: 0,
            errors: []
        };

        for (let i = 0; i < mappedProducts.length; i++) {
            try {
                const product = mappedProducts[i];
                const rowNumber = i + 2;

                console.log(`🚀 ~ Creating product for row ${rowNumber}:`, JSON.stringify(product, null, 2));

                // Handle company creation
                let company = await prisma.company.findUnique({
                    where: { name: product.make }
                });

                if (!company) {
                    console.log(`🚀 ~ Creating new company: ${product.make}`);
                    company = await prisma.company.create({
                        data: { name: product.make }
                    });
                } else {
                    console.log(`✅ ~ Company exists: ${product.make}`);
                }

                // Create product
                const createdProduct = await prisma.products.create({
                    data: {
                        make: product.make,
                        model: product.model,
                        year: product.year.toString(), // Convert year to string
                        trim: product.trim,
                        size: product.size,
                        mfg: product.mfg,
                        item: product.item.toString(), // Convert item to string in case it's a number
                        detail: product.detail,
                        description: product.description,
                        quantity: parseInt(product.quantity),
                        price: parseFloat(product.price),
                        images: product.images || [],
                        isActive: true // Default to active for bulk uploads
                    }
                });

                console.log(`✅ ~ Product created successfully for row ${rowNumber}:`, createdProduct.id);
                results.success++;
            } catch (error) {
                console.log(`❌ ~ Error creating product for row ${i + 2}:`, error.message);
                results.failed++;
                results.errors.push(`Row ${i + 2}: ${error.message}`);
            }
        }

        return res.status(200).json({
            success: true,
            message: `Bulk upload completed. ${results.success} products created, ${results.failed} failed.`,
            results
        });

    } catch (error) {
        return next(error);
    }
};

// Helper function to parse CSV
const parseCSV = (buffer, requiredColumns) => {
    return new Promise((resolve, reject) => {
        const products = [];
        const stream = Readable.from(buffer.toString());
        
        stream
            .pipe(csv())
            .on('data', (row) => {
                products.push(row);
            })
            .on('end', () => {
                resolve(products);
            })
            .on('error', (error) => {
                reject(error);
            });
    });
};

// Helper function to parse Excel
const parseExcel = (buffer, requiredColumns) => {
    try {
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);
        return jsonData;
    } catch (error) {
        throw new Error('Failed to parse Excel file');
    }
};
