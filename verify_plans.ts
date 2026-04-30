import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    try {
        const plans = await prisma.actionPlan.findMany({
            orderBy: { createdAt: 'desc' }
        });
        console.log(`Found ${plans.length} action plans`);
        if (plans.length > 0) {
            console.log(plans[0]);
        }
    } catch (e) {
        console.error("Prisma error:", e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
