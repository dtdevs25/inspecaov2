import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
    const email = 'daniel-ehs@outlook.com';
    const password = 'nova@2026';
    const hashedPassword = await bcrypt.hash(password, 10);
    const uid = 'MASTER_' + Date.now();

    const user = await prisma.user.upsert({
        where: { email },
        update: {
            password: hashedPassword,
            role: 'Master',
            status: 'Aprovado',
            displayName: 'Daniel (Master)',
            blocked: false
        },
        create: {
            email,
            password: hashedPassword,
            displayName: 'Daniel (Master)',
            role: 'Master',
            status: 'Aprovado',
            uid,
            company: 'Todas',
            blocked: false
        }
    });
    console.log('Usuário Master criado/atualizado com sucesso: ' + user.email);
}

main().catch(console.error).finally(() => prisma.$disconnect());
