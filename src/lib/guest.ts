import { cookies } from "next/headers";
import { Prisma } from "@prisma/client";
import type { Project, Task } from "@prisma/client";
import { prisma } from "./prisma";
import { seedDemoTasks } from "./demo-data";
import { GUEST_COOKIE, GUEST_EMAIL_DOMAIN, isValidGuestId } from "./guest-cookie";

// The current visitor's guest ID, issued by src/proxy.ts. The proxy runs on
// every page and API request, so a missing cookie here means the request
// bypassed it — treat that as a bug, not a new visitor.
export async function getGuestId(): Promise<string> {
  const value = (await cookies()).get(GUEST_COOKIE)?.value;
  if (!isValidGuestId(value)) {
    throw new Error("Missing guest cookie — is src/proxy.ts running for this route?");
  }
  return value;
}

async function findGuestProject(userId: string): Promise<Project | null> {
  return prisma.project.findFirst({
    where: { userId, archived: false },
    orderBy: { createdAt: "asc" },
  });
}

// The visitor's own project, created and seeded with the demo tasks on
// their first visit.
export async function getGuestProject(): Promise<Project> {
  const userId = await getGuestId();

  const existing = await findGuestProject(userId);
  if (existing) return existing;

  try {
    // One transaction so a half-seeded project can never be left behind.
    // If two first requests race (e.g. two tabs), the loser's user insert
    // waits on the winner's unique-key lock, then fails with P2002 once
    // the winner commits — and the project is there to read below.
    return await prisma.$transaction(
      async (tx) => {
        await tx.user.create({
          data: { id: userId, email: `${userId}@${GUEST_EMAIL_DOMAIN}`, name: "Guest" },
        });
        const project = await tx.project.create({ data: { title: "My Tasks", userId } });
        await seedDemoTasks(tx, project.id);
        return project;
      },
      { timeout: 20_000 }
    );
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const project = await findGuestProject(userId);
      if (project) return project;
    }
    throw e;
  }
}

// Ownership checks for API routes — every ID that arrives in a URL or body
// has to belong to the requesting guest, or the request is treated as if
// the row doesn't exist.

export async function findOwnedProject(projectId: string): Promise<Project | null> {
  const userId = await getGuestId();
  return prisma.project.findFirst({ where: { id: projectId, userId } });
}

export async function findOwnedTask(taskId: string): Promise<Task | null> {
  const userId = await getGuestId();
  return prisma.task.findFirst({ where: { id: taskId, project: { userId } } });
}
