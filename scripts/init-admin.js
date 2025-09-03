import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();

async function createFirstAdmin() {
    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;

    if (!email || !password) {
        console.error("Please set ADMIN_EMAIL and ADMIN_PASSWORD in your .env file");
        process.exit(1);
    }

    try {
        const normalizedEmail = email.toLowerCase();

        let user = await prisma.user.findUnique({
            where: { email: normalizedEmail }
        });

        if (!user) {
            console.log('Creating new admin on email:', normalizedEmail);
            const encryptedPassword = await bcrypt.hash(password, 10);
            const name = normalizedEmail.split("@")[0] || "Admin";

            user = await prisma.user.create({
                data: {
                    email: normalizedEmail,
                    password: encryptedPassword,
                    name,
                    roles: 'admin'
                }
            });
        } else {
            console.log('Admin already exists with email:', normalizedEmail);
            if (user.roles !== 'admin') {
                await prisma.user.update({
                    where: { email: normalizedEmail },
                    data: { roles: 'admin' }
                });
                console.log('Updated existing user role to admin');
            }
        }

        console.log('Admin user created/updated successfully');
    } catch (error) {
        console.error('Error creating admin:', error);
        process.exitCode = 1;
    } finally {
        await prisma.$disconnect();
    }
}

createFirstAdmin(); 