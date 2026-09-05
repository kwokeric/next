import { getOrCreateDefaultProject } from "@/lib/project";
import { getCachedTasks } from "@/lib/tasks-cache";
import { TaskApp } from "@/components/TaskApp";

// The page itself still renders per-request (no stale HTML baked in at
// build time) — it's the task query specifically that's cached, via
// getCachedTasks, and invalidated by every route that writes a task.
export const dynamic = "force-dynamic";

export default async function Home() {
  const project = await getOrCreateDefaultProject();
  const tasks = await getCachedTasks(project.id);

  return <TaskApp initialTasks={tasks} />;
}
