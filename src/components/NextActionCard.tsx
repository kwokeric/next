"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { TaskNode } from "@/lib/task-tree";
import styles from "./NextActionCard.module.css";

// Closes the kebab menu on an outside tap or Escape — same pattern as
// CreateTaskPage's time-of-day dropdown and FocusMode's per-step menu.
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

export function NextActionCard({
  task,
  ancestors,
  onComplete,
}: {
  task: TaskNode | null;
  ancestors: TaskNode[];
  onComplete: (task: TaskNode) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useCloseOnOutside(menuRef, menuOpen, () => setMenuOpen(false));

  return (
    <div className={styles.card}>
      <span className={styles.animatedBorder} aria-hidden="true" />
      {task && (
        <Link href="/focus" className={styles.caretHandle} aria-label="Open focus mode">
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M4 10 L8 6 L12 10"
              stroke="currentColor"
              strokeWidth="1.75"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
      )}

      <div className={styles.cardHeaderRow}>
        <div />
        <p className={styles.label}>Next task</p>
        {task && (
          <div className={styles.kebabWrap} ref={menuRef}>
            <button
              type="button"
              className={styles.kebabBtn}
              aria-label="More actions"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
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
                  href={`/tasks/new?parent=${task.id}`}
                  className={styles.menuItem}
                  role="menuitem"
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
                    <path
                      d="M8 3 V13 M3 8 H13"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                  </svg>
                  Add subtask
                </Link>
              </div>
            )}
          </div>
        )}
      </div>

      {task ? (
        <div className={styles.taskRow}>
          <Link href="/focus" className={styles.taskTitleGroup}>
            {ancestors.length > 0 && (
              <p className={styles.breadcrumb}>
                <span className={styles.breadcrumbText}>
                  {ancestors.map((a) => a.title).join(" > ")}
                </span>
                <svg width="11" height="11" viewBox="0 0 16 16" aria-hidden="true">
                  <path
                    d="M6 4 L10 8 L6 12"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </p>
            )}
            <span className={styles.taskTitle}>{task.title}</span>
          </Link>
          <div className={styles.actions}>
            <button
              onClick={() => onComplete(task)}
              className={styles.doneButton}
              aria-label="Complete task"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
                <path
                  d="M4 8.5 L7 11.5 L12 5"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Done
            </button>
          </div>
        </div>
      ) : (
        <p className={styles.empty}>Nothing left! Add a task to get started.</p>
      )}
    </div>
  );
}
