"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Task, TimeOfDay } from "@prisma/client";
import { createTask, updateTask, deleteTask, breakdownTask } from "@/lib/api-client";
import styles from "./CreateTaskPage.module.css";

type DateChoice = "" | "today" | "tomorrow" | "custom";
type TimeChoice = "" | "anytime" | "morning" | "afternoon" | "evening" | "exact";

const TIME_OF_DAY_OPTIONS: { value: Exclude<TimeChoice, "" | "exact">; label: string }[] = [
  { value: "anytime", label: "🕐 Anytime" },
  { value: "morning", label: "🌅 Morning" },
  { value: "afternoon", label: "☀️ Afternoon" },
  { value: "evening", label: "🌙 Evening" },
];

function localDateString(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function CreateTaskPage({
  projectId,
  parentTask,
  initialTimeOfDay,
}: {
  projectId: string;
  parentTask: Task | null;
  initialTimeOfDay: TimeOfDay | null;
}) {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [dateChoice, setDateChoice] = useState<DateChoice>("");
  const [customDate, setCustomDate] = useState("");
  const [timeChoice, setTimeChoice] = useState<TimeChoice>(
    initialTimeOfDay ? (initialTimeOfDay.toLowerCase() as TimeChoice) : ""
  );
  const [exactTime, setExactTime] = useState("");

  const [subtasks, setSubtasks] = useState<Task[]>([]);
  const [draftTaskId, setDraftTaskId] = useState<string | null>(null);
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [todOpen, setTodOpen] = useState(false);
  const todRef = useRef<HTMLDivElement>(null);

  const hasTitle = title.trim().length > 0;

  useEffect(() => {
    if (!todOpen) return;

    function handlePointerDown(e: PointerEvent) {
      if (todRef.current && !todRef.current.contains(e.target as Node)) {
        setTodOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setTodOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [todOpen]);

  function computeScheduledFor(): string | null {
    if (dateChoice === "today") return localDateString(0);
    if (dateChoice === "tomorrow") return localDateString(1);
    if (dateChoice === "custom" && customDate) return customDate;
    return null;
  }

  function computeTimeOfDay(): TimeOfDay | undefined {
    if (
      timeChoice === "anytime" ||
      timeChoice === "morning" ||
      timeChoice === "afternoon" ||
      timeChoice === "evening"
    ) {
      return timeChoice.toUpperCase() as TimeOfDay;
    }
    return undefined;
  }

  function computeScheduledTime(): string | null {
    if (timeChoice === "exact" && exactTime) return `1970-01-01T${exactTime}:00`;
    return null;
  }

  function toggleDateChoice(choice: Exclude<DateChoice, "" | "custom">) {
    setCustomDate("");
    setDateChoice((prev) => (prev === choice ? "" : choice));
  }

  function handleCustomDateChange(value: string) {
    setCustomDate(value);
    setDateChoice(value ? "custom" : "");
  }

  function handleTimeOfDaySelect(value: string) {
    setExactTime("");
    setTimeChoice(value ? (value as TimeChoice) : "");
  }

  function handleExactTimeChange(value: string) {
    setExactTime(value);
    setTimeChoice(value ? "exact" : "");
  }

  async function ensureDraftTask(): Promise<string> {
    if (draftTaskId) return draftTaskId;
    const created = await createTask(projectId, {
      title: title.trim(),
      parentTaskId: parentTask?.id ?? null,
      timeOfDay: computeTimeOfDay(),
      scheduledFor: computeScheduledFor(),
      scheduledTime: computeScheduledTime(),
    });
    setDraftTaskId(created.id);
    return created.id;
  }

  async function handleAddSubtask() {
    const subtitle = newSubtaskTitle.trim();
    if (!subtitle) return;
    try {
      const parentId = await ensureDraftTask();
      const created = await createTask(projectId, { title: subtitle, parentTaskId: parentId });
      setSubtasks((prev) => [...prev, created]);
      setNewSubtaskTitle("");
      setAddingSubtask(false);
    } catch {
      setError("Couldn't add that subtask. Try again.");
    }
  }

  async function handleGenerate() {
    setIsGenerating(true);
    setError(null);
    try {
      const parentId = await ensureDraftTask();
      const generated = await breakdownTask(parentId);
      setSubtasks((prev) => [...prev, ...generated]);
    } catch {
      setError("Couldn't generate subtasks. Try again.");
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleDeleteSubtask(id: string) {
    setSubtasks((prev) => prev.filter((s) => s.id !== id));
    try {
      await deleteTask(id);
    } catch {
      setError("Couldn't remove that subtask.");
    }
  }

  async function handleCreate() {
    if (!hasTitle || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      if (draftTaskId) {
        await updateTask(draftTaskId, {
          title: title.trim(),
          timeOfDay: computeTimeOfDay(),
          scheduledFor: computeScheduledFor(),
          scheduledTime: computeScheduledTime(),
        });
      } else {
        await createTask(projectId, {
          title: title.trim(),
          parentTaskId: parentTask?.id ?? null,
          timeOfDay: computeTimeOfDay(),
          scheduledFor: computeScheduledFor(),
          scheduledTime: computeScheduledTime(),
        });
      }
      router.push("/");
      router.refresh();
    } catch {
      setError("Couldn't create the task. Try again.");
      setIsSubmitting(false);
    }
  }

  async function handleCancel() {
    if (draftTaskId) {
      try {
        await deleteTask(draftTaskId);
      } catch {
        // Best-effort cleanup — nothing the user can do about it here.
      }
    }
    router.push("/");
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <button type="button" className={styles.headerLink} onClick={handleCancel}>
          Cancel
        </button>
        <span className={styles.headerTitle}>{parentTask ? "Add subtask" : "New task"}</span>
        <button
          type="button"
          className={styles.pillPrimary}
          disabled={!hasTitle || isSubmitting}
          onClick={handleCreate}
        >
          Create
        </button>
      </div>

      <div className={styles.body}>
        {parentTask && (
          <p className={styles.parentContext}>Subtask of &ldquo;{parentTask.title}&rdquo;</p>
        )}

        <input
          className={styles.titleInput}
          placeholder="Task name"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
        />

        <div className={styles.fieldBlock}>
          <div className={styles.fieldLabel}>Date</div>
          <div className={`${styles.chipRow} ${styles.chipRowNowrap}`}>
            <button
              type="button"
              className={`${styles.chip} ${styles.chipNeutral} ${
                dateChoice === "today" ? styles.chipSelected : ""
              }`}
              onClick={() => toggleDateChoice("today")}
            >
              Today
            </button>
            <button
              type="button"
              className={`${styles.chip} ${styles.chipNeutral} ${
                dateChoice === "tomorrow" ? styles.chipSelected : ""
              }`}
              onClick={() => toggleDateChoice("tomorrow")}
            >
              Tomorrow
            </button>
            <input
              type="date"
              className={`${styles.chip} ${styles.chipNeutral} ${styles.pillInput} ${
                dateChoice === "custom" ? styles.chipSelected : ""
              }`}
              value={customDate}
              onChange={(e) => handleCustomDateChange(e.target.value)}
              aria-label="Pick a date"
            />
          </div>
        </div>

        <div className={styles.fieldBlock}>
          <div className={styles.fieldLabel}>Time</div>
          <div className={styles.chipRow}>
            <div className={styles.todWrapper} ref={todRef}>
              <button
                type="button"
                className={`${styles.chip} ${styles.chipNeutral} ${styles.todTrigger} ${
                  timeChoice && timeChoice !== "exact" ? styles.chipSelected : ""
                } ${todOpen ? styles.todTriggerOpen : ""}`}
                onClick={() => setTodOpen((v) => !v)}
                aria-haspopup="listbox"
                aria-expanded={todOpen}
              >
                <span className={styles.todLabel}>
                  {TIME_OF_DAY_OPTIONS.find((opt) => opt.value === timeChoice)?.label ??
                    "Time of day"}
                </span>
                <svg
                  className={`${styles.todCaret} ${todOpen ? styles.todCaretOpen : ""}`}
                  width="10"
                  height="10"
                  viewBox="0 0 10 10"
                  aria-hidden="true"
                >
                  <path
                    d="M2 3.5 L5 6.5 L8 3.5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              {todOpen && (
                <div className={styles.todPanel} role="listbox">
                  {TIME_OF_DAY_OPTIONS.map((opt) => (
                    <button
                      type="button"
                      key={opt.value}
                      role="option"
                      aria-selected={timeChoice === opt.value}
                      className={`${styles.todOption} ${
                        timeChoice === opt.value ? styles.todOptionSelected : ""
                      }`}
                      onClick={() => {
                        handleTimeOfDaySelect(opt.value);
                        setTodOpen(false);
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <input
              type="time"
              step={300}
              className={`${styles.chip} ${styles.chipNeutral} ${styles.pillInput} ${
                timeChoice === "exact" ? styles.chipSelected : ""
              }`}
              value={exactTime}
              onChange={(e) => handleExactTimeChange(e.target.value)}
              aria-label="Pick an exact time"
            />
          </div>
        </div>

        <div className={styles.fieldBlock}>
          <div className={styles.fieldLabel}>Subtasks ({subtasks.length})</div>
          {subtasks.length > 0 && (
            <ul className={styles.subtaskList}>
              {subtasks.map((subtask) => (
                <li key={subtask.id} className={styles.subtaskRow}>
                  <span className={styles.miniRing} />
                  <span>{subtask.title}</span>
                  <button
                    type="button"
                    className={styles.miniX}
                    onClick={() => handleDeleteSubtask(subtask.id)}
                    aria-label={`Remove ${subtask.title}`}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}

          {addingSubtask && (
            <input
              className={styles.addSubtaskInput}
              placeholder="Subtask name"
              value={newSubtaskTitle}
              onChange={(e) => setNewSubtaskTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddSubtask();
              }}
              autoFocus
            />
          )}

          <div className={styles.subtaskActions}>
            <button
              type="button"
              className={`${styles.chip} ${styles.chipNeutral} ${styles.subtaskBtn}`}
              disabled={!hasTitle}
              onClick={() => setAddingSubtask(true)}
            >
              + Add subtask
            </button>
            <button
              type="button"
              className={`${styles.chip} ${styles.subtaskBtn} ${styles.subtaskGenerateBtn}`}
              disabled={!hasTitle || isGenerating}
              onClick={handleGenerate}
            >
              <span className={styles.rotatingBorder} aria-hidden="true" />
              <span className={styles.btnLabel}>{isGenerating ? "Generating…" : "✨ Generate"}</span>
            </button>
          </div>
        </div>

        {error && <p className={styles.errorText}>{error}</p>}
      </div>

      <div className={styles.ctaBar}>
        <button
          type="button"
          className={styles.pillPrimaryLg}
          disabled={!hasTitle || isSubmitting}
          onClick={handleCreate}
        >
          {isSubmitting ? "Creating…" : "Create task"}
        </button>
      </div>
    </div>
  );
}
