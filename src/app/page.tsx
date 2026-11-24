import { cookies } from "next/headers";
import { getGuestProject } from "@/lib/guest";
import { getCachedTasks } from "@/lib/tasks-cache";
import { isValidDayKey, isValidTimeZone, todayKey, TIMEZONE_COOKIE } from "@/lib/day";
import { TaskApp } from "@/components/TaskApp";

// The page itself still renders per-request (no stale HTML baked in at
// build time) — it's the task query specifically that's cached, via
// getCachedTasks, and invalidated by every route that writes a task.
export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ day?: string }>;
}) {
  const [{ day }, cookieStore, project] = await Promise.all([
    searchParams,
    cookies(),
    getGuestProject(),
  ]);
  const tasks = await getCachedTasks(project.id);

  // "Today" depends on the visitor's timezone, which only the browser
  // knows — TaskApp stores it in a cookie so later renders get it right.
  const tz = cookieStore.get(TIMEZONE_COOKIE)?.value;
  const today = todayKey(isValidTimeZone(tz) ? tz : "UTC");

  return (
    <TaskApp
      initialTasks={tasks}
      initialToday={today}
      initialDay={isValidDayKey(day) && day !== today ? day : null}
    />
  );
}
