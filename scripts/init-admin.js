import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import util from "util";
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
        let user = await prisma.user.findUnique({
            where: { email }
        });

        if (!user) {
            console.log('Creating New Admin on Email: ', email);
            const salt = await bcrypt.genSalt(10);
            const hashPassword = util.promisify(bcrypt.hash);
            const encryptedPassword = await hashPassword(password, salt);
            
            const name = email.substring(0, 4);

            user = await prisma.user.create({
                data: {
                    email: email.toLowerCase(),
                    password: encryptedPassword,
                    name,
                    roles: 'admin',
                    status: 'Acticve',
                    providers: 'email'
                }
            });
        } else {
            console.log('Admin already exists with email: ', email);
        }

        console.log('Admin user created/updated successfully');
    } catch (error) {
        console.error('Error creating admin:', error);
    } finally {
        await prisma.$disconnect();
    }
}

createFirstAdmin(); 