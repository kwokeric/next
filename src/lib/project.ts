import { prisma } from "@/lib/prisma";
import { DEMO_USER_ID } from "@/lib/demo-user";

export async function getOrCreateDefaultProject() {
  await prisma.user.upsert({
    where: { id: DEMO_USER_ID },
    update: {},
    create: { id: DEMO_USER_ID, email: "demo@example.com", name: "Demo User" },
  });

  const existing = await prisma.project.findFirst({
    where: { userId: DEMO_USER_ID, archived: false },
    orderBy: { createdAt: "asc" },
  });
  if (existing) return existing;

  return prisma.project.create({
    data: { title: "My Project", userId: DEMO_USER_ID },
  });
}
