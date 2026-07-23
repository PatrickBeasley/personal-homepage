import type { GsdList, GsdTask } from "@/lib/gsd/client";

/**
 * Ordering rules for the Tasks card, kept out of the view so they can be
 * tested without a DOM — the same shape as lib/dashboard/link-order.ts.
 *
 * Every comparator falls through to an id tie-break: without it, equal keys
 * sort unstably and rows appear to jump between renders.
 */

export type TaskSortKey = "manual" | "due" | "alpha" | "priority";

/** A contiguous run of tasks rendered under one list heading. */
export interface TaskGroup {
  key: string;
  label: string;
  color: string;
  tasks: GsdTask[];
}

/** Shown for a task whose list is not in the lists payload (e.g. archived). */
export const UNKNOWN_LIST_LABEL = "Other";

/** GSD's list display order, as rank lookups for the manual sort. */
export function buildListRank(lists: GsdList[]): Map<string, number> {
  return new Map(lists.map((list, index) => [list.id, index]));
}

/** A missing list ranks after every known one instead of colliding with rank 0. */
function rankOf(listId: string, listRank: Map<string, number>): number {
  return listRank.get(listId) ?? Number.MAX_SAFE_INTEGER;
}

function compareManual(a: GsdTask, b: GsdTask, listRank: Map<string, number>): number {
  return (
    rankOf(a.listId, listRank) - rankOf(b.listId, listRank) ||
    a.position - b.position ||
    a.id.localeCompare(b.id)
  );
}

export function compareTasks(
  a: GsdTask,
  b: GsdTask,
  sort: TaskSortKey,
  listRank: Map<string, number>
): number {
  if (sort === "alpha") {
    return a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
  }

  if (sort === "due") {
    // Date-only ISO strings compare correctly as strings; undated sorts last.
    if (a.dueDate === null || b.dueDate === null) {
      if (a.dueDate === b.dueDate) {
        return compareManual(a, b, listRank);
      }

      return a.dueDate === null ? 1 : -1;
    }

    return a.dueDate.localeCompare(b.dueDate) || compareManual(a, b, listRank);
  }

  if (sort === "priority") {
    // Per the spec only "high" is surfaced in the UI, so only high is ranked;
    // everything else keeps manual order.
    const highDelta = Number(b.priority === "high") - Number(a.priority === "high");

    return highDelta || compareManual(a, b, listRank);
  }

  return compareManual(a, b, listRank);
}

/**
 * Splits done tasks off for the bottom band. Order within each half is
 * preserved, so the caller sorts first and partitions second.
 */
export function partitionDone(tasks: GsdTask[]): { open: GsdTask[]; done: GsdTask[] } {
  const open: GsdTask[] = [];
  const done: GsdTask[] = [];

  for (const task of tasks) {
    (task.done ? done : open).push(task);
  }

  return { open, done };
}

/**
 * Sections tasks by list in GSD's display order — that order is user-chosen
 * in GSD, unlike Links' alphabetical grouping (categories have no display
 * order). Task order inside each section is whatever the caller sorted.
 *
 * A task whose list is missing from the payload lands in a trailing "Other"
 * group rather than being dropped — losing a row would be worse than an
 * oddly-labelled group.
 */
export function groupByListId(tasks: GsdTask[], lists: GsdList[]): TaskGroup[] {
  const byList = new Map<string, GsdTask[]>();

  for (const task of tasks) {
    const bucket = byList.get(task.listId);

    if (bucket) {
      bucket.push(task);
    } else {
      byList.set(task.listId, [task]);
    }
  }

  const groups: TaskGroup[] = [];

  for (const list of lists) {
    const bucket = byList.get(list.id);

    if (bucket) {
      groups.push({ key: list.id, label: list.name, color: list.color, tasks: bucket });
      byList.delete(list.id);
    }
  }

  // Whatever remains references lists GSD did not return.
  const orphans = [...byList.values()].flat();

  if (orphans.length > 0) {
    groups.push({ key: "unknown", label: UNKNOWN_LIST_LABEL, color: "#79808e", tasks: orphans });
  }

  return groups;
}
