"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import TasksBriefSkeleton from "@/components/dashboard/overview/tasks-brief-skeleton";
import { capRows, formatShortDate, localTodayIso, selectDueTasks } from "@/lib/dashboard/overview";
import type { GsdTask } from "@/lib/gsd/client";

const MAX_ROWS = 10;

export default function TasksBriefView({
  tasks,
  listNames,
}: {
  tasks: GsdTask[];
  listNames: Record<string, string>;
}) {
  /*
   * "Today" is client-local information the server render cannot know: the
   * server runs in UTC, so bucketing during render would disagree with the
   * client for part of every day — a hydration mismatch. Same sanctioned
   * clock-read-in-effect as tasks-view. While null, this renders the same
   * skeleton as the Suspense fallback, so the swap is invisible.
   */
  const [todayIso, setTodayIso] = useState<string | null>(null);

  useEffect(() => {
    // The identical hydration-safe read runs in tasks-view.tsx and
    // links-view.tsx; it only escapes this rule there because those
    // components are too large for the compiler's analysis to fully model.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTodayIso(localTodayIso());
  }, []);

  if (todayIso === null) {
    return <TasksBriefSkeleton />;
  }

  const due = selectDueTasks(tasks, todayIso);

  if (due.length === 0) {
    return (
      <div className="p-5">
        <p className="font-heading text-[15px] font-semibold">Nothing due — all clear</p>
        <p className="mt-1 text-sm text-text-2">
          No overdue or due-today tasks.{" "}
          <Link href="/dashboard/tasks" className="font-semibold text-accent">
            Open Tasks
          </Link>{" "}
          to see everything else.
        </p>
      </div>
    );
  }

  const { shown, extra } = capRows(due, MAX_ROWS);

  return (
    <ul className="m-0 list-none p-0">
      {shown.map((task) => {
        // selectDueTasks only returns tasks with a dueDate ≤ today.
        const overdue = task.dueDate !== null && task.dueDate < todayIso;

        return (
          <li
            key={task.id}
            className="flex items-center gap-3 border-b border-border px-5 py-[13px] last:border-b-0"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-text">{task.title}</span>
              <span className="block truncate font-mono text-[11px] text-muted">
                {listNames[task.listId] ?? "—"}
              </span>
            </span>
            {overdue ? (
              <span className="flex-none rounded-full bg-red-500/10 px-[10px] py-[3px] font-mono text-[11px] font-medium text-red-500">
                Overdue · {task.dueDate === null ? "" : formatShortDate(task.dueDate)}
              </span>
            ) : (
              <span className="flex-none rounded-full bg-accent-soft px-[10px] py-[3px] font-mono text-[11px] font-medium text-accent">
                Today
              </span>
            )}
          </li>
        );
      })}
      {extra > 0 ? (
        <li>
          <Link
            href="/dashboard/tasks"
            className="block px-5 py-[13px] text-[13px] font-semibold text-accent"
          >
            +{extra} more in Tasks
          </Link>
        </li>
      ) : null}
    </ul>
  );
}
