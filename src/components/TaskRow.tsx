"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getTaskProgress, type TaskNode } from "@/lib/task-tree";
import { autogrow } from "@/lib/autogrow";
import { ProgressRing } from "./ProgressRing";
import { EditIcon } from "./icons/EditIcon";
import { DeleteIcon } from "./icons/DeleteIcon";
import styles from "./TaskRow.module.css";

const SWIPE_THRESHOLD_PX = 80; // 5rem at the default 16px root

export function TaskRow({
  task,
  depth,
  onToggleStatus,
  onEdit,
  onDelete,
}: {
  task: TaskNode;
  depth: number;
  onToggleStatus: (task: TaskNode) => void;
  onEdit: (task: TaskNode, title: string) => void;
  onDelete: (task: TaskNode) => void;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const swipeStartX = useRef<number | null>(null);
  const didSwipeRef = useRef(false);
  const [_taskTitle, setTaskTitle] = useState(task.title);
  const [expanded, setExpanded] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [swiped, setSwiped] = useState(false);

  const isDone = task.status === "DONE";
  const hasSubtasks = task.subtasks.length > 0;
  const completedCount = task.subtasks.filter((s) => s.status === "DONE").length;

  const commitEdit = useCallback(() => {
    onEdit(task, _taskTitle);
    setIsEditing(false);
  }, [onEdit, task, _taskTitle]);

  // Exit editing only on a tap outside this row.
  useEffect(() => {
    if (!isEditing) return;

    function handlePointerDown(e: PointerEvent) {
      if (rowRef.current && !rowRef.current.contains(e.target as Node)) {
        commitEdit();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isEditing, commitEdit]);

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setTaskTitle(e.target.value);
    autogrow(e.target);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitEdit();
      inputRef.current?.blur();
    }
  }

  const setInputRef = useCallback((el: HTMLTextAreaElement | null) => {
    inputRef.current = el;
    autogrow(el);
  }, []);

  // Swipe left past the threshold reveals the add/delete buttons; swipe
  // right past it hides them again. Only the final distance matters — the
  // row doesn't track the pointer mid-gesture. Pointer events unify mouse
  // and touch in one handler; .row's user-select/user-drag: none (see CSS)
  // stops a click-drag from being hijacked into a native text-selection
  // drag, which used to cancel the pointer sequence before pointerup fired.
  function handleRowPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    swipeStartX.current = e.clientX;
  }

  function handleRowPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (swipeStartX.current === null) return;
    const dx = e.clientX - swipeStartX.current;
    swipeStartX.current = null;
    didSwipeRef.current = Math.abs(dx) > 10;
    if (dx < -SWIPE_THRESHOLD_PX) setSwiped(true);
    else if (dx > SWIPE_THRESHOLD_PX) setSwiped(false);
  }

  // Swallow the click a swipe gesture leaves behind, so it doesn't also
  // toggle status or enter edit mode.
  function handleRowClickCapture(e: React.MouseEvent) {
    if (didSwipeRef.current) {
      didSwipeRef.current = false;
      e.stopPropagation();
    }
  }

  return (
    // Only the root of a task tree is its own card — nested subtasks render
    // inside that same card rather than getting cards of their own.
    <li
      className={depth === 0 ? styles.card : styles.listItem}
      style={depth > 0 ? { marginLeft: 24 } : undefined}
    >
      <div
        className={styles.row}
        ref={rowRef}
        onPointerDown={handleRowPointerDown}
        onPointerUp={handleRowPointerUp}
        onClickCapture={handleRowClickCapture}
      >

        <span
          className={`${styles.title} ${isDone ? styles.titleDone : ""}`}
          onClick={() => setIsEditing(true)}
        >
          <textarea
            className={styles.input}
            rows={1}
            value={_taskTitle}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            ref={setInputRef}
          />
        </span>

        {hasSubtasks && (
          <button
            className={styles.countPill}
            aria-label={expanded ? "Collapse" : "Expand"}
            onClick={() => setExpanded((v) => !v)}
          >
            <span>
              {completedCount}/{task.subtasks.length}
            </span>
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              className={expanded ? styles.chevronExpanded : styles.chevron}
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
        )}

        <span className={styles.ringSlot}>
          <ProgressRing
            handleToggleStatus={() => onToggleStatus(task)}
            progress={getTaskProgress(task)}
            size={24}
            showLabel={false}
          />
        </span>

        <div className={`${styles.actions} ${swiped ? styles.actionsOpen : ""}`}>
          <Link
            href={`/tasks/${task.id}/edit`}
            className={styles.editButton}
            aria-label="Edit task"
          >
            <EditIcon size={20} />
          </Link>

          <button
            onClick={() => onDelete(task)}
            className={styles.deleteButton}
            aria-label="Delete task"
          >
            <DeleteIcon size={16} />
          </button>
        </div>
      </div>

      {expanded && hasSubtasks && (
        <ul className={styles.subList}>
          {task.subtasks.map((subtask) => (
            <TaskRow
              key={subtask.id}
              task={subtask}
              depth={depth + 1}
              onToggleStatus={onToggleStatus}
              onDelete={onDelete}
              onEdit={onEdit}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
