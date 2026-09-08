import type { RepeatFrequency } from "@prisma/client";

// Advances a date to its next occurrence for the given frequency. Works in
// UTC (matching how scheduledFor round-trips as a @db.Date — see
// CreateTaskPage's computeScheduledFor/dateOnlyString in the edit route)
// so a month/day never shifts because of the server's local timezone.
export function nextOccurrence(from: Date, frequency: RepeatFrequency): Date {
  const next = new Date(from);

  switch (frequency) {
    case "DAILY":
      next.setUTCDate(next.getUTCDate() + 1);
      return next;
    case "WEEKLY":
      next.setUTCDate(next.getUTCDate() + 7);
      return next;
    case "MONTHLY":
      next.setUTCMonth(next.getUTCMonth() + 1);
      return next;
    case "WEEKDAYS": {
      do {
        next.setUTCDate(next.getUTCDate() + 1);
      } while (next.getUTCDay() === 0 || next.getUTCDay() === 6);
      return next;
    }
  }
}
