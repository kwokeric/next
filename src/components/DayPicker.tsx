"use client";

import { useState } from "react";
import {
  addDays,
  addMonths,
  dayOfMonth,
  formatDay,
  mondayOf,
  monthStart,
  sameMonth,
  type DayKey,
} from "@/lib/day";
import styles from "./DayPicker.module.css";

const WEEKDAY_INITIALS = ["M", "T", "W", "T", "F", "S", "S"];

// A Monday-first week strip that expands in place into a month grid. Both
// views share the same seven columns, so the strip lines up with the grid.
// Picking a day in the month view collapses back to that day's week.
export function DayPicker({
  selected,
  today,
  onSelect,
  hasTasks,
}: {
  selected: DayKey;
  today: DayKey;
  onSelect: (day: DayKey) => void;
  hasTasks: (day: DayKey) => boolean;
}) {
  const [open, setOpen] = useState(false);
  // The month shown while expanded, as its first day.
  const [viewMonth, setViewMonth] = useState(() => monthStart(selected));

  const weekStart = mondayOf(selected);
  const weekEnd = addDays(weekStart, 6);

  const days: { key: DayKey; outside: boolean }[] = [];
  if (open) {
    // Padded out to whole weeks; days from neighbouring months are kept as
    // hidden placeholders so the grid keeps its shape.
    const lastOfMonth = addDays(addMonths(viewMonth, 1), -1);
    const gridEnd = addDays(mondayOf(lastOfMonth), 6);
    for (let d = mondayOf(viewMonth); d <= gridEnd; d = addDays(d, 1)) {
      days.push({ key: d, outside: !sameMonth(d, viewMonth) });
    }
  } else {
    for (let i = 0; i < 7; i++) days.push({ key: addDays(weekStart, i), outside: false });
  }

  const periodLabel = open
    ? formatDay(viewMonth, { month: "long", year: "numeric" })
    : `${formatDay(weekStart, { month: "short", day: "numeric" })} – ${
        sameMonth(weekStart, weekEnd)
          ? dayOfMonth(weekEnd)
          : formatDay(weekEnd, { month: "short", day: "numeric" })
      }`;

  function shift(n: number) {
    if (open) {
      setViewMonth((m) => addMonths(m, n));
    } else {
      onSelect(addDays(selected, 7 * n));
    }
  }

  function toggle() {
    setViewMonth(monthStart(selected));
    setOpen((v) => !v);
  }

  function pick(day: DayKey) {
    onSelect(day);
    setOpen(false);
  }

  return (
    <section
      className={`${styles.card} ${open ? styles.cardOpen : ""}`}
      aria-label="Choose a day"
    >
      <div className={styles.toolbar}>
        <h2 className={styles.period} aria-live="polite">
          {periodLabel}
        </h2>
        <button
          type="button"
          className={styles.arrow}
          onClick={() => shift(-1)}
          aria-label={open ? "Previous month" : "Previous week"}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
        <button
          type="button"
          className={styles.arrow}
          onClick={() => shift(1)}
          aria-label={open ? "Next month" : "Next week"}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
        <button
          type="button"
          className={styles.toggle}
          onClick={toggle}
          aria-expanded={open}
          aria-label={open ? "Collapse to week" : "Expand to month"}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3" y="5" width="18" height="16" rx="3" />
            <path d="M3 10h18M8 3v4M16 3v4" />
          </svg>
          {open ? "Week" : "Month"}
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            aria-hidden="true"
            className={open ? styles.chevronUp : undefined}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>

      {open && (
        <div className={styles.weekdays} aria-hidden="true">
          {WEEKDAY_INITIALS.map((w, i) => (
            <span key={i}>{w}</span>
          ))}
        </div>
      )}

      <div className={styles.grid}>
        {days.map(({ key, outside }) => {
          const isSelected = key === selected;
          const isToday = key === today;
          const className = [
            styles.day,
            open ? styles.dayCompact : "",
            isSelected ? styles.daySelected : "",
            isToday ? styles.dayToday : "",
            key < today ? styles.dayPast : "",
            outside ? styles.dayOutside : "",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <button
              key={key}
              type="button"
              className={className}
              onClick={() => pick(key)}
              aria-pressed={isSelected}
              aria-label={`${formatDay(key, { weekday: "long", month: "short", day: "numeric" })}${
                isToday ? ", today" : ""
              }`}
              tabIndex={outside ? -1 : undefined}
            >
              {!open && (
                <span className={styles.dow}>{formatDay(key, { weekday: "short" })}</span>
              )}
              <span className={styles.date}>{dayOfMonth(key)}</span>
              <span
                className={`${styles.dot} ${!outside && hasTasks(key) ? styles.dotOn : ""}`}
                aria-hidden="true"
              />
            </button>
          );
        })}
      </div>
    </section>
  );
}
