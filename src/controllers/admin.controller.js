import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const handleError = (res, statusCode, message) => {
    return res.status(statusCode).json({ error: message });
};

export const signAdminIn = async (req, res) => {
    try {
        const { email, password } = req.body;
        console.log("🚀 ~ signAdminIn ~ req.body:", req.body)
        if (!email || !password) {
            return handleError(res, 400, "Email and password are required");
        }

        const normalizedEmail = String(email).toLowerCase();

        const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
        if (!user) {
            return handleError(res, 401, "Incorrect credentials");
        }

        if (user.roles !== "admin") {
            return handleError(res, 403, "No Admin Found");
        }

        if (!user.password) {
            return handleError(res, 401, "Incorrect credentials");
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return handleError(res, 401, "Incorrect credentials");
        }

        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret) {
            return handleError(res, 500, "JWT secret not configured");
        }

        const token = jwt.sign({ id: user.id }, jwtSecret, {
            expiresIn: "15d",
        });
        return res.status(200).json({ token, user });
    } catch (err) {
        console.log("🚀 ~ signAdminIn ~ err:", err)
        return handleError(res, 500, "Internal server error");
    }
};