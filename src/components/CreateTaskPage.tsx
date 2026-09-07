"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
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
  editingTask = null,
  initialSubtasks = [],
  initialTimeOfDay,
  initialScheduledFor = null,
  initialExactTime = null,
  showBackCaret = false,
}: {
  projectId: string;
  parentTask: Task | null;
  editingTask?: Task | null;
  initialSubtasks?: Task[];
  initialTimeOfDay: TimeOfDay | null;
  initialScheduledFor?: string | null;
  initialExactTime?: string | null;
  showBackCaret?: boolean;
}) {
  const router = useRouter();

  const initialDateChoice: DateChoice = !initialScheduledFor
    ? ""
    : initialScheduledFor === localDateString(0)
      ? "today"
      : initialScheduledFor === localDateString(1)
        ? "tomorrow"
        : "custom";

  const [title, setTitle] = useState(editingTask?.title ?? "");
  const [dateChoice, setDateChoice] = useState<DateChoice>(initialDateChoice);
  // Always seeded from the resolved date, not just for "custom" — so the
  // picker visibly shows today's/tomorrow's actual date when one of those
  // shortcuts is what's selected, instead of sitting blank.
  const [customDate, setCustomDate] = useState(initialScheduledFor ?? "");
  const [timeChoice, setTimeChoice] = useState<TimeChoice>(
    initialExactTime ? "exact" : initialTimeOfDay ? (initialTimeOfDay.toLowerCase() as TimeChoice) : ""
  );
  const [exactTime, setExactTime] = useState(initialExactTime ?? "");

  const [subtasks, setSubtasks] = useState<Task[]>(initialSubtasks);
  const [draftTaskId, setDraftTaskId] = useState<string | null>(editingTask?.id ?? null);
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [todOpen, setTodOpen] = useState(false);
  const todRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const hasTitle = title.trim().length > 0;

  // Cancel and Create both end by pushing back to "/" — that navigation runs
  // async cleanup first (deleting a draft, or the create call itself) so it
  // can't just be a <Link>. Warming the prefetch as soon as this page mounts
  // means the shell for "/" is already cached by the time either fires.
  useEffect(() => {
    router.prefetch("/");
  }, [router]);

  // autoFocus alone is unreliable on mobile browsers (often suppressed to
  // avoid popping the keyboard on navigation) and doesn't select existing
  // text — focusing and selecting explicitly on mount is more robust and
  // means typing immediately replaces anything already there.
  useEffect(() => {
    titleInputRef.current?.focus();
    titleInputRef.current?.select();
  }, []);

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
    const next = dateChoice === choice ? "" : choice;
    setDateChoice(next);
    // Fill the date field with the actual resolved date so it's visibly
    // in sync with the Today/Tomorrow pick, not left blank.
    setCustomDate(next === "today" ? localDateString(0) : next === "tomorrow" ? localDateString(1) : "");
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
      if (editingTask) {
        router.back();
      } else {
        router.push("/");
      }
      router.refresh();
    } catch {
      setError("Couldn't create the task. Try again.");
      setIsSubmitting(false);
    }
  }

  async function handleCancel() {
    // Only delete the draft if this page created it speculatively (the
    // "add subtask"/"new task" flows) — editingTask means draftTaskId is a
    // real, pre-existing task, which must never be deleted just because
    // its editor was closed.
    if (draftTaskId && !editingTask) {
      try {
        await deleteTask(draftTaskId);
      } catch {
        // Best-effort cleanup — nothing the user can do about it here.
      }
    }
    // Back to wherever this page was opened from (the list for the
    // timeOfDay "+" entry point, Focus mode for the "Add subtask" one) —
    // not always "/", since the caret means "back," not "home."
    router.back();
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        {showBackCaret ? (
          <button
            type="button"
            className={styles.headerLink}
            onClick={handleCancel}
            aria-label="Back"
          >
            <BackIcon size={20} />
          </button>
        ) : (
          <div />
        )}
        <span className={styles.headerTitle}>
          {editingTask ? "Edit task" : parentTask ? "Add subtask" : "New task"}
        </span>
        <div />
      </div>

      <div className={styles.body}>
        {parentTask && (
          <Link href={`/tasks/${parentTask.id}/edit`} className={styles.parentCard}>
            <div className={styles.parentCardText}>
              <span className={styles.parentCardEyebrow}>Adding to</span>
              <span className={styles.parentCardTitle}>{parentTask.title}</span>
            </div>
            <svg
              className={styles.parentCardArrow}
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M9 6l6 6-6 6" />
            </svg>
          </Link>
        )}

        <div className={styles.fieldBlock}>
          <label htmlFor="task-title" className={styles.fieldLabel}>
            Task
          </label>
          <input
            id="task-title"
            ref={titleInputRef}
            className={styles.titleInput}
            placeholder="Enter task"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div className={styles.fieldBlock}>
          <div className={styles.fieldLabel}>Date</div>
          <div className={styles.pickerBar}>
            <input
              type="date"
              className={`${styles.pickerMain} ${dateChoice === "custom" ? styles.pickerMainFilled : ""}`}
              value={customDate}
              onChange={(e) => handleCustomDateChange(e.target.value)}
              aria-label="Pick a date"
            />
            <span className={styles.pickerDivider} aria-hidden="true" />
            <div className={styles.pickerAccessory}>
              <button
                type="button"
                className={`${styles.pickerBtn} ${dateChoice === "today" ? styles.pickerBtnActive : ""}`}
                onClick={() => toggleDateChoice("today")}
              >
                Today
              </button>
              <button
                type="button"
                className={`${styles.pickerBtn} ${dateChoice === "tomorrow" ? styles.pickerBtnActive : ""}`}
                onClick={() => toggleDateChoice("tomorrow")}
              >
                Tomorrow
              </button>
            </div>
          </div>
        </div>

        <div className={styles.fieldBlock}>
          <div className={styles.fieldLabel}>Time</div>
          <div className={styles.pickerBar}>
            <input
              type="time"
              step={300}
              className={`${styles.pickerMain} ${timeChoice === "exact" ? styles.pickerMainFilled : ""}`}
              value={exactTime}
              onChange={(e) => handleExactTimeChange(e.target.value)}
              aria-label="Pick an exact time"
            />

            <span className={styles.pickerDivider} aria-hidden="true" />

            <div className={styles.pickerAccessory}>
              <div className={styles.dropdownWrapper} ref={todRef}>
                <button
                  type="button"
                  className={`${styles.pickerBtn} ${
                    effectiveTimeOfDay || todOpen ? styles.pickerBtnActive : ""
                  }`}
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
          {isSubmitting
            ? editingTask
              ? "Saving…"
              : "Creating…"
            : editingTask
              ? "Save changes"
              : "Create task"}
        </button>
      </div>
    </div>
  );
}
