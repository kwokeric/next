"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Task, TimeOfDay } from "@prisma/client";
import { createTask, updateTask, deleteTask, breakdownTask } from "@/lib/api-client";
import { autogrow } from "@/lib/autogrow";
import { SparkleIcon } from "./icons/SparkleIcon";
import { BackIcon } from "./icons/BackIcon";
import { PlusIcon } from "./icons/PlusIcon";
import { ClockIcon } from "./icons/ClockIcon";
import { SunriseIcon } from "./icons/SunriseIcon";
import { SunIcon } from "./icons/SunIcon";
import { MoonIcon } from "./icons/MoonIcon";
import styles from "./CreateTaskPage.module.css";

type DateChoice = "" | "today" | "tomorrow" | "custom";
type TimeChoice = "" | "anytime" | "morning" | "afternoon" | "evening" | "exact";
type TimeOfDayChoice = Exclude<TimeChoice, "" | "exact">;

const TIME_OF_DAY_OPTIONS: { value: TimeOfDayChoice; icon: React.ReactNode; label: string }[] = [
  { value: "anytime", icon: <ClockIcon size={14} />, label: "Anytime" },
  { value: "morning", icon: <SunriseIcon size={14} />, label: "Morning" },
  { value: "afternoon", icon: <SunIcon size={14} />, label: "Afternoon" },
  { value: "evening", icon: <MoonIcon size={14} />, label: "Evening" },
];

// Maps a clock time to a bucket so picking an exact time also fills in a
// sensible time-of-day, instead of leaving it at the ANYTIME default.
function timeOfDayFromExactTime(value: string): TimeOfDayChoice {
  const hour = parseInt(value.split(":")[0] ?? "0", 10);
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  return "evening";
}

