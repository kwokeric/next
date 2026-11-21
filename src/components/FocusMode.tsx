"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Task, TimeOfDay } from "@prisma/client";
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
import { ClockIcon } from "./icons/ClockIcon";
import { SunriseIcon } from "./icons/SunriseIcon";
import { SunIcon } from "./icons/SunIcon";
import { MoonIcon } from "./icons/MoonIcon";
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

const TIME_OF_DAY_META: Record<TimeOfDay, { label: string; icon: React.ReactNode }> = {
  ANYTIME: { label: "Anytime", icon: <ClockIcon size={13} /> },
  MORNING: { label: "Morning", icon: <SunriseIcon size={13} /> },
  AFTERNOON: { label: "Afternoon", icon: <SunIcon size={13} /> },
  EVENING: { label: "Evening", icon: <MoonIcon size={13} /> },
};

// How many of the current step's later siblings to preview under the card.
const UPCOMING_STEP_PREVIEW = 3;

function mergeTasks(prev: Task[], newTasks: Task[]): Task[] {
  const byId = new Map(prev.map((t) => [t.id, t]));
  for (const t of newTasks) byId.set(t.id, t);
  return Array.from(byId.values());
}

export function FocusMode({ initialTasks }: { initialTasks: Task[] }) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [openMenuStepId, setOpenMenuStepId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
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
    setIsGenerating(true);
    try {
      const generated = await breakdownTask(stepId);
      setTasks((prev) => [...prev, ...generated]);
    } catch {
      setError("Couldn't generate subtasks. Try again.");
    } finally {
      setIsGenerating(false);
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

  const currentIndex = nextTask ? siblings.findIndex((s) => s.id === nextTask.id) : -1;
  const upcomingSteps = siblings
    .slice(currentIndex + 1)
    .filter((s) => getTaskProgress(s) < 1)
    .slice(0, UPCOMING_STEP_PREVIEW);
  const nextRoot = upcomingRoots[0] ?? null;
  const menuOpen = nextTask !== null && openMenuStepId === nextTask.id;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <p className="page-eyebrow">
          {activeRoots.length} {activeRoots.length === 1 ? "task" : "tasks"} left
        </p>
        <h1 className="page-title">Focus</h1>
      </header>

      <div className={styles.stage}>
        {!nextTask || !rootTask ? (
          <p className={styles.empty}>Nothing left! Add a task to get started.</p>
        ) : (
          <>
            <article className={styles.focusCard}>
              <div className={styles.cardTop}>
                <span className={styles.todChip} data-tod={rootTask.timeOfDay.toLowerCase()}>
                  {TIME_OF_DAY_META[rootTask.timeOfDay].icon}
                  {TIME_OF_DAY_META[rootTask.timeOfDay].label}
                </span>
                <div className={styles.kebabWrap} ref={menuOpen ? menuRef : undefined}>
                  <button
                    type="button"
                    className={styles.kebabBtn}
                    aria-label={`More actions for ${nextTask.title}`}
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                    onClick={() => setOpenMenuStepId((v) => (v === nextTask.id ? null : nextTask.id))}
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                      <circle cx="3" cy="8" r="1.4" fill="currentColor" />
                      <circle cx="8" cy="8" r="1.4" fill="currentColor" />
                      <circle cx="13" cy="8" r="1.4" fill="currentColor" />
                    </svg>
                  </button>
                  {menuOpen && (
                    <div className={styles.menu} role="menu">
                      <Link
                        href={`/tasks/${nextTask.id}/edit`}
                        className={styles.menuItem}
                        role="menuitem"
                      >
                        Edit step
                      </Link>
                      <div className={styles.menuDivider} />
                      <button
                        type="button"
                        className={`${styles.menuItem} ${styles.menuItemDanger}`}
                        role="menuitem"
                        onClick={() => handleDelete(nextTask)}
                      >
                        <TrashIcon size={12} />
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Inter, not the serif — a step can be a full sentence, and
                  task text is never set in the display face. */}
              <h2 className={styles.stepTitle}>{nextTask.title}</h2>

              {rootTask.id !== nextTask.id && (
                <>
                  <p className={styles.stepMeta}>
                    {rootTask.title} · Step {currentIndex + 1} of {siblings.length}
                  </p>
                  <div
                    className={styles.segments}
                    role="img"
                    aria-label={`${siblings.filter((s) => getTaskProgress(s) >= 1).length} of ${siblings.length} steps done`}
                  >
                    {siblings.map((step) => {
                      const isCurrent = step.id === nextTask.id;
                      const isDone = !isCurrent && getTaskProgress(step) >= 1;
                      return (
                        <span
                          key={step.id}
                          className={`${styles.segment} ${
                            isCurrent ? styles.segmentCurrent : isDone ? styles.segmentDone : ""
                          }`}
                        />
                      );
                    })}
                  </div>
                </>
              )}

              <button type="button" className={styles.doneBtn} onClick={handleMarkDone}>
                <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true">
                  <path
                    d="M3 8.5 L6.5 12 L13 4.5"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Mark as done
              </button>
              <div className={styles.secondaryActions}>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={() => handleGenerate(nextTask.id)}
                  disabled={isGenerating}
                >
                  <SparkleIcon size={14} />
                  {isGenerating ? "Breaking down\u2026" : "Break it down"}
                </button>
                <Link href={`/tasks/new?parent=${nextTask.id}`} className={styles.secondaryBtn}>
                  <PlusIcon size={14} />
                  Add step
                </Link>
              </div>
            </article>

            {(upcomingSteps.length > 0 || nextRoot) && (
              <section className={styles.afterCard}>
                <h3 className={styles.afterHeading}>After this</h3>
                <ul>
                  {upcomingSteps.map((step) => (
                    <li key={step.id} className={styles.afterRow}>
                      <span className={styles.afterDot} aria-hidden="true" />
                      <span className={styles.afterText}>{step.title}</span>
                    </li>
                  ))}
                  {nextRoot && (
                    <li className={`${styles.afterRow} ${styles.afterRowMuted}`}>
                      <span
                        className={`${styles.afterDot} ${styles.afterDotTod}`}
                        data-tod={nextRoot.timeOfDay.toLowerCase()}
                        aria-hidden="true"
                      />
                      <span className={styles.afterText}>Then: {nextRoot.title}</span>
                    </li>
                  )}
                </ul>
              </section>
            )}
          </>
        )}

        {error && <p className={styles.errorText}>{error}</p>}
      </div>
    </div>
  );
}
