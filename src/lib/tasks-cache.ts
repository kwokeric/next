import { unstable_cache } from "next/cache";
import { prisma } from "./prisma";

// Prisma calls aren't `fetch()`, so they don't participate in Next's fetch
// cache — unstable_cache is the documented way to cache an arbitrary async
// function's result instead. Tagged "tasks" so every route that mutates a
// task can invalidate it with revalidateTag("tasks", { expire: 0 }) — the
// immediate-expiration form, not the default stale-while-revalidate one,
// since a task app can't afford to show one more round of stale data after
// a user's own edit — rather than this page re-querying Postgres on every
// single load.
export const getCachedTasks = unstable_cache(
  async (projectId: string) => {
    return prisma.task.findMany({
      where: { projectId },
      orderBy: { order: "asc" },
    });
  },
  ["tasks-by-project"],
  { tags: ["tasks"] }
);
