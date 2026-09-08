"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Task, TimeOfDay } from "@prisma/client";
import { createTask, updateTask, deleteTask, breakdownTask, reorderTask } from "@/lib/api-client";
import { autogrow } from "@/lib/autogrow";
import { SparkleIcon } from "./icons/SparkleIcon";
import { BackIcon } from "./icons/BackIcon";
import { DragHandleIcon } from "./icons/DragHandleIcon";
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

// Same per-bucket pastel used for the section chips on the task list page
// (see TaskApp.module.css's .anytime/.morning/.afternoon/.evening) — kept
// here too since CSS Modules don't share classes across files.
const TIME_OF_DAY_COLOR_CLASS: Record<TimeOfDayChoice, string> = {
  anytime: styles.timeOfDayAnytime,
  morning: styles.timeOfDayMorning,
  afternoon: styles.timeOfDayAfternoon,
  evening: styles.timeOfDayEvening,
};

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

  // Drag-to-reorder subtasks by their handle. subtasksRef mirrors the
  // latest `subtasks` array so the pointerup handler (added once at drag
  // start, so its closure is otherwise frozen at that point) can read the
  // final order instead of the stale one from when the drag began.
  const subtasksRef = useRef(subtasks);
  useEffect(() => {
    subtasksRef.current = subtasks;
  }, [subtasks]);
  const subtaskRowRefs = useRef<Map<string, HTMLLIElement>>(new Map());
  const dragRef = useRef<{ id: string; grabOffsetY: number } | null>(null);
  const [dragVisual, setDragVisual] = useState<{
    id: string;
    top: number;
    left: number;
    width: number;
  } | null>(null);

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

  // Interacting with anything else on the page (changing the date,
  // dragging a subtask, ...) should clear the title's auto-selected text
  // instead of leaving it highlighted — collapsing the selection, not just
  // blurring, since a blurred input's selection otherwise still renders as
  // a (dimmer) highlight in most browsers.
  useCloseOnOutside(titleInputRef, true, () => {
    const input = titleInputRef.current;
    if (!input) return;
    input.setSelectionRange(input.value.length, input.value.length);
    input.blur();
  });

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

  // Drag a subtask by its handle to reorder it among its siblings. The
  // dragged row is pulled out of flow (position: fixed, following the
  // pointer) while the `subtasks` array itself is reordered live — the
  // other rows then just naturally lay out around wherever it currently
  // sits, without needing a separate placeholder element.
  function handleSubtaskDragStart(e: React.PointerEvent, subtask: Task) {
    e.preventDefault();
    const el = subtaskRowRefs.current.get(subtask.id);
    if (!el) return;
    const rect = el.getBoundingClientRect();
    dragRef.current = { id: subtask.id, grabOffsetY: e.clientY - rect.top };
    setDragVisual({ id: subtask.id, top: rect.top, left: rect.left, width: rect.width });
    window.addEventListener("pointermove", handleSubtaskDragMove);
    window.addEventListener("pointerup", handleSubtaskDragEnd);
  }

  function handleSubtaskDragMove(e: PointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    const newTop = e.clientY - drag.grabOffsetY;
    setDragVisual((v) => (v ? { ...v, top: newTop } : v));

    const el = subtaskRowRefs.current.get(drag.id);
    if (!el) return;
    const dragMid = newTop + el.getBoundingClientRect().height / 2;

    setSubtasks((prev) => {
      let arr = prev;
      let idx = arr.findIndex((s) => s.id === drag.id);
      if (idx === -1) return prev;

      let moved = true;
      while (moved) {
        moved = false;
        if (idx > 0) {
          const prevEl = subtaskRowRefs.current.get(arr[idx - 1].id);
          if (prevEl) {
            const r = prevEl.getBoundingClientRect();
            if (dragMid < r.top + r.height / 2) {
              arr = arr.slice();
              [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
              idx -= 1;
              moved = true;
              continue;
            }
          }
        }
        if (idx < arr.length - 1) {
          const nextEl = subtaskRowRefs.current.get(arr[idx + 1].id);
          if (nextEl) {
            const r = nextEl.getBoundingClientRect();
            if (dragMid > r.top + r.height / 2) {
              arr = arr.slice();
              [arr[idx + 1], arr[idx]] = [arr[idx], arr[idx + 1]];
              idx += 1;
              moved = true;
            }
          }
        }
      }
      // Written synchronously (not left to the subtasks-effect above) so
      // handleSubtaskDragEnd — which can fire in the same tick as the last
      // pointermove during a fast drag, before React commits and re-runs
      // effects — always reads the truly latest order, not a stale one.
      subtasksRef.current = arr;
      return arr;
    });
  }

  function handleSubtaskDragEnd() {
    window.removeEventListener("pointermove", handleSubtaskDragMove);
    window.removeEventListener("pointerup", handleSubtaskDragEnd);
    const drag = dragRef.current;
    dragRef.current = null;
    setDragVisual(null);
    if (!drag || !draftTaskId) return;

    const arr = subtasksRef.current;
    const idx = arr.findIndex((s) => s.id === drag.id);
    if (idx === -1) return;
    const prevOrder = arr[idx - 1]?.order ?? null;
    const nextOrder = arr[idx + 1]?.order ?? null;
    reorderTask(drag.id, { parentTaskId: draftTaskId, prevOrder, nextOrder }).catch(() => {
      setError("Couldn't save the new subtask order.");
    });
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

            <div className={`${styles.pickerAccessory} ${styles.timeOfDayAccessory}`}>
              <div className={styles.dropdownWrapper} ref={todRef}>
                <button
                  type="button"
                  className={`${styles.pickerBtn} ${styles.timeOfDayTrigger} ${
                    effectiveTimeOfDay
                      ? TIME_OF_DAY_COLOR_CLASS[effectiveTimeOfDay]
                      : todOpen
                        ? styles.pickerBtnActive
                        : ""
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
                        className={`${styles.dropdownOption} ${TIME_OF_DAY_COLOR_CLASS[opt.value]} ${
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
                <li
                  key={subtask.id}
                  ref={(el) => {
                    if (el) subtaskRowRefs.current.set(subtask.id, el);
                    else subtaskRowRefs.current.delete(subtask.id);
                  }}
                  className={`${styles.subtaskRow} ${
                    dragVisual?.id === subtask.id ? styles.subtaskRowDragging : ""
                  }`}
                  style={
                    dragVisual?.id === subtask.id
                      ? { position: "fixed", top: dragVisual.top, left: dragVisual.left, width: dragVisual.width }
                      : undefined
                  }
                >
                  {subtasks.length > 1 && (
                    <button
                      type="button"
                      className={styles.subtaskHandle}
                      aria-label={`Reorder ${subtask.title}`}
                      onPointerDown={(e) => handleSubtaskDragStart(e, subtask)}
                    >
                      <DragHandleIcon size={14} />
                    </button>
                  )}
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
