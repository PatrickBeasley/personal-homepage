import type { GsdTask } from "@/lib/gsd/client";

/** Local YYYY-MM-DD for "today", in the viewer's timezone. */
export function localTodayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${now.getFullYear()}-${month}-${day}`;
}

/** "Jul 21" from a YYYY-MM-DD string. */
export function formatShortDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);

  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/**
 * Open tasks due on or before `todayIso`: overdue first (oldest due date
 * first), then due-today in GSD's own order. GSD due dates are date-only ISO
 * strings, so plain string comparison is a correct date comparison.
 */
export function selectDueTasks(tasks: GsdTask[], todayIso: string): GsdTask[] {
  const due = tasks.filter(
    (t): t is GsdTask & { dueDate: string } =>
      !t.done && t.dueDate !== null && t.dueDate <= todayIso
  );

  const overdue = due
    .filter((t) => t.dueDate < todayIso)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const dueToday = due.filter((t) => t.dueDate === todayIso);

  return [...overdue, ...dueToday];
}

/** First `max` rows plus how many were cut — feeds the "+N more" link. */
export function capRows<T>(rows: T[], max: number): { shown: T[]; extra: number } {
  if (rows.length <= max) {
    return { shown: rows, extra: 0 };
  }

  return { shown: rows.slice(0, max), extra: rows.length - max };
}

/**
 * Plain-text preview of a note's sanitized HTML body. Tags become spaces so
 * adjacent blocks don't fuse into one word; only the entities the sanitizer
 * emits need decoding.
 */
export function noteSnippet(html: string, maxLength = 120): string {
  const text = html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/** "just now", "5m ago", "3h ago", "yesterday", "4d ago", then "Jul 12". */
export function relativeTime(iso: string, nowMs: number): string {
  const diff = nowMs - Date.parse(iso);

  if (diff < MINUTE_MS) {
    return "just now";
  }
  if (diff < HOUR_MS) {
    return `${Math.floor(diff / MINUTE_MS)}m ago`;
  }
  if (diff < DAY_MS) {
    return `${Math.floor(diff / HOUR_MS)}h ago`;
  }
  if (diff < 2 * DAY_MS) {
    return "yesterday";
  }
  if (diff < 7 * DAY_MS) {
    return `${Math.floor(diff / DAY_MS)}d ago`;
  }

  return formatShortDate(iso.slice(0, 10));
}
