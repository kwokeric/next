import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { CreateTaskPage } from "@/components/CreateTaskPage";

// Always personalized, DB-backed content — never prerender statically.
export const dynamic = "force-dynamic";

// scheduledFor/scheduledTime round-trip through this app's own
// "1970-01-01T HH:mm:00" / "YYYY-MM-DD" string conventions (see
// CreateTaskPage's computeScheduledFor/computeScheduledTime) — read back
// with UTC getters to match how the rest of the app treats these
// date-only/time-only fields (see api-client.ts's DATE_FIELDS comment).
function dateOnlyString(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function timeOnlyString(d: Date): string {
  const h = String(d.getUTCHours()).padStart(2, "0");
  const m = String(d.getUTCMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

export default async function EditTaskPage({
  params,
}: {
  params: Promise<{ taskId: string }>;
}) {
  const { taskId } = await params;

  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) notFound();

  const subtasks = await prisma.task.findMany({
    where: { parentTaskId: taskId },
    orderBy: { order: "asc" },
  });

  return (
    <CreateTaskPage
      projectId={task.projectId}
      parentTask={null}
      editingTask={task}
      initialSubtasks={subtasks}
      initialTimeOfDay={task.timeOfDay}
      initialScheduledFor={task.scheduledFor ? dateOnlyString(task.scheduledFor) : null}
      initialExactTime={task.scheduledTime ? timeOnlyString(task.scheduledTime) : null}
      showBackCaret
    />
  );
}
