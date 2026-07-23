import { describe, expect, it } from "vitest";

import {
  buildListRank,
  compareTasks,
  groupByListId,
  partitionDone,
} from "@/lib/dashboard/task-order";
import type { GsdList, GsdTask } from "@/lib/gsd/client";

const LISTS: GsdList[] = [
  { id: "list-a", name: "Inbox", color: "#3d6bff", remaining: 2, taskTemplateId: null },
  { id: "list-b", name: "Errands", color: "#f59f00", remaining: 1, taskTemplateId: null },
];

function task(overrides: Partial<GsdTask> & { id: string }): GsdTask {
  return {
    title: "t",
    done: false,
    status: "todo",
    priority: "none",
    dueDate: null,
    dueTime: null,
    repeat: "none",
    notes: "",
    assigneeId: null,
    linkedListId: null,
    subtasks: [],
    attachments: [],
    position: 0,
    tags: [],
    createdAt: "2026-07-23T00:00:00Z",
    listId: "list-a",
    ...overrides,
  };
}

describe("buildListRank", () => {
  it("ranks lists by their display order", () => {
    const rank = buildListRank(LISTS);

    expect(rank.get("list-a")).toBe(0);
    expect(rank.get("list-b")).toBe(1);
  });
});

describe("compareTasks", () => {
  const rank = buildListRank(LISTS);

  it("manual: list order first, then position, then id tie-break", () => {
    const a = task({ id: "a", listId: "list-b", position: 0 });
    const b = task({ id: "b", listId: "list-a", position: 5 });
    const c = task({ id: "c", listId: "list-a", position: 5 });

    expect(compareTasks(a, b, "manual", rank)).toBeGreaterThan(0);
    expect(compareTasks(b, c, "manual", rank)).toBeLessThan(0);
  });

  it("manual: a list missing from the rank map sorts last, not first", () => {
    const known = task({ id: "a", listId: "list-a" });
    const unknown = task({ id: "b", listId: "list-gone" });

    expect(compareTasks(known, unknown, "manual", rank)).toBeLessThan(0);
  });

  it("due: soonest first, undated last, manual as tie-break", () => {
    const early = task({ id: "a", dueDate: "2026-07-20" });
    const late = task({ id: "b", dueDate: "2026-08-01" });
    const none = task({ id: "c", dueDate: null });

    expect(compareTasks(early, late, "due", rank)).toBeLessThan(0);
    expect(compareTasks(none, early, "due", rank)).toBeGreaterThan(0);
    expect(compareTasks(early, early, "due", rank)).toBe(0);
  });

  it("alpha: title, id tie-break", () => {
    const a = task({ id: "a", title: "Apples" });
    const b = task({ id: "b", title: "Bananas" });

    expect(compareTasks(a, b, "alpha", rank)).toBeLessThan(0);
  });

  it("priority: high first, everything else falls back to manual", () => {
    const high = task({ id: "a", priority: "high", listId: "list-b", position: 9 });
    const med = task({ id: "b", priority: "med", listId: "list-a", position: 0 });
    const low = task({ id: "c", priority: "low", listId: "list-a", position: 1 });

    expect(compareTasks(high, med, "priority", rank)).toBeLessThan(0);
    // med vs low: neither is high, so manual order (position) decides.
    expect(compareTasks(med, low, "priority", rank)).toBeLessThan(0);
  });
});

describe("partitionDone", () => {
  it("splits done off while preserving order within each half", () => {
    const tasks = [
      task({ id: "a", done: true }),
      task({ id: "b" }),
      task({ id: "c", done: true }),
      task({ id: "d" }),
    ];

    const { open, done } = partitionDone(tasks);

    expect(open.map((t) => t.id)).toEqual(["b", "d"]);
    expect(done.map((t) => t.id)).toEqual(["a", "c"]);
  });
});

describe("groupByListId", () => {
  it("sections tasks by list in GSD display order, keeping task order", () => {
    const tasks = [
      task({ id: "a", listId: "list-b" }),
      task({ id: "b", listId: "list-a" }),
      task({ id: "c", listId: "list-a" }),
    ];

    const groups = groupByListId(tasks, LISTS);

    expect(groups.map((g) => g.label)).toEqual(["Inbox", "Errands"]);
    expect(groups[0].tasks.map((t) => t.id)).toEqual(["b", "c"]);
    expect(groups[0].color).toBe("#3d6bff");
  });

  it("omits lists with no matching tasks", () => {
    const groups = groupByListId([task({ id: "a", listId: "list-a" })], LISTS);

    expect(groups.map((g) => g.key)).toEqual(["list-a"]);
  });

  it("keeps tasks whose list is unknown in a trailing group rather than dropping them", () => {
    const groups = groupByListId([task({ id: "a", listId: "list-gone" })], LISTS);

    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("Other");
    expect(groups[0].tasks.map((t) => t.id)).toEqual(["a"]);
  });
});
