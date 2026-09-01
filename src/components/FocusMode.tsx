"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
import { DeleteIcon } from "./icons/DeleteIcon";
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
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [menuOpen, setMenuOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useCloseOnOutside(menuRef, menuOpen, () => setMenuOpen(false));

  const tree = useMemo(() => buildTaskTree(tasks), [tasks]);
  const nextTaskResult = useMemo(() => findNextTask(tree), [tree]);
  const nextTask = nextTaskResult?.task ?? null;
  const ancestors = useMemo(
    () => (nextTask ? findAncestorPath(tree, nextTask.id) ?? [] : []),
    [tree, nextTask]
  );

  const completedRoots = useMemo(() => tree.filter((t) => getTaskProgress(t) >= 1), [tree]);
  const activeRoots = useMemo(() => tree.filter((t) => getTaskProgress(t) < 1), [tree]);
  const totalCount = tree.length;
  const doneCount = completedRoots.length;
  const progress = totalCount > 0 ? doneCount / totalCount : 0;

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

  async function handleGenerate() {
    if (!nextTask) return;
    setMenuOpen(false);
    setError(null);
    try {
      const generated = await breakdownTask(nextTask.id);
      setTasks((prev) => [...prev, ...generated]);
    } catch {
      setError("Couldn't generate subtasks. Try again.");
    }
  }

  async function handleDelete() {
    if (!nextTask) return;
    setMenuOpen(false);
    setError(null);
    try {
      await deleteTask(nextTask.id);
      const idsToRemove = new Set<string>();
      const collect = (node: TaskNode) => {
        idsToRemove.add(node.id);
        node.subtasks.forEach(collect);
      };
      collect(nextTask);
      setTasks((prev) => prev.filter((t) => !idsToRemove.has(t.id)));
    } catch {
      setError("Couldn't delete that step. Try again.");
    }
  }

  const dayName = new Date().toLocaleDateString(undefined, { weekday: "long" });

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <span className={styles.tag}>Focus mode</span>
        <button
          type="button"
          className={styles.closeBtn}
          onClick={() => router.push("/")}
          aria-label="Close focus mode"
        >
          <DeleteIcon size={14} />
        </button>
      </div>

      <div className={styles.body}>
        <div className={styles.dayHead}>
          <h1 className={styles.dayTitle}>{dayName}</h1>
          {totalCount > 0 && (
            <>
              <p className={styles.daySubtitle}>
                {doneCount} of {totalCount} tasks completed
              </p>
              <div className={styles.miniTrack}>
                <div className={styles.miniFill} style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
            </>
          )}
        </div>

        {!nextTask || !rootTask ? (
          <p className={styles.empty}>Nothing left! Add a task to get started.</p>
        ) : (
          <div className={styles.stackWrap}>
            {completedRoots.map((root) => (
              <div key={root.id} className={`${styles.taskCard} ${styles.past}`}>
                <p className={styles.pastTitle}>{root.title}</p>
                <span className={styles.doneDotSmall}>
                  <svg width="9" height="9" viewBox="0 0 16 16" aria-hidden="true">
                    <path
                      d="M3 8.5 L6.5 12 L13 4.5"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              </div>
            ))}

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

              {siblings.map((step, i) => {
                const isLast = i === siblings.length - 1;
                const isCurrent = step.id === nextTask.id;
                const isDone = !isCurrent && getTaskProgress(step) >= 1;

                if (isCurrent) {
                  return (
                    <div key={step.id} className={styles.tlRow}>
                      <div className={styles.tlRail}>
                        <span className={`${styles.tlDot} ${styles.tlDotCurrent}`} />
                        {!isLast && <span className={styles.tlLine} />}
                      </div>
                      <div className={styles.tlBody}>
                        <div className={styles.heroRow}>
                          <p className={styles.heroTitle}>{step.title}</p>
                          <div className={styles.heroActions}>
                            <div className={styles.kebabWrap} ref={menuRef}>
                              <button
                                type="button"
                                className={styles.kebabBtn}
                                aria-label="More actions"
                                aria-haspopup="menu"
                                aria-expanded={menuOpen}
                                onClick={() => setMenuOpen((v) => !v)}
                              >
                                <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
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
                                    onClick={handleGenerate}
                                  >
                                    <SparkleIcon size={12} />
                                    Generate
                                  </button>
                                  <div className={styles.menuDivider} />
                                  <button
                                    type="button"
                                    className={`${styles.menuItem} ${styles.menuItemDanger}`}
                                    role="menuitem"
                                    onClick={handleDelete}
                                  >
                                    <TrashIcon size={12} />
                                    Delete
                                  </button>
                                </div>
                              )}
                            </div>
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
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={step.id} className={styles.tlRow}>
                    <div className={styles.tlRail}>
                      <span className={`${styles.tlDot} ${isDone ? styles.tlDotDone : ""}`} />
                      {!isLast && <span className={styles.tlLine} />}
                    </div>
                    <div className={`${styles.tlBody} ${isDone ? styles.tlBodyDone : styles.tlBodyUpcoming}`}>
                      <p className={styles.subTitle}>{step.title}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {upcomingRoots.map((root) => {
              const nextInRoot = findNextTask([root])?.task ?? null;
              const rootDoneCount = root.subtasks.filter((s) => getTaskProgress(s) >= 1).length;
              return (
                <div key={root.id} className={`${styles.taskCard} ${styles.upcoming}`}>
                  <p className={styles.taskTitle}>{root.title}</p>
                  {root.subtasks.length > 0 && (
                    <p className={styles.taskMeta}>
                      {rootDoneCount} of {root.subtasks.length} steps done
                    </p>
                  )}
                  {nextInRoot && nextInRoot.id !== root.id && (
                    <p className={styles.upcomingHint}>Next: {nextInRoot.title}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {error && <p className={styles.errorText}>{error}</p>}
      </div>
    </div>
  );
}
