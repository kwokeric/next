"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Task, TimeOfDay, RepeatFrequency } from "@prisma/client";
import { createTask, updateTask, deleteTask, breakdownTask, reorderTask } from "@/lib/api-client";
import { autogrow } from "@/lib/autogrow";
import { SparkleIcon } from "./icons/SparkleIcon";
import { BackIcon } from "./icons/BackIcon";
import { DragHandleIcon } from "./icons/DragHandleIcon";
import { RepeatIcon } from "./icons/RepeatIcon";
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
  { value: "anytime", icon: <ClockIcon size={18} />, label: "Anytime" },
  { value: "morning", icon: <SunriseIcon size={18} />, label: "Morning" },
  { value: "afternoon", icon: <SunIcon size={18} />, label: "Afternoon" },
  { value: "evening", icon: <MoonIcon size={18} />, label: "Evening" },
];

const REPEAT_OPTIONS: { value: RepeatFrequency; label: string }[] = [
  { value: "DAILY", label: "Daily" },
  { value: "WEEKLY", label: "Weekly" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "WEEKDAYS", label: "Weekdays" },
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

function formatShortDate(value: string): string {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Closes on an outside tap or Escape.
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

  // A brand-new top-level task defaults to today; editing keeps whatever the
  // task already has (including no date), and subtasks stay undated.
  const defaultScheduledFor =
    initialScheduledFor ?? (!editingTask && !parentTask ? localDateString(0) : null);

  const initialDateChoice: DateChoice = !defaultScheduledFor
    ? ""
    : defaultScheduledFor === localDateString(0)
      ? "today"
      : defaultScheduledFor === localDateString(1)
        ? "tomorrow"
        : "custom";

  const [title, setTitle] = useState(editingTask?.title ?? "");
  const [dateChoice, setDateChoice] = useState<DateChoice>(initialDateChoice);
  // Always seeded from the resolved date, not just for "custom" — so the
  // picker visibly shows today's/tomorrow's actual date when one of those
  // shortcuts is what's selected, instead of sitting blank.
  const [customDate, setCustomDate] = useState(defaultScheduledFor ?? "");
  const [timeChoice, setTimeChoice] = useState<TimeChoice>(
    initialExactTime ? "exact" : initialTimeOfDay ? (initialTimeOfDay.toLowerCase() as TimeChoice) : ""
  );
  const [exactTime, setExactTime] = useState(initialExactTime ?? "");
  // "" means "doesn't repeat" — kept as a separate on/off concept from the
  // frequency itself so toggling repeat off doesn't lose which frequency
  // was picked if the user immediately turns it back on.
  const [repeatFrequency, setRepeatFrequency] = useState<RepeatFrequency | "">(
    editingTask?.repeatFrequency ?? ""
  );

  const [subtasks, setSubtasks] = useState<Task[]>(initialSubtasks);
  const [draftTaskId, setDraftTaskId] = useState<string | null>(editingTask?.id ?? null);
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);
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

  // Which time-of-day tile is selected: an explicit bucket pick, or (if an
  // exact time is set instead) the bucket that time falls into.
  const effectiveTimeOfDay: TimeOfDayChoice | "" =
    timeChoice === "exact"
      ? exactTime
        ? timeOfDayFromExactTime(exactTime)
        : ""
      : timeChoice;

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

  function computeRepeatFrequency(): RepeatFrequency | null {
    return repeatFrequency || null;
  }

  function toggleRepeat() {
    // Turning it on defaults to the first preset rather than leaving no
    // chip selected — turning it back off clears the frequency entirely.
    setRepeatFrequency((prev) => (prev ? "" : "DAILY"));
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

  function handleTimeOfDaySelect(value: TimeOfDayChoice) {
    setExactTime("");
    // Tapping the already-selected tile clears it.
    setTimeChoice(effectiveTimeOfDay === value ? "" : value);
  }

  function openDatePicker() {
    const input = dateInputRef.current;
    if (!input) return;
    try {
      input.showPicker();
    } catch {
      // showPicker() is unsupported in some older browsers; focusing the
      // input still lets the user type a date.
      input.focus();
    }
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
      repeatFrequency: computeRepeatFrequency(),
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
          repeatFrequency: computeRepeatFrequency(),
        });
      } else {
        await createTask(projectId, {
          title: title.trim(),
          parentTaskId: parentTask?.id ?? null,
          timeOfDay: computeTimeOfDay(),
          scheduledFor: computeScheduledFor(),
          scheduledTime: computeScheduledTime(),
          repeatFrequency: computeRepeatFrequency(),
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
      <header className={styles.header}>
        {showBackCaret && (
          <button
            type="button"
            className={styles.backButton}
            onClick={handleCancel}
            aria-label="Back"
          >
            <BackIcon size={20} />
          </button>
        )}
        <p className="page-eyebrow">{editingTask ? "Edit" : parentTask ? "Subtask" : "Create"}</p>
        <h1 className="page-title">
          {editingTask ? "Edit task" : parentTask ? "Add subtask" : "New task"}
        </h1>
      </header>

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

        <div className={`${styles.card} ${styles.titleCard}`}>
          <label htmlFor="task-title" className={styles.visuallyHidden}>
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

        <div className={styles.card}>
          <div className={styles.cardRow}>
            <CalendarIcon />
            <span className={styles.cardRowLabel}>Date</span>
            <div className={styles.segmented}>
              <button
                type="button"
                className={`${styles.segment} ${dateChoice === "today" ? styles.segmentActive : ""}`}
                aria-pressed={dateChoice === "today"}
                onClick={() => toggleDateChoice("today")}
              >
                Today
              </button>
              <button
                type="button"
                className={`${styles.segment} ${dateChoice === "tomorrow" ? styles.segmentActive : ""}`}
                aria-pressed={dateChoice === "tomorrow"}
                onClick={() => toggleDateChoice("tomorrow")}
              >
                Tomorrow
              </button>
              <button
                type="button"
                className={`${styles.segment} ${dateChoice === "custom" ? styles.segmentActive : ""}`}
                aria-pressed={dateChoice === "custom"}
                onClick={openDatePicker}
              >
                {dateChoice === "custom" && customDate ? formatShortDate(customDate) : "Pick…"}
              </button>
              <input
                ref={dateInputRef}
                type="date"
                className={styles.hiddenPicker}
                value={customDate}
                onChange={(e) => handleCustomDateChange(e.target.value)}
                aria-label="Pick a date"
                tabIndex={-1}
              />
            </div>
          </div>

          <div className={styles.cardRow}>
            <RepeatIcon size={18} />
            <span className={styles.cardRowLabel} id="repeat-label">
              Repeat
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={Boolean(repeatFrequency)}
              aria-labelledby="repeat-label"
              className={`${styles.switch} ${repeatFrequency ? styles.switchOn : ""}`}
              onClick={toggleRepeat}
            >
              <span className={styles.switchThumb} />
            </button>
          </div>
          {repeatFrequency && (
            <div className={styles.repeatOptions}>
              {REPEAT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`${styles.segment} ${
                    repeatFrequency === opt.value ? styles.segmentActive : ""
                  }`}
                  aria-pressed={repeatFrequency === opt.value}
                  onClick={() => setRepeatFrequency(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}

          <div className={styles.timeBlock}>
            <div className={styles.timeHead}>
              <span className={styles.cardRowLabel}>Time of day</span>
              <input
                type="time"
                step={300}
                className={`${styles.timeInput} ${timeChoice === "exact" ? styles.timeInputFilled : ""}`}
                value={exactTime}
                onChange={(e) => handleExactTimeChange(e.target.value)}
                aria-label="Pick an exact time"
              />
            </div>
            <div className={styles.todGrid}>
              {TIME_OF_DAY_OPTIONS.map((opt) => (
                <button
                  type="button"
                  key={opt.value}
                  data-tod={opt.value}
                  aria-pressed={effectiveTimeOfDay === opt.value}
                  className={`${styles.todTile} ${
                    effectiveTimeOfDay === opt.value ? styles.todTileSelected : ""
                  }`}
                  onClick={() => handleTimeOfDaySelect(opt.value)}
                >
                  {opt.icon}
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className={`${styles.card} ${styles.subtaskCard}`}>
          <div className={styles.subtaskHead}>
            <h2 className={styles.subtaskTitle}>Subtasks</h2>
            <span className={styles.subtaskCount}>{subtasks.length}</span>
          </div>
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
              className={styles.subtaskBtn}
              disabled={!hasTitle}
              onClick={() => (addingSubtask ? handleAddSubtask() : setAddingSubtask(true))}
            >
              <PlusIcon size={14} />
              Add subtask
            </button>
            <button
              type="button"
              className={`${styles.subtaskBtn} ${styles.subtaskGenerateBtn}`}
              disabled={!hasTitle || isGenerating}
              onClick={handleGenerate}
            >
              {isGenerating ? (
                "Generating…"
              ) : (
                <>
                  <SparkleIcon size={14} /> Generate
                </>
              )}
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

function CalendarIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M4 10h16M9 3v4M15 3v4" />
    </svg>
  );
}
