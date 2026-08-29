import { useEffect, useId, useState } from "react";
import styles from "./ProgressRing.module.css";

const DEFAULT_SIZE = 32;

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
  const gradientId = useId();
  const strokeWidth = Math.max(2, Math.round(size / 12));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const clamped = Math.min(1, Math.max(0, progress));
  const percent = Math.round(clamped * 100);
  const offset = circumference * (1 - clamped);
  const isComplete = clamped >= 1;
  const checkSize = size * 0.75;
  // Nothing to show progress-wise yet, but it's the one to start — the
  // ring's track and a left-arrow inside it share one green band that
  // wipes across both and parks off-screen, like a now-playing pulse.
  const showNextPlay = isNextTask && clamped <= 0;

  // Ring and arrow share this 0-`size` viewBox (matching the icon's
  // rendered pixel size 1:1, no extra scaling), so a "24px-wide green
  // band" can be expressed exactly and both elements stay in sync.
  const greenBandPx = 24;
  const greenHalfPercent = Math.min(45, (greenBandPx / 2 / size) * 100);
  const arrowSpan = size * 0.55;
  const arrowInset = (size - arrowSpan) / 2;
  const arrowMidY = size / 2;
  const arrowShaftStartX = arrowInset + arrowSpan * 0.85;
  const arrowShaftEndX = arrowInset + arrowSpan * 0.15;
  const arrowHeadX = arrowInset + arrowSpan * 0.4;
  const arrowHeadTopY = arrowInset + arrowSpan * 0.2;
  const arrowHeadBotY = arrowInset + arrowSpan * 0.8;
  const arrowPath = `M${arrowShaftStartX} ${arrowMidY} H${arrowShaftEndX} M${arrowHeadX} ${arrowHeadTopY} L${arrowShaftEndX} ${arrowMidY} L${arrowHeadX} ${arrowHeadBotY}`;

  const [reducedMotion, setReducedMotion] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

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
      ) : showNextPlay ? (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
          {reducedMotion ? (
            <>
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                strokeWidth={strokeWidth}
                fill="none"
                stroke="var(--green-300)"
              />
              <path
                d={arrowPath}
                fill="none"
                stroke="var(--green-300)"
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </>
          ) : (
            <>
              <defs>
                <linearGradient
                  id={gradientId}
                  x1={0}
                  y1={size / 2}
                  x2={size}
                  y2={size / 2}
                  gradientUnits="userSpaceOnUse"
                >
                  <stop offset="0%" style={{ stopColor: "var(--color-border-subtle)" }} />
                  <stop
                    offset={`${50 - greenHalfPercent}%`}
                    style={{ stopColor: "var(--color-border-subtle)" }}
                  />
                  <stop offset="50%" style={{ stopColor: "var(--green-300)" }} />
                  <stop
                    offset={`${50 + greenHalfPercent}%`}
                    style={{ stopColor: "var(--color-border-subtle)" }}
                  />
                  <stop offset="100%" style={{ stopColor: "var(--color-border-subtle)" }} />
                  <animateTransform
                    attributeName="gradientTransform"
                    type="translate"
                    values={`-${size} 0; -${size} 0; ${size} 0; ${size} 0`}
                    keyTimes="0; 0.35; 0.65; 1"
                    dur="3.6s"
                    repeatCount="indefinite"
                  />
                </linearGradient>
              </defs>
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                strokeWidth={strokeWidth}
                fill="none"
                stroke={`url(#${gradientId})`}
              />
              <path
                d={arrowPath}
                fill="none"
                stroke={`url(#${gradientId})`}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </>
          )}
        </svg>
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
          {showLabel && (
            <span
              className={styles.label}
              style={{ fontSize: Math.max(8, size * 0.3) }}
              aria-hidden="true"
            >
              {percent}%
            </span>
          )}
        </>
      )}
    </div>
  );
}
