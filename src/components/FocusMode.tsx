"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Task } from "@prisma/client";
import {
  buildTaskTree,
  findAncestorPath,
  findNextTask,
  getTaskProgress,
  type TaskNode,
} from "@/lib/task-tree";
import { updateTask, deleteTask, breakdownTask } from "@/lib/api-client";
import { PlusIcon } from "./icons/PlusIcon";
import { SparkleIcon } from "./icons/SparkleIcon";
import { TrashIcon } from "./icons/TrashIcon";
import styles from "./FocusMode.module.css";

// Closes the kebab menu on an outside tap or Escape — same pattern as
// CreateTaskPage's time-of-day dropdown.
function useCloseOnOutside(
  ref: React.RefObject<HTMLElement | null>,
  open: boolean,
  onClose: () => void
) {
  useEffect(() => {
    if (!open) return;

    function handlePointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, ref, onClose]);
}

function mergeTasks(prev: Task[], newTasks: Task[]): Task[] {
  const byId = new Map(prev.map((t) => [t.id, t]));
  for (const t of newTasks) byId.set(t.id, t);
  return Array.from(byId.values());
}

export function FocusMode({ initialTasks }: { initialTasks: Task[] }) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [openMenuStepId, setOpenMenuStepId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useCloseOnOutside(menuRef, openMenuStepId !== null, () => setOpenMenuStepId(null));

  const tree = useMemo(() => buildTaskTree(tasks), [tasks]);
  const nextTaskResult = useMemo(() => findNextTask(tree), [tree]);
  const nextTask = nextTaskResult?.task ?? null;
  const ancestors = useMemo(
    () => (nextTask ? findAncestorPath(tree, nextTask.id) ?? [] : []),
    [tree, nextTask]
  );

  const activeRoots = useMemo(() => tree.filter((t) => getTaskProgress(t) < 1), [tree]);

  const rootTask: TaskNode | null = ancestors[0] ?? nextTask;

  // The current step's siblings within its parent task — normally just
  // rootTask's direct subtasks. Handles the edge case where rootTask itself
  // is the next action (all its subtasks are already done) by appending it
  // to the list so it still gets a hero row.
  const siblings: TaskNode[] = useMemo(() => {
    if (!rootTask) return [];
    if (rootTask.subtasks.length === 0) return [rootTask];
    if (nextTask && rootTask.subtasks.some((s) => s.id === nextTask.id)) return rootTask.subtasks;
    return nextTask ? [...rootTask.subtasks, rootTask] : rootTask.subtasks;
  }, [rootTask, nextTask]);

  const upcomingRoots = activeRoots.filter((t) => t.id !== rootTask?.id);

  async function handleMarkDone() {
    if (!nextTask) return;
    setError(null);
    try {
      const updated = await updateTask(nextTask.id, { status: "DONE" });
      setTasks((prev) => mergeTasks(prev, updated));
    } catch {
      setError("Couldn't mark that step done. Try again.");
    }
  }

  async function handleGenerate(stepId: string) {
    setOpenMenuStepId(null);
    setError(null);
    try {
      const generated = await breakdownTask(stepId);
      setTasks((prev) => [...prev, ...generated]);
    } catch {
      setError("Couldn't generate subtasks. Try again.");
    }
  }

  async function handleDelete(step: TaskNode) {
    setOpenMenuStepId(null);
    setError(null);
    try {
      await deleteTask(step.id);
      const idsToRemove = new Set<string>();
      const collect = (node: TaskNode) => {
        idsToRemove.add(node.id);
        node.subtasks.forEach(collect);
      };
      collect(step);
      setTasks((prev) => prev.filter((t) => !idsToRemove.has(t.id)));
    } catch {
      setError("Couldn't delete that step. Try again.");
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div />
        <span className={styles.headerTitle}>Focus mode</span>
        <div />
      </div>

      <div className={styles.stage}>
        {!nextTask || !rootTask ? (
          <p className={styles.empty}>Nothing left! Add a task to get started.</p>
        ) : (
          <>
            <div className={`${styles.taskCard} ${styles.current}`}>
              {/* When the root task IS the current step (a leaf task with no
                  subtasks, or one whose subtasks are all already done), the hero
                  row below already shows its title — skip the redundant header. */}
              {rootTask.id !== nextTask.id && (
                <div className={styles.taskCardHead}>
                  <p className={styles.taskTitle}>{rootTask.title}</p>
                  <p className={styles.taskMeta}>
                    {siblings.filter((s) => getTaskProgress(s) >= 1).length} of {siblings.length} steps done
                  </p>
                </div>
              )}

              <div className={styles.tlScroll}>
              {siblings.map((step, i) => {
                const isLast = i === siblings.length - 1;
                const isCurrent = step.id === nextTask.id;
                const isDone = !isCurrent && getTaskProgress(step) >= 1;
                const menuOpen = openMenuStepId === step.id;

                return (
                  <div key={step.id} className={styles.tlRow}>
                    <div className={styles.tlRail}>
                      <span
                        className={`${styles.tlDot} ${
                          isCurrent ? styles.tlDotCurrent : isDone ? styles.tlDotDone : ""
                        }`}
                      />
                      {!isLast && <span className={styles.tlLine} />}
                    </div>
                    <div
                      className={`${styles.tlBody} ${
                        isDone ? styles.tlBodyDone : isCurrent ? styles.tlBodyCurrent : styles.tlBodyUpcoming
                      }`}
                    >
                      <div className={styles.tlRowContent}>
                        <p className={styles.subTitle}>{step.title}</p>
                        {!isDone && (
                          <div className={styles.kebabWrap} ref={menuOpen ? menuRef : undefined}>
                            <button
                              type="button"
                              className={styles.kebabBtn}
                              aria-label={`More actions for ${step.title}`}
                              aria-haspopup="menu"
                              aria-expanded={menuOpen}
                              onClick={() => setOpenMenuStepId((v) => (v === step.id ? null : step.id))}
                            >
                              <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
                                <circle cx="3" cy="8" r="1.4" fill="currentColor" />
                                <circle cx="8" cy="8" r="1.4" fill="currentColor" />
                                <circle cx="13" cy="8" r="1.4" fill="currentColor" />
                              </svg>
                            </button>
                            {menuOpen && (
                              <div className={styles.menu} role="menu">
                                <Link
                                  href={`/tasks/new?parent=${step.id}`}
                                  className={styles.menuItem}
                                  role="menuitem"
                                >
                                  <PlusIcon size={12} />
                                  Add subtask
                                </Link>
                                <button
                                  type="button"
                                  className={styles.menuItem}
                                  role="menuitem"
                                  onClick={() => handleGenerate(step.id)}
                                >
                                  <SparkleIcon size={12} />
                                  Generate
                                </button>
                                <div className={styles.menuDivider} />
                                <button
                                  type="button"
                                  className={`${styles.menuItem} ${styles.menuItemDanger}`}
                                  role="menuitem"
                                  onClick={() => handleDelete(step)}
                                >
                                  <TrashIcon size={12} />
                                  Delete
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              </div>

              <div className={styles.doneBtnWrap}>
                <button type="button" className={styles.doneBtn} onClick={handleMarkDone}>
                  <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
                    <path
                      d="M3 8.5 L6.5 12 L13 4.5"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  Mark as done
                </button>
              </div>
            </div>

            {/* A receding "wheel" of upcoming tasks — each step further back
                shrinks and tucks behind the one in front of it. Capped at 3:
                each card overlaps (and is covered by) the previous one via
                negative margins, so rendering more than 3 would just pile
                them up on top of each other with no visual payoff. */}
            {upcomingRoots.slice(0, 3).map((root, i) => {
              const rootDoneCount = root.subtasks.filter((s) => getTaskProgress(s) >= 1).length;
              const depth = i + 1;
              return (
                <div
                  key={root.id}
                  className={`${styles.taskCard} ${styles.peek} ${styles[`peek${depth}`]}`}
                >
                  <p className={styles.taskTitle}>{root.title}</p>
                  {root.subtasks.length > 0 && (
                    <p className={styles.taskMeta}>
                      {rootDoneCount} of {root.subtasks.length} steps done
                    </p>
                  )}
                </div>
              );
            })}
          </>
        )}

        {error && <p className={styles.errorText}>{error}</p>}
      </div>
    </div>
  );
}
