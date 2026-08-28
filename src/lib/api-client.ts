import type { Task, TimeOfDay } from "@prisma/client";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export function createTask(
  projectId: string,
  input: { title: string; parentTaskId?: string | null; timeOfDay?: TimeOfDay }
): Promise<Task> {
  return fetch(`/api/projects/${projectId}/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }).then(json<Task>);
}

// Returns every task the update touched: the target task, plus any
// ancestors auto-completed (or un-completed) by the status cascade.
export function updateTask(
  taskId: string,
  input: Partial<Pick<Task, "title" | "description" | "status" | "priority">>
): Promise<Task[]> {
  return fetch(`/api/tasks/${taskId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }).then(json<Task[]>);
}

export function deleteTask(taskId: string): Promise<void> {
  return fetch(`/api/tasks/${taskId}`, { method: "DELETE" }).then(() => undefined);
}

export function breakdownTask(taskId: string): Promise<Task[]> {
  return fetch(`/api/tasks/${taskId}/breakdown`, { method: "POST" }).then(
    json<Task[]>
  );
}
