"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Task, TimeOfDay } from "@prisma/client";
import {
  buildTaskTree,
  getProjectProgress,
  getTaskProgress,
  type TaskNode,
} from "@/lib/task-tree";
import { updateTask, deleteTask } from "@/lib/api-client";
import { TaskRow } from "./TaskRow";
import { PlusIcon } from "./icons/PlusIcon";
import { ClockIcon } from "./icons/ClockIcon";
import { SunriseIcon } from "./icons/SunriseIcon";
import { SunIcon } from "./icons/SunIcon";
import { MoonIcon } from "./icons/MoonIcon";
import styles from "./TaskApp.module.css";

// How long a task stays in its section after reaching 100% progress before
// it moves to Completed — gives the checkmark animation a moment to
// register instead of the row jumping sections the instant it completes.
const COMPLETION_MOVE_DELAY_MS = 500;

const TIME_OF_DAY_SECTIONS: { key: TimeOfDay; label: string; icon: React.ReactNode }[] = [
  { key: "ANYTIME", label: "Anytime", icon: <ClockIcon size={14} /> },
  { key: "MORNING", label: "Morning", icon: <SunriseIcon size={14} /> },
  { key: "AFTERNOON", label: "Afternoon", icon: <SunIcon size={14} /> },
  { key: "EVENING", label: "Evening", icon: <MoonIcon size={14} /> },
];

