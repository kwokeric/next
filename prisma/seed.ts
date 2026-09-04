import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { seedDemoTasks } from "../src/lib/demo-data";

try {
  process.loadEnvFile();
} catch {
  // no .env file — DATABASE_URL must already be in the environment
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const user = await prisma.user.upsert({
    where: { id: "demo-user" },
    update: {},
    create: { id: "demo-user", email: "demo@example.com", name: "Demo User" },
  });

  const project = await prisma.project.create({
    data: { title: "Clean the Apartment", userId: user.id },
  });

  await seedDemoTasks(prisma, project.id);

  console.log(`Seeded project "${project.title}" for ${user.email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
