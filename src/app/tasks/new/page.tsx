import { prisma } from "@/lib/prisma";
import { getOrCreateDefaultProject } from "@/lib/project";
import { CreateTaskPage } from "@/components/CreateTaskPage";
import type { TimeOfDay } from "@prisma/client";

const TIME_OF_DAY_VALUES: TimeOfDay[] = ["ANYTIME", "MORNING", "AFTERNOON", "EVENING"];

// Always personalized, DB-backed content — never prerender statically.
export const dynamic = "force-dynamic";

export default async function NewTaskPage({
  searchParams,
}: {
  searchParams: Promise<{ parent?: string; timeOfDay?: string }>;
}) {
  const { parent, timeOfDay } = await searchParams;
  const project = await getOrCreateDefaultProject();

  const parentTask = parent
    ? await prisma.task.findUnique({ where: { id: parent } })
    : null;

  const initialTimeOfDay = TIME_OF_DAY_VALUES.includes(timeOfDay as TimeOfDay)
    ? (timeOfDay as TimeOfDay)
    : null;

  return (
    <CreateTaskPage
      projectId={project.id}
      parentTask={parentTask}
      initialTimeOfDay={initialTimeOfDay}
    />
  );
}
