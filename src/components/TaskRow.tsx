"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getTaskProgress, type TaskNode } from "@/lib/task-tree";
import { ProgressRing } from "./ProgressRing";
import styles from "./TaskRow.module.css";

const SWIPE_THRESHOLD_PX = 80; // 5rem at the default 16px root

export function TaskRow({
  task,
  depth,
  isNextTask,
  nextTaskId,
  onToggleStatus,
  onEdit,
  onDelete,
  onOpenAddSubtask,
}: {
  task: TaskNode;
  depth: number;
  isNextTask: boolean;
  // Threaded through the recursion below so nested rows at any depth can
  // compute their own isNextTask — the next task is usually a subtask, not
  // a root, since it's found via depth-first descent (see findNextTask).
  nextTaskId: string | null;
  onToggleStatus: (task: TaskNode) => void;
  onEdit: (task: TaskNode, title: string) => void;
  onDelete: (task: TaskNode) => void;
  onOpenAddSubtask: (taskId: string) => void;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
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

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    setTaskTitle(e.target.value);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      commitEdit();
      inputRef.current?.blur();
    }
  }

  const onAddSubtask = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    onOpenAddSubtask(task.id)
  }

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
          <input
            className={styles.input}
            value={_taskTitle}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            ref={inputRef}
          />
        </span>


        {hasSubtasks && (depth > 0 || !expanded) && (
          <span className={styles.count}>
            {completedCount}/{task.subtasks.length}
          </span>
        )}

        {hasSubtasks && (depth > 0 || !expanded) && (
          <button
            className={styles.toggleButton}
            aria-label={expanded ? "Collapse" : "Expand"}
            onClick={() => setExpanded((v) => !v)}
          >
            <svg
              width="16"
              height="16"
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

        <ProgressRing
          handleToggleStatus={() => onToggleStatus(task)}
          isNextTask={isNextTask}
          progress={getTaskProgress(task)}
          size={24}
          showLabel={false}
        />

        <div className={`${styles.actions} ${swiped ? styles.actionsOpen : ""}`}>
          <button
            onClick={onAddSubtask}
            className={styles.addButton}
            aria-label="Add subtask"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
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
          </button>

          <button
            onClick={() => onDelete(task)}
            className={styles.deleteButton}
            aria-label="Delete task"
          >
            ×
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
              isNextTask={subtask.id === nextTaskId}
              nextTaskId={nextTaskId}
              onToggleStatus={onToggleStatus}
              onDelete={onDelete}
              onEdit={onEdit}
              onOpenAddSubtask={onOpenAddSubtask}
            />
          ))}
        </ul>
      )}

      {hasSubtasks && depth === 0 && expanded && (
        <div className={styles.cardFooter}>
          <span className={styles.count}>
            {completedCount}/{task.subtasks.length}
          </span>
          <button
            className={styles.toggleButton}
            aria-label={expanded ? "Collapse" : "Expand"}
            onClick={() => setExpanded((v) => !v)}
          >
            <svg
              width="16"
              height="16"
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
        </div>
      )}
    </li>
  );
}
