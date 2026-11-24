import { findOwnedTask, getGuestProject } from "@/lib/guest";
import { CreateTaskPage } from "@/components/CreateTaskPage";
import type { TimeOfDay } from "@prisma/client";
import { isValidDayKey } from "@/lib/day";

const TIME_OF_DAY_VALUES: TimeOfDay[] = ["ANYTIME", "MORNING", "AFTERNOON", "EVENING"];

// Always personalized, DB-backed content — never prerender statically.
export const dynamic = "force-dynamic";

export default async function NewTaskPage({
  searchParams,
}: {
  searchParams: Promise<{ parent?: string; timeOfDay?: string; date?: string }>;
}) {
  const { parent, timeOfDay, date } = await searchParams;
  const project = await getGuestProject();

  const parentTask = parent ? await findOwnedTask(parent) : null;

  const initialTimeOfDay = TIME_OF_DAY_VALUES.includes(timeOfDay as TimeOfDay)
    ? (timeOfDay as TimeOfDay)
    : null;

  return (
    <CreateTaskPage
      projectId={project.id}
      parentTask={parentTask}
      initialTimeOfDay={initialTimeOfDay}
      // The day being viewed on Tasks when its "+" was tapped.
      initialScheduledFor={!parentTask && isValidDayKey(date) ? date : null}
      showBackCaret={Boolean(timeOfDay) || Boolean(parent)}
    />
  );
}
