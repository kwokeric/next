import styles from "./ProgressRing.module.css";

const DEFAULT_SIZE = 40;

// `progress` is a 0-1 fraction (see getTaskProgress / getProjectProgress in
// lib/task-tree). `size` lets callers shrink the ring for compact contexts
// (e.g. inline in a task row) — stroke width and label size scale with it.
export function ProgressRing({
  handleToggleStatus,
  isNextTask,
  progress,
  size = DEFAULT_SIZE,
  showLabel = true,
}: {
  handleToggleStatus: () => void;
  isNextTask: boolean;
  progress: number;
  size?: number;
  showLabel?: boolean;
}) {
  const strokeWidth = Math.max(2, Math.round(size / 8));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const clamped = Math.min(1, Math.max(0, progress));
  const percent = Math.round(clamped * 100);
  const offset = circumference * (1 - clamped);
  const isComplete = clamped >= 1;
  const checkSize = size * 0.75;
  // The ring is otherwise empty at 0% progress — this dot is the only cue
  // that a not-yet-started task is the next one to work on.
  const showDot = isNextTask && clamped <= 0;
  const dotSize = size * 0.375;

  return (
    <div
      className={`${styles.wrapper} ${isNextTask ? styles.isNextTask : ''}`}
      onClick={() => handleToggleStatus()}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${percent}% complete`}
    >
      {isComplete ? (
        <div className={styles.filled} aria-hidden="true">
          <svg width={checkSize} height={checkSize} viewBox="0 0 16 16">
            <path
              d="M4 8.5 L7 11.5 L12 5"
              stroke="#ffffff"
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      ) : (
        <>
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={styles.svg}>
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              strokeWidth={strokeWidth}
              fill="none"
              className={styles.track}
            />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              strokeWidth={strokeWidth}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              className={styles.progress}
            />
          </svg>
          {showDot ? (
            <span
              className={styles.dot}
              style={{ width: dotSize, height: dotSize }}
              aria-hidden="true"
            />
          ) : (
            showLabel && (
              <span
                className={styles.label}
                style={{ fontSize: Math.max(8, size * 0.3) }}
                aria-hidden="true"
              >
                {percent}%
              </span>
            )
          )}
        </>
      )}
    </div>
  );
}
