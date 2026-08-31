import { prisma } from "@/lib/prisma";
import { getOrCreateDefaultProject } from "@/lib/project";
import { TaskApp } from "@/components/TaskApp";

// Always personalized, DB-backed content — never prerender statically.
export const dynamic = "force-dynamic";

export default async function Home() {
  const project = await getOrCreateDefaultProject();
  const tasks = await prisma.task.findMany({
    where: { projectId: project.id },
    orderBy: { order: "asc" },
  });

  return <TaskApp initialTasks={tasks} />;
}
