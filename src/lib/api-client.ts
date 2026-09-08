import type { Task, TimeOfDay, RepeatFrequency } from "@prisma/client";

// Task fields Prisma types as Date — plain res.json() leaves these as ISO
// strings instead, which crashes anything downstream expecting a real Date
// (e.g. task-tree's isOnOrBefore calling .getUTCFullYear()) the moment a
// task carrying one of these round-trips through an API call and gets
// merged into client state.
const DATE_FIELDS = new Set(["dueDate", "dueTime", "scheduledFor", "scheduledTime", "createdAt", "updatedAt"]);

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  const text = await res.text();
  return JSON.parse(text, (key, value) =>
    DATE_FIELDS.has(key) && typeof value === "string" ? new Date(value) : value
  ) as T;
}

export function createTask(
  projectId: string,
  input: {
    title: string;
    parentTaskId?: string | null;
    timeOfDay?: TimeOfDay;
    scheduledFor?: string | null;
    scheduledTime?: string | null;
    repeatFrequency?: RepeatFrequency | null;
  }
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
  input: Partial<
    Pick<Task, "title" | "description" | "status" | "priority" | "timeOfDay"> & {
      scheduledFor: string | null;
      scheduledTime: string | null;
      repeatFrequency: RepeatFrequency | null;
    }
  >
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

// prevOrder/nextOrder are the new neighbors' `order` keys (either may be
// null for "moved to the start/end") — the server computes the key between
// them and reparents the task if parentTaskId differs from its current one.
export function reorderTask(
  taskId: string,
  input: { parentTaskId: string | null; prevOrder: string | null; nextOrder: string | null }
): Promise<Task> {
  return fetch(`/api/tasks/${taskId}/reorder`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }).then(json<Task>);
}
