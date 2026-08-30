"use client";

import { useMemo, useRef, useState } from "react";
import type { Task, Project, TimeOfDay } from "@prisma/client";
import {
  buildTaskTree,
  findAncestorPath,
  findNextTask,
  getProjectProgress,
  getTaskProgress,
  type TaskNode,
} from "@/lib/task-tree";
import { createTask, updateTask, deleteTask, breakdownTask } from "@/lib/api-client";
import { NextActionCard } from "./NextActionCard";
import { TaskRow } from "./TaskRow";
import { AddTaskModal } from "./AddTaskModal";
import styles from "./TaskApp.module.css";

// How long a task stays in its section after reaching 100% progress before
// it moves to Completed — gives the checkmark animation a moment to
// register instead of the row jumping sections the instant it completes.
const COMPLETION_MOVE_DELAY_MS = 500;

const TIME_OF_DAY_SECTIONS: { key: TimeOfDay; label: string; emoji: string }[] = [
  { key: "ANYTIME", label: "Anytime", emoji: "🕐" },
  { key: "MORNING", label: "Morning", emoji: "🌅" },
  { key: "AFTERNOON", label: "Afternoon", emoji: "☀️" },
  { key: "EVENING", label: "Evening", emoji: "🌙" },
];

export function TaskApp({
  project,
  initialTasks,
}: {
  project: Project;
  initialTasks: Task[];
}) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [breakingDownIds, setBreakingDownIds] = useState<Set<string>>(new Set());

  // One modal instance for the whole page, shared by every "+" (row, Next
  // Step panel, section headers, and the floating add-task button).
  // undefined = closed; null = open, adding a root task; a task id = open,
  // adding its subtask.
  const [addTaskParentId, setAddTaskParentId] = useState<string | null | undefined>(
    undefined
  );
  // Which bucket a root-level add lands in — set by whichever "+" opened
  // the modal (a section header's or the general floating button's).
  const [addTaskTimeOfDay, setAddTaskTimeOfDay] = useState<TimeOfDay>("ANYTIME");
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  // Which row's swipe-to-reveal actions are open — lifted here so opening
  // one row's actions closes any other row's, across every section.
  const [openRowId, setOpenRowId] = useState<string | null>(null);

  const tree = useMemo(() => buildTaskTree(tasks), [tasks]);
  const nextTaskResult = useMemo(() => findNextTask(tree), [tree]);
  const nextTask = nextTaskResult?.task ?? null;
  const nextTaskAncestors = useMemo(
    () => (nextTask ? findAncestorPath(tree, nextTask.id) ?? [] : []),
    [tree, nextTask]
  );
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

  function openAddTaskModal(parentTaskId: string | null, timeOfDay: TimeOfDay = "ANYTIME") {
    setAddTaskParentId(parentTaskId);
    setAddTaskTimeOfDay(timeOfDay);
  }

  async function handleAddTask(title: string) {
    const task = await createTask(project.id, {
      title,
      parentTaskId: addTaskParentId ?? null,
      timeOfDay: addTaskTimeOfDay,
    });
    upsertTasks([task]);
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

  async function handleBreakdown(taskId: string) {
    setBreakingDownIds((prev) => new Set(prev).add(taskId));
    try {
      const subtasks = await breakdownTask(taskId);
      upsertTasks(subtasks);
    } finally {
      setBreakingDownIds((prev) => {
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
    }
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

      {TIME_OF_DAY_SECTIONS.map(({ key, label, emoji }) => {
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
                <span className={styles.sectionEmoji} aria-hidden="true">
                  {emoji}
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
              <button
                className={styles.sectionAddButton}
                onClick={() => openAddTaskModal(null, key)}
                aria-label={`Add task to ${label}`}
              >
                +
              </button>
            </div>

            {!isCollapsed && (
              <ul className={styles.taskList}>
                {tasksInSection.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    depth={0}
                    isNextTask={task.id === nextTask?.id}
                    nextTaskId={nextTask?.id ?? null}
                    openRowId={openRowId}
                    onRowOpenChange={setOpenRowId}
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
                isNextTask={task.id === nextTask?.id}
                nextTaskId={nextTask?.id ?? null}
                openRowId={openRowId}
                onRowOpenChange={setOpenRowId}
                onToggleStatus={handleToggleStatus}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            ))}
          </ul>
          )}
        </>
      )}

      {addTaskParentId !== undefined && (
        <AddTaskModal
          parentTaskId={addTaskParentId}
          onAdd={handleAddTask}
          onSuggest={
            addTaskParentId ? () => handleBreakdown(addTaskParentId) : undefined
          }
          isBreakingDown={addTaskParentId ? breakingDownIds.has(addTaskParentId) : false}
          onClose={() => setAddTaskParentId(undefined)}
        />
      )}

      <div className={styles.nextStepBar}>
        <div className={styles.nextStepBarInner}>
          <NextActionCard
            task={nextTask}
            ancestors={nextTaskAncestors}
            onComplete={handleToggleStatus}
            onOpenAddSubtask={openAddTaskModal}
          />
        </div>
      </div>
    </div>
  );
}
