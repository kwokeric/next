import { prisma } from "@/lib/prisma";
import { getOrCreateDefaultProject } from "@/lib/project";
import { FocusMode } from "@/components/FocusMode";

// Always personalized, DB-backed content — never prerender statically.
export const dynamic = "force-dynamic";

export default async function FocusPage() {
  const project = await getOrCreateDefaultProject();
  const tasks = await prisma.task.findMany({
    where: { projectId: project.id },
    orderBy: { order: "asc" },
  });

  return <FocusMode initialTasks={tasks} />;
}
