"use client";

import { useMemo, useRef, useState } from "react";
import type { Task, Project } from "@prisma/client";
import { buildTaskTree, findNextTask, getTaskProgress, type TaskNode } from "@/lib/task-tree";
import { createTask, updateTask, deleteTask, breakdownTask } from "@/lib/api-client";
import { NextActionCard } from "./NextActionCard";
import { TaskRow } from "./TaskRow";
import { AddTaskModal } from "./AddTaskModal";
import styles from "./TaskApp.module.css";

// How long a task stays in Active after reaching 100% progress before it
// moves to Completed — gives the checkmark animation a moment to register
// instead of the row jumping sections the instant it completes.
const COMPLETION_MOVE_DELAY_MS = 500;

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
  // Step panel, and the floating add-task button). undefined = closed;
  // null = open, adding a root task; a task id = open, adding its subtask.
  const [addTaskParentId, setAddTaskParentId] = useState<string | null | undefined>(
    undefined
  );

  const tree = useMemo(() => buildTaskTree(tasks), [tasks]);
  const nextTask = useMemo(() => findNextTask(tree), [tree]);

  // Newly completed tasks stay in Active for a bit to allow time for the 
  // completion animation to complete. Tasks already complete on the first
  // render skip the delay entirely.
  const seenCompletedIds = useRef<Set<string>>(
    new Set(
      buildTaskTree(initialTasks)
        .filter((task) => getTaskProgress(task) >= 1)
        .map((task) => task.id)
    )
  );
  const [pendingCompletionIds, setPendingCompletionIds] = useState<Set<string>>(new Set());

  const activeTasks = useMemo(
    () => tree.filter((task) => getTaskProgress(task) < 1 || pendingCompletionIds.has(task.id)),
    [tree, pendingCompletionIds]
  );
  const completedTasks = useMemo(
    () => tree.filter((task) => getTaskProgress(task) >= 1 && !pendingCompletionIds.has(task.id)),
    [tree, pendingCompletionIds]
  );

  function mergeTasks(prev: Task[], newTasks: Task[]): Task[] {
    const byId = new Map(prev.map((t) => [t.id, t]));
    for (const t of newTasks) byId.set(t.id, t);
    return Array.from(byId.values());
  }

  function upsertTasks(newTasks: Task[]) {
    setTasks((prev) => mergeTasks(prev, newTasks));
  }

  function openAddTaskModal(parentTaskId: string | null) {
    setAddTaskParentId(parentTaskId);
  }

  async function handleAddTask(title: string) {
    const task = await createTask(project.id, {
      title,
      parentTaskId: addTaskParentId ?? null,
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

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Tasks</h1>

      <h2 className={styles.sectionHeader}>Active</h2>
      <ul className={styles.taskList}>
        {activeTasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            depth={0}
            isNextTask={task.id === nextTask?.id}
            nextTaskId={nextTask?.id ?? null}
            onToggleStatus={handleToggleStatus}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onOpenAddSubtask={openAddTaskModal}
          />
        ))}
      </ul>

      <button
        onClick={() => openAddTaskModal(null)}
        className={styles.addTaskButton}
      >
        + Add task
      </button>

      {completedTasks.length > 0 && (
        <>
          <h2 className={styles.sectionHeader}>Completed</h2>
          <ul className={styles.taskList}>
            {completedTasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                depth={0}
                isNextTask={task.id === nextTask?.id}
                nextTaskId={nextTask?.id ?? null}
                onToggleStatus={handleToggleStatus}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onOpenAddSubtask={openAddTaskModal}
              />
            ))}
          </ul>
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
            onComplete={handleToggleStatus}
            onOpenAddSubtask={openAddTaskModal}
          />
        </div>
      </div>
    </div>
  );
}
