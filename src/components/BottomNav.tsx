"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ListIcon } from "./icons/ListIcon";
import { PlusIcon } from "./icons/PlusIcon";
import { TargetIcon } from "./icons/TargetIcon";
import styles from "./BottomNav.module.css";

const NAV_ITEMS = [
  { href: "/", label: "Tasks", Icon: ListIcon },
  { href: "/tasks/new", label: "Create", Icon: PlusIcon },
  { href: "/focus", label: "Focus", Icon: TargetIcon },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // The "Add subtask" flow (opened from Focus mode with ?parent=) and a
  // task's own edit page are both drill-down subpages of whatever they
  // were opened from, not peer destinations — each has its own back caret
  // instead.
  if (pathname === "/tasks/new" && searchParams.has("parent")) return null;
  if (/^\/tasks\/[^/]+\/edit$/.test(pathname)) return null;

  return (
    <nav className={styles.wrap} aria-label="Primary">
      <div className={styles.pill}>
        {NAV_ITEMS.map(({ href, label, Icon }) => {
          const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={isActive ? `${styles.item} ${styles.itemActive}` : styles.item}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon size={18} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
