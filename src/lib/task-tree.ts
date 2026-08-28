import type { Task, TimeOfDay } from "@prisma/client";

export type TaskNode = Task & { subtasks: TaskNode[] };

export type NextTaskResult = { task: TaskNode; reason: "scheduled" | "natural" };

// Builds a nested tree from a flat, project-scoped task list. Assumes tasks
// are already sorted by `order` (callers should query with
// `orderBy: { order: "asc" }`).
export function buildTaskTree(tasks: Task[]): TaskNode[] {
  const byId = new Map<string, TaskNode>();
  for (const task of tasks) {
    byId.set(task.id, { ...task, subtasks: [] });
  }

  const roots: TaskNode[] = [];
  for (const task of tasks) {
    const node = byId.get(task.id)!;
    if (task.parentTaskId) {
      const parent = byId.get(task.parentTaskId);
      // Parent may be missing if it belongs to a different query scope —
      // treat orphaned nodes as roots rather than dropping them.
      if (parent) {
        parent.subtasks.push(node);
        continue;
      }
    }
    roots.push(node);
  }

  return roots;
}

// The first (in sibling order) incomplete leaf task, found depth-first. If
// a task's subtasks are all done/archived but the task itself isn't, the
// task itself is the next action (there's nothing smaller left to surface).
// This ignores scheduling entirely — see findNextTask for the surface
// that combines this with scheduled tasks.
function findNaturalNextTask(nodes: TaskNode[]): TaskNode | null {
  for (const node of nodes) {
    if (node.status === "DONE" || node.status === "ARCHIVED") continue;

    if (node.subtasks.length === 0) {
      return node;
    }

    const childResult = findNaturalNextTask(node.subtasks);
    if (childResult) return childResult;

    return node;
  }

  return null;
}

const TIME_OF_DAY_ORDER: Record<TimeOfDay, number> = {
  MORNING: 0,
  AFTERNOON: 1,
  EVENING: 2,
  ANYTIME: 3,
};

// Same calendar day regardless of time-of-day noise on either value —
// avoids UTC/local boundary mismatches from comparing raw Date objects.
function isOnOrBefore(date: Date, reference: Date): boolean {
  const d = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const r = Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate());
  return d <= r;
}

// Any not-done task, at any depth, scheduled for today or earlier — a task
// scheduled for a day that's since passed without being done just stays
// eligible ("rolls over") rather than needing to be rewritten.
function collectScheduledCandidates(nodes: TaskNode[], today: Date, out: TaskNode[] = []): TaskNode[] {
  for (const node of nodes) {
    if (node.status === "TODO" && node.scheduledFor && isOnOrBefore(node.scheduledFor, today)) {
      out.push(node);
    }
    collectScheduledCandidates(node.subtasks, today, out);
  }
  return out;
}

// The task to surface as the single Next Action. A task explicitly
// scheduled for today (or earlier — see collectScheduledCandidates) always
// wins, earliest time-of-day first; otherwise falls back to the natural
// depth-first search. The `reason` lets the UI show why a task is next.
export function findNextTask(nodes: TaskNode[], today: Date = new Date()): NextTaskResult | null {
  const scheduled = collectScheduledCandidates(nodes, today);
  if (scheduled.length > 0) {
    scheduled.sort((a, b) => {
      const byTimeOfDay = TIME_OF_DAY_ORDER[a.timeOfDay] - TIME_OF_DAY_ORDER[b.timeOfDay];
      if (byTimeOfDay !== 0) return byTimeOfDay;
      return a.order < b.order ? -1 : a.order > b.order ? 1 : 0;
    });
    return { task: scheduled[0], reason: "scheduled" };
  }

  const natural = findNaturalNextTask(nodes);
  return natural ? { task: natural, reason: "natural" } : null;
}

// A task's completion fraction (0-1). Leaf tasks are binary (done/archived
// = 1, todo = 0). A task with subtasks derives its fraction purely from the
// average of its children's fractions, ignoring its own status. Each child 
// is weighted equally regardless of how far it's been broken down.
export function getTaskProgress(node: TaskNode): number {
  if (node.subtasks.length === 0) {
    return node.status === "TODO" ? 0 : 1;
  }

  const total = node.subtasks.reduce((sum, child) => sum + getTaskProgress(child), 0);
  return total / node.subtasks.length;
}

// The chain of ancestor nodes from root down to (but not including) the
// given task — empty for a root-level task. Gives the Next Action surface
// a breadcrumb back to the bigger task a step belongs to.
export function findAncestorPath(
  nodes: TaskNode[],
  targetId: string,
  path: TaskNode[] = []
): TaskNode[] | null {
  for (const node of nodes) {
    if (node.id === targetId) return path;
    const found = findAncestorPath(node.subtasks, targetId, [...path, node]);
    if (found) return found;
  }
  return null;
}

// Overall project completion: the average of each root task's completion
// fraction. With 4 equally-weighted root tasks, finishing one is 25%;
// getting a second root task's subtasks half-done contributes another
// 0.5 * (1/4) = 12.5%.
export function getProjectProgress(roots: TaskNode[]): number {
  if (roots.length === 0) return 0;

  const total = roots.reduce((sum, root) => sum + getTaskProgress(root), 0);
  return total / roots.length;
}