export function TaskApp({ initialTasks }: { initialTasks: Task[] }) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  const tree = useMemo(() => buildTaskTree(tasks), [tasks]);
  const projectProgress = useMemo(() => getProjectProgress(tree), [tree]);

  // Newly completed tasks stay in their section for a bit to allow time for
  // the completion animation to play. Tasks already complete on the first
  // render skip the delay entirely.
  const seenCompletedIds = useRef<Set<string>>(
    new Set(
      buildTaskTree(initialTasks)
        .filter((task) => getTaskProgress(task) >= 1)
        .map((task) => task.id)
    )
  );
  const [pendingCompletionIds, setPendingCompletionIds] = useState<Set<string>>(new Set());

  const activeOrPendingTasks = useMemo(
    () => tree.filter((task) => getTaskProgress(task) < 1 || pendingCompletionIds.has(task.id)),
    [tree, pendingCompletionIds]
  );
  const completedTasks = useMemo(
    () => tree.filter((task) => getTaskProgress(task) >= 1 && !pendingCompletionIds.has(task.id)),
    [tree, pendingCompletionIds]
  );

  function toggleSection(key: string) {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function mergeTasks(prev: Task[], newTasks: Task[]): Task[] {
    const byId = new Map(prev.map((t) => [t.id, t]));
    for (const t of newTasks) byId.set(t.id, t);
    return Array.from(byId.values());
  }

  function upsertTasks(newTasks: Task[]) {
    setTasks((prev) => mergeTasks(prev, newTasks));
  }

  async function handleToggleStatus(task: TaskNode) {
    const nextStatus = task.status === "DONE" ? "TODO" : "DONE";
    const updated = await updateTask(task.id, { status: nextStatus });

    // Peek at what the tree will look like post-merge, without committing
    // it yet — lets us decide whether any root just crossed to 100% before
    // upsertTasks() below triggers the render.
    const prospectiveTree = buildTaskTree(mergeTasks(tasks, updated));
    if (nextStatus === "DONE") {
      // Root tasks that just reached 100% for the first time.
      const newlyCompletedIds = prospectiveTree
        .filter((root) => getTaskProgress(root) >= 1 && !seenCompletedIds.current.has(root.id))
        .map((root) => root.id);

      if (newlyCompletedIds.length > 0) {
        for (const id of newlyCompletedIds) seenCompletedIds.current.add(id);
        // Set to 100% and "pending" in the same render to avoid a
        // flash.
        setPendingCompletionIds((prev) => {
          const next = new Set(prev);
          for (const id of newlyCompletedIds) next.add(id);
          return next;
        });
        // Delete from pending list after the hold.
        for (const id of newlyCompletedIds) {
          setTimeout(() => {
            setPendingCompletionIds((prev) => {
              const next = new Set(prev);
              next.delete(id);
              return next;
            });
          }, COMPLETION_MOVE_DELAY_MS);
        }
      }
    } else {
      // Reopened — let it re-trigger the delay if it's completed again later.
      for (const root of prospectiveTree) {
        if (getTaskProgress(root) < 1) seenCompletedIds.current.delete(root.id);
      }
    }

    upsertTasks(updated);
  }

  async function handleEdit(task: TaskNode, title: string) {
    const updated = await updateTask(task.id, { title });
    upsertTasks(updated);
  }

  async function handleDelete(task: TaskNode) {
    await deleteTask(task.id);
    const idsToRemove = new Set<string>();

    // Recursively add subtasks to idsToRemove
    const collect = (node: TaskNode) => {
      idsToRemove.add(node.id);
      node.subtasks.forEach(collect);
    };
    collect(task);
    setTasks((prev) => prev.filter((t) => !idsToRemove.has(t.id)));
  }

  const dayName = new Date().toLocaleDateString(undefined, { weekday: "long" });

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>{dayName}</h1>

      {tree.length > 0 && (
        <>
          <p className={styles.subtitle}>
            {completedTasks.length} of {tree.length} tasks completed
          </p>
          <div className={styles.progressTrack}>
            <div
              className={styles.progressFill}
              style={{ width: `${Math.round(projectProgress * 100)}%` }}
            />
          </div>
        </>
      )}

      {TIME_OF_DAY_SECTIONS.map(({ key, label, icon }) => {
        const tasksInSection = activeOrPendingTasks.filter((task) => task.timeOfDay === key);
        const isCollapsed = collapsedSections.has(key);
        return (
          <div key={key}>
            <div className={styles.sectionHeaderRow}>
              <button
                className={`${styles.sectionHeaderButton} ${styles[key.toLowerCase()]}`}
                onClick={() => toggleSection(key)}
                aria-expanded={!isCollapsed}
              >
                <span className={styles.sectionIcon} aria-hidden="true">
                  {icon}
                </span>
                <span className={styles.sectionHeader}>
                  {label} ({tasksInSection.length})
                </span>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 16 16"
                  className={styles.sectionChevron}
                  style={{ transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)" }}
                >
                  <path
                    d="M4 6 L8 10 L12 6"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              <Link
                href={`/tasks/new?timeOfDay=${key}`}
                className={styles.sectionAddButton}
                aria-label={`Add task to ${label}`}
              >
                <PlusIcon size={12} />
              </Link>
            </div>

            {!isCollapsed && (
              <ul className={styles.taskList}>
                {tasksInSection.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    depth={0}
                    onToggleStatus={handleToggleStatus}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                  />
                ))}
              </ul>
            )}
          </div>
        );
      })}

      {completedTasks.length > 0 && (
        <>
          <div className={styles.sectionHeaderRow}>
            <button
              className={styles.sectionHeaderButton}
              onClick={() => toggleSection("COMPLETED")}
              aria-expanded={!collapsedSections.has("COMPLETED")}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                className={styles.sectionChevron}
                style={{
                  transform: collapsedSections.has("COMPLETED") ? "rotate(-90deg)" : "rotate(0deg)",
                }}
              >
                <path
                  d="M4 6 L8 10 L12 6"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className={styles.sectionHeader}>Completed ({completedTasks.length})</span>
            </button>
          </div>
          {!collapsedSections.has("COMPLETED") && (
          <ul className={styles.taskList}>
            {completedTasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                depth={0}
                onToggleStatus={handleToggleStatus}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            ))}
          </ul>
          )}
        </>
      )}
    </div>
  );
}