function localDateString(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Closes an open dropdown on an outside tap or Escape.
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

  useCloseOnOutside(todRef, todOpen, () => setTodOpen(false));

  // What the time-of-day dropdown should show: an explicit bucket pick, or
  // (if an exact time is set instead) the bucket that time falls into.
  const effectiveTimeOfDay: TimeOfDayChoice | "" =
    timeChoice === "exact"
      ? exactTime
        ? timeOfDayFromExactTime(exactTime)
        : ""
      : timeChoice;
  const selectedTimeOfDayOption = TIME_OF_DAY_OPTIONS.find(
    (opt) => opt.value === effectiveTimeOfDay
  );

  function computeScheduledFor(): string | null {
    if (dateChoice === "today") return localDateString(0);
    if (dateChoice === "tomorrow") return localDateString(1);
    if (dateChoice === "custom" && customDate) return customDate;
    return null;
  }

  function computeTimeOfDay(): TimeOfDay | undefined {
    return effectiveTimeOfDay ? (effectiveTimeOfDay.toUpperCase() as TimeOfDay) : undefined;
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
    setError(null);
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

  function handleSubtaskTitleChange(id: string, value: string) {
    setSubtasks((prev) => prev.map((s) => (s.id === id ? { ...s, title: value } : s)));
  }

  async function handleSubtaskTitleBlur(subtask: Task) {
    const trimmed = subtask.title.trim();
    if (!trimmed) return;
    try {
      await updateTask(subtask.id, { title: trimmed });
    } catch {
      setError("Couldn't save that subtask's name.");
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
        <button
          type="button"
          className={styles.headerLink}
          onClick={handleCancel}
          aria-label="Back"
        >
          <BackIcon size={20} />
        </button>
        <span className={styles.headerTitle}>{parentTask ? "Add subtask" : "New task"}</span>
        <div/>
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
            <input
              type="date"
              className={`${styles.chip} ${styles.chipNeutral} ${styles.pillInput} ${
                dateChoice === "custom" ? styles.chipSelected : ""
              }`}
              value={customDate}
              onChange={(e) => handleCustomDateChange(e.target.value)}
              aria-label="Pick a date"
            />
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
          </div>
        </div>

        <div className={styles.fieldBlock}>
          <div className={styles.fieldLabel}>Time</div>
          <div className={`${styles.chipRow} ${styles.timeRow}`}>
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

            <span className={styles.orLabel}>or</span>

            <div className={styles.dropdownWrapper} ref={todRef}>
              <button
                type="button"
                className={`${styles.chip} ${styles.chipNeutral} ${styles.dropdownTrigger} ${
                  effectiveTimeOfDay ? styles.chipSelected : ""
                } ${todOpen ? styles.dropdownTriggerOpen : ""}`}
                onClick={() => setTodOpen((v) => !v)}
                aria-haspopup="listbox"
                aria-expanded={todOpen}
              >
                <span className={styles.dropdownLabel}>
                  {selectedTimeOfDayOption ? (
                    <>
                      {selectedTimeOfDayOption.icon}
                      {selectedTimeOfDayOption.label}
                    </>
                  ) : (
                    "Time of day"
                  )}
                </span>
                <svg
                  className={`${styles.dropdownCaret} ${todOpen ? styles.dropdownCaretOpen : ""}`}
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
                <div className={styles.dropdownPanel} role="listbox">
                  {TIME_OF_DAY_OPTIONS.map((opt) => (
                    <button
                      type="button"
                      key={opt.value}
                      role="option"
                      aria-selected={effectiveTimeOfDay === opt.value}
                      className={`${styles.dropdownOption} ${
                        effectiveTimeOfDay === opt.value ? styles.dropdownOptionSelected : ""
                      }`}
                      onClick={() => {
                        handleTimeOfDaySelect(opt.value);
                        setTodOpen(false);
                      }}
                    >
                      {opt.icon}
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className={styles.fieldBlock}>
          <div className={styles.fieldLabel}>Subtasks ({subtasks.length})</div>
          {(subtasks.length > 0 || addingSubtask) && (
            <ul className={styles.subtaskList}>
              {subtasks.map((subtask) => (
                <li key={subtask.id} className={styles.subtaskRow}>
                  <textarea
                    className={styles.subtaskInput}
                    rows={1}
                    value={subtask.title}
                    onChange={(e) => {
                      handleSubtaskTitleChange(subtask.id, e.target.value);
                      autogrow(e.target);
                    }}
                    onBlur={() => handleSubtaskTitleBlur(subtask)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        e.currentTarget.blur();
                      }
                    }}
                    ref={autogrow}
                  />
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
              {addingSubtask && (
                <li className={styles.subtaskRow}>
                  <textarea
                    className={styles.subtaskInput}
                    placeholder="Subtask name"
                    rows={1}
                    value={newSubtaskTitle}
                    onChange={(e) => {
                      setNewSubtaskTitle(e.target.value);
                      autogrow(e.target);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddSubtask();
                      }
                    }}
                    onBlur={() => {
                      if (!newSubtaskTitle.trim()) setAddingSubtask(false);
                    }}
                    autoFocus
                    ref={autogrow}
                  />
                </li>
              )}
            </ul>
          )}

          <div className={styles.subtaskActions}>
            <button
              type="button"
              className={`${styles.chip} ${styles.chipNeutral} ${styles.subtaskBtn}`}
              disabled={!hasTitle}
              onClick={() => (addingSubtask ? handleAddSubtask() : setAddingSubtask(true))}
            >
              <PlusIcon size={12} />
              Add subtask
            </button>
            <button
              type="button"
              className={`${styles.chip} ${styles.subtaskBtn} ${styles.subtaskGenerateBtn}`}
              disabled={!hasTitle || isGenerating}
              onClick={handleGenerate}
            >
              <span className={styles.rotatingBorder} aria-hidden="true" />
              <span className={styles.btnLabel}>
                {isGenerating ? (
                  "Generating…"
                ) : (
                  <>
                    <SparkleIcon size={14} className={styles.sparkleIcon} /> Generate
                  </>
                )}
              </span>
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
