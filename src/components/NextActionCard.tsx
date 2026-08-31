"use client";

import Link from "next/link";
import type { TaskNode } from "@/lib/task-tree";
import styles from "./NextActionCard.module.css";

export function NextActionCard({
  task,
  ancestors,
  onComplete,
}: {
  task: TaskNode | null;
  ancestors: TaskNode[];
  onComplete: (task: TaskNode) => void;
}) {
  return (
    <div className={styles.card}>
      <span className={styles.animatedBorder} aria-hidden="true" />
      <p className={styles.label}>Next step</p>
      {task ? (
        <div className={styles.taskRow}>
          <div className={styles.taskTitleGroup}>
            {ancestors.length > 0 && (
              <p className={styles.breadcrumb}>
                <span className={styles.breadcrumbText}>
                  {ancestors.map((a) => a.title).join(" > ")}{` >`}
                </span>
              </p>
            )}
            <span className={styles.taskTitle}>{task.title}</span>
          </div>
          <div className={styles.actions}>
            <Link
              href={`/tasks/new?parent=${task.id}`}
              className={styles.plusButton}
              aria-label="Add subtask"
            >
              <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true">
                <path
                  d="M4 3 V8 C4 9.1 4.9 10 6 10 H11"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M8.5 7.5 L12 10 L8.5 12.5"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Link>
            <button
              onClick={() => onComplete(task)}
              className={styles.checkButton}
              aria-label="Complete task"
            >
              <svg width="24" height="24" viewBox="0 0 16 16" aria-hidden="true">
                <path
                  d="M4 8.5 L7 11.5 L12 5"
                  stroke="currentColor"
                  strokeWidth="2"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </div>
      ) : (
        <p className={styles.empty}>Nothing left! Add a task to get started.</p>
      )}
    </div>
  );
}
