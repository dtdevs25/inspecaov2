const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const count = await prisma.project.count();
    console.log('--- PROJECT COUNT ---');
    console.log(count);
    
    const projects = await prisma.project.findMany({
      take: 5
    });
    console.log('--- PROJECTS SAMPLE ---');
    console.log(JSON.stringify(projects, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
