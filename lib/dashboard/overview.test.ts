import { describe, expect, it } from "vitest";

import {
  capRows,
  formatShortDate,
  localTodayIso,
  noteSnippet,
  relativeTime,
  selectDueTasks,
} from "@/lib/dashboard/overview";
import type { GsdTask } from "@/lib/gsd/client";

/** Minimal valid GsdTask; tests override only what they exercise. */
function task(overrides: Partial<GsdTask>): GsdTask {
  return {
    id: "t-default",
    title: "Task",
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
    createdAt: "2026-07-01T00:00:00Z",
    listId: "l1",
    ...overrides,
  };
}

const TODAY = "2026-07-24";

describe("selectDueTasks", () => {
  it("keeps only open tasks due on or before today", () => {
    const tasks = [
      task({ id: "done", done: true, dueDate: "2026-07-20" }),
      task({ id: "no-due", dueDate: null }),
      task({ id: "future", dueDate: "2026-07-25" }),
      task({ id: "today", dueDate: TODAY }),
      task({ id: "overdue", dueDate: "2026-07-22" }),
    ];

    expect(selectDueTasks(tasks, TODAY).map((t) => t.id)).toEqual(["overdue", "today"]);
  });

  it("orders overdue oldest-first, then due-today in input order", () => {
    const tasks = [
      task({ id: "today-1", dueDate: TODAY }),
      task({ id: "overdue-new", dueDate: "2026-07-23" }),
      task({ id: "today-2", dueDate: TODAY }),
      task({ id: "overdue-old", dueDate: "2026-07-10" }),
    ];

    expect(selectDueTasks(tasks, TODAY).map((t) => t.id)).toEqual([
      "overdue-old",
      "overdue-new",
      "today-1",
      "today-2",
    ]);
  });

  it("returns empty for no matches", () => {
    expect(selectDueTasks([task({ dueDate: "2026-08-01" })], TODAY)).toEqual([]);
  });
});

describe("capRows", () => {
  it("passes through at or under the cap", () => {
    expect(capRows([1, 2, 3], 3)).toEqual({ shown: [1, 2, 3], extra: 0 });
  });

  it("slices and counts the remainder over the cap", () => {
    expect(capRows([1, 2, 3, 4, 5], 3)).toEqual({ shown: [1, 2, 3], extra: 2 });
  });
});

describe("noteSnippet", () => {
  it("strips tags, decodes basic entities, collapses whitespace", () => {
    expect(noteSnippet("<p>Alpha&nbsp;&amp; beta</p>\n<p>gamma</p>")).toBe("Alpha & beta gamma");
  });

  it("truncates long text with an ellipsis within maxLength", () => {
    const out = noteSnippet(`<p>${"word ".repeat(60)}</p>`, 40);

    expect(out.length).toBeLessThanOrEqual(40);
    expect(out.endsWith("…")).toBe(true);
  });

  it("returns empty string for empty/whitespace-only bodies", () => {
    expect(noteSnippet("<p> </p>")).toBe("");
  });

  it("does not double-decode a literal escaped entity", () => {
    expect(noteSnippet("<p>&amp;lt;tag&amp;gt;</p>")).toBe("&lt;tag&gt;");
  });
});

describe("relativeTime", () => {
  const now = Date.parse("2026-07-24T12:00:00Z");

  it("buckets recent times", () => {
    expect(relativeTime("2026-07-24T11:59:40Z", now)).toBe("just now");
    expect(relativeTime("2026-07-24T11:35:00Z", now)).toBe("25m ago");
    expect(relativeTime("2026-07-24T07:00:00Z", now)).toBe("5h ago");
    expect(relativeTime("2026-07-23T09:00:00Z", now)).toBe("yesterday");
    expect(relativeTime("2026-07-20T12:00:00Z", now)).toBe("4d ago");
  });

  it("falls back to a short date at 7 days and beyond", () => {
    expect(relativeTime("2026-07-12T12:00:00Z", now)).toBe("Jul 12");
  });
});

describe("formatShortDate", () => {
  it("formats a date-only ISO string", () => {
    expect(formatShortDate("2026-07-21")).toBe("Jul 21");
  });
});

describe("localTodayIso", () => {
  it("returns a local YYYY-MM-DD string", () => {
    expect(localTodayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
