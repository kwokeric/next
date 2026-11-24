"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import type { Task, TimeOfDay } from "@prisma/client";
import {
  buildTaskTree,
  getProjectProgress,
  getTaskProgress,
  type TaskNode,
} from "@/lib/task-tree";
import { updateTask, deleteTask } from "@/lib/api-client";
import { formatDay, tasksForDay, todayKey, TIMEZONE_COOKIE, type DayKey } from "@/lib/day";
import { TaskRow } from "./TaskRow";
import { DayPicker } from "./DayPicker";
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
  { key: "ANYTIME", label: "Anytime", icon: <ClockIcon size={15} /> },
  { key: "MORNING", label: "Morning", icon: <SunriseIcon size={15} /> },
  { key: "AFTERNOON", label: "Afternoon", icon: <SunIcon size={15} /> },
  { key: "EVENING", label: "Evening", icon: <MoonIcon size={15} /> },
];

function subscribeToDayChange(onChange: () => void) {
  window.addEventListener("focus", onChange);
  document.addEventListener("visibilitychange", onChange);
  return () => {
    window.removeEventListener("focus", onChange);
    document.removeEventListener("visibilitychange", onChange);
  };
}

export function TaskApp({
  initialTasks,
  initialToday,
  initialDay,
}: {
  initialTasks: Task[];
  // "Today" as the server resolved it from the visitor's tz cookie (UTC
  // until that cookie exists), so the first render matches on both sides.
  initialToday: DayKey;
  // The ?day= being viewed, if any.
  initialDay: DayKey | null;
}) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  // The browser's own "today". Hydration uses the server's value, then
  // React re-renders with the browser's if they differ (first visit before
  // the tz cookie exists) — no mismatch. Re-checked when the tab regains
  // focus, so a tab left open overnight moves on to the new day.
  const today = useSyncExternalStore(subscribeToDayChange, () => todayKey(), () => initialToday);
  // null = follow today; otherwise the day the user picked.
  const [pickedDay, setPickedDay] = useState<DayKey | null>(initialDay);
  const selectedDay = pickedDay ?? today;

  // Remember the browser's timezone so future server renders get "today"
  // right on the first pass.
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    document.cookie = `${TIMEZONE_COOKIE}=${encodeURIComponent(tz)}; path=/; max-age=31536000; samesite=lax`;
  }, []);

  function selectDay(day: DayKey) {
    setPickedDay(day === today ? null : day);
    // Keep the URL shareable/back-navigable without a server round trip.
    window.history.replaceState(null, "", day === today ? "/" : `/?day=${day}`);
  }

  const tree = useMemo(() => buildTaskTree(tasks), [tasks]);
  const dayTasks = useMemo(() => tasksForDay(tree, selectedDay, today), [tree, selectedDay, today]);
  const projectProgress = useMemo(() => getProjectProgress(dayTasks.tasks), [dayTasks]);
  const isToday = selectedDay === today;
  const isPast = selectedDay < today;

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
    () =>
      dayTasks.tasks.filter((task) => getTaskProgress(task) < 1 || pendingCompletionIds.has(task.id)),
    [dayTasks, pendingCompletionIds]
  );
  const completedTasks = useMemo(
    () =>
      dayTasks.tasks.filter((task) => getTaskProgress(task) >= 1 && !pendingCompletionIds.has(task.id)),
    [dayTasks, pendingCompletionIds]
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

  const dayName = formatDay(selectedDay, { weekday: "long" });
  const dateLabel = `${isToday ? "Today · " : ""}${formatDay(selectedDay, { month: "short", day: "numeric" })}`;
  const dayTotal = dayTasks.tasks.length;
  const progressPercent = Math.round(projectProgress * 100);

  function renderTaskList(list: TaskNode[]) {
    return (
      <ul className={styles.taskList}>
        {list.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            depth={0}
            badge={dayTasks.carriedFrom.get(task.id)}
            onToggleStatus={handleToggleStatus}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        ))}
      </ul>
    );
  }

  function renderChevron(isCollapsed: boolean) {
    return (
      <svg
        width="14"
        height="14"
        viewBox="0 0 16 16"
        className={styles.sectionChevron}
        style={{ transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)" }}
        aria-hidden="true"
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
    );
  }

  const completedCollapsed = collapsedSections.has("COMPLETED");

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <p className="page-eyebrow">{dateLabel}</p>
          <h1 className="page-title">{dayName}</h1>
        </div>
        <div className={styles.headerActions}>
          {!isToday && (
            <button type="button" className={styles.todayButton} onClick={() => selectDay(today)}>
              Today
            </button>
          )}
          {dayTotal > 0 && (
            <div
              className={styles.dayRing}
              style={{ "--progress": `${progressPercent}%` } as React.CSSProperties}
              role="img"
              aria-label={`${completedTasks.length} of ${dayTotal} tasks completed`}
            >
              <span className={styles.dayRingLabel} aria-hidden="true">
                {completedTasks.length}/{dayTotal}
              </span>
            </div>
          )}
        </div>
      </header>

      <DayPicker
        selected={selectedDay}
        today={today}
        onSelect={selectDay}
        hasTasks={(day) => tasksForDay(tree, day, today).tasks.length > 0}
      />

      {isPast && dayTotal === 0 && (
        <section className={styles.emptyCard}>
          <p className={styles.emptyTitle}>All clear</p>
          <p className={styles.emptyBody}>Anything left undone moved to today.</p>
        </section>
      )}

      {/* Past days only show what got done — there's nothing to add to them. */}
      {!isPast && TIME_OF_DAY_SECTIONS.map(({ key, label, icon }) => {
        const tasksInSection = activeOrPendingTasks.filter((task) => task.timeOfDay === key);
        const isCollapsed = collapsedSections.has(key);
        return (
          <section key={key} className={styles.sectionCard} data-tod={key.toLowerCase()}>
            <div className={styles.sectionHeaderRow}>
              <button
                className={styles.sectionHeaderButton}
                onClick={() => toggleSection(key)}
                aria-expanded={!isCollapsed}
              >
                <span className={styles.sectionIcon} aria-hidden="true">
                  {icon}
                </span>
                <span className={styles.sectionHeader}>{label}</span>
                <span className={styles.sectionCount}>{tasksInSection.length}</span>
                {renderChevron(isCollapsed)}
              </button>
              <Link
                href={`/tasks/new?timeOfDay=${key}${isToday ? "" : `&date=${selectedDay}`}`}
                className={styles.sectionAddButton}
                aria-label={`Add task to ${label}`}
              >
                <PlusIcon size={14} />
              </Link>
            </div>

            {!isCollapsed && tasksInSection.length > 0 && renderTaskList(tasksInSection)}
          </section>
        );
      })}

      {completedTasks.length > 0 && (
        <section className={styles.sectionCard}>
          <div className={styles.sectionHeaderRow}>
            <button
              className={styles.sectionHeaderButton}
              onClick={() => toggleSection("COMPLETED")}
              aria-expanded={!completedCollapsed}
            >
              <span className={`${styles.sectionIcon} ${styles.sectionIconDone}`} aria-hidden="true">
                <svg width="14" height="14" viewBox="0 0 16 16">
                  <path
                    d="M3.5 8.5 L6.5 11.5 L12.5 5"
                    stroke="currentColor"
                    strokeWidth="2"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <span className={styles.sectionHeader}>Completed</span>
              <span className={styles.sectionCount}>{completedTasks.length}</span>
              {renderChevron(completedCollapsed)}
            </button>
          </div>
          {!completedCollapsed && renderTaskList(completedTasks)}
        </section>
      )}
    </div>
  );
}
