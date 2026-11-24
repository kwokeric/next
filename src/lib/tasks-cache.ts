import { unstable_cache } from "next/cache";
import { prisma } from "./prisma";

// One tag per project, so one guest's edit only invalidates their own
// cached task list — not every visitor's.
export function tasksTag(projectId: string): string {
  return `tasks:${projectId}`;
}

// Prisma calls aren't `fetch()`, so they don't participate in Next's fetch
// cache — unstable_cache is the documented way to cache an arbitrary async
// function's result instead. Every route that mutates a task invalidates
// it with revalidateTag(tasksTag(projectId), { expire: 0 }) — the
// immediate-expiration form, not the default stale-while-revalidate one,
// since a task app can't afford to show one more round of stale data after
// a user's own edit — rather than this page re-querying Postgres on every
// single load.
export function getCachedTasks(projectId: string) {
  return unstable_cache(
    async () =>
      prisma.task.findMany({
        where: { projectId },
        orderBy: { order: "asc" },
      }),
    ["tasks-by-project", projectId],
    { tags: [tasksTag(projectId)] }
  )();
}
