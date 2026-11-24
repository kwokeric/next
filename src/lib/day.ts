import type { RepeatFrequency } from "@prisma/client";
import { getTaskProgress, type TaskNode } from "./task-tree";

// A calendar day as a "YYYY-MM-DD" string. Every day-picker calculation
// works on these keys (via UTC Date math) rather than local Date objects,
// so DST shifts and the server's own timezone can never move a day.
export type DayKey = string;

const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

export const TIMEZONE_COOKIE = "tz";

export function isValidDayKey(value: unknown): value is DayKey {
  if (typeof value !== "string" || !DAY_KEY_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(value);
}

export function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

// Today in the given IANA zone (or the runtime's own zone when omitted —
// i.e. the browser's, when called client-side).
export function todayKey(timeZone?: string): DayKey {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function toUTC(key: DayKey): Date {
  return new Date(`${key}T00:00:00Z`);
}

function fromUTC(d: Date): DayKey {
  return d.toISOString().slice(0, 10);
}

// scheduledFor is a @db.Date, read back as UTC midnight. It arrives as a
// Date from fresh queries but as an ISO string from unstable_cache (which
// JSON-serializes) — accept both.
export function taskDayKey(value: Date | string | null | undefined): DayKey | null {
  if (!value) return null;
  return typeof value === "string" ? value.slice(0, 10) : fromUTC(value);
}

export function addDays(key: DayKey, n: number): DayKey {
  return fromUTC(new Date(toUTC(key).getTime() + n * DAY_MS));
}

function daysBetween(from: DayKey, to: DayKey): number {
  return Math.round((toUTC(to).getTime() - toUTC(from).getTime()) / DAY_MS);
}

// 0 = Sunday … 6 = Saturday.
export function weekday(key: DayKey): number {
  return toUTC(key).getUTCDay();
}

export function mondayOf(key: DayKey): DayKey {
  return addDays(key, -((weekday(key) + 6) % 7));
}

export function monthStart(key: DayKey): DayKey {
  return `${key.slice(0, 7)}-01`;
}

export function addMonths(key: DayKey, n: number): DayKey {
  const d = toUTC(monthStart(key));
  d.setUTCMonth(d.getUTCMonth() + n);
  return fromUTC(d);
}

export function dayOfMonth(key: DayKey): number {
  return Number(key.slice(8, 10));
}

export function sameMonth(a: DayKey, b: DayKey): boolean {
  return a.slice(0, 7) === b.slice(0, 7);
}

export function formatDay(key: DayKey, options: Intl.DateTimeFormatOptions): string {
  return toUTC(key).toLocaleDateString("en-US", { ...options, timeZone: "UTC" });
}

// Whether a repeating task (whose next occurrence is `start`) also lands on
// `day`. Mirrors nextOccurrence in recur.ts.
function repeatsOn(frequency: RepeatFrequency, start: DayKey, day: DayKey): boolean {
  if (day < start) return false;
  switch (frequency) {
    case "DAILY":
      return true;
    case "WEEKDAYS": {
      const wd = weekday(day);
      return wd !== 0 && wd !== 6;
    }
    case "WEEKLY":
      return daysBetween(start, day) % 7 === 0;
    case "MONTHLY":
      return dayOfMonth(day) === dayOfMonth(start);
  }
}

export type DayTasks = {
  tasks: TaskNode[];
  // Root task id → "From Sat" for unfinished tasks carried over from an
  // earlier day onto today.
  carriedFrom: Map<string, string>;
};

// Which root tasks belong on a given day:
// - Today: unscheduled tasks, tasks scheduled today, and anything from an
//   earlier day that isn't finished yet (it "rolls over" — see
//   findNextTask in task-tree.ts, which treats overdue tasks the same way).
// - Future days: tasks scheduled that day, plus repeating tasks that recur
//   on it.
// - Past days: what was finished that day. Unfinished ones are on today.
export function tasksForDay(roots: TaskNode[], day: DayKey, today: DayKey): DayTasks {
  const tasks: TaskNode[] = [];
  const carriedFrom = new Map<string, string>();

  for (const task of roots) {
    const scheduled = taskDayKey(task.scheduledFor);
    const done = getTaskProgress(task) >= 1;

    if (day === today) {
      if (!scheduled || scheduled === today) {
        tasks.push(task);
      } else if (scheduled < today && !done) {
        tasks.push(task);
        carriedFrom.set(task.id, `From ${carriedLabel(scheduled, today)}`);
      }
    } else if (day > today) {
      if (scheduled === day) {
        tasks.push(task);
      } else if (task.repeatFrequency && repeatsOn(task.repeatFrequency, scheduled ?? today, day)) {
        tasks.push(task);
      }
    } else if (scheduled === day && done) {
      tasks.push(task);
    }
  }

  return { tasks, carriedFrom };
}

function carriedLabel(from: DayKey, today: DayKey): string {
  const ago = daysBetween(from, today);
  if (ago === 1) return "yesterday";
  if (ago < 7) return formatDay(from, { weekday: "short" });
  return formatDay(from, { month: "short", day: "numeric" });
}
