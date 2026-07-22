import { describe, expect, it } from "vitest";

import type { LinkItem } from "@/lib/dashboard/types";
import {
  compareLinks,
  computeReorder,
  groupByCategory,
  partitionPinned,
} from "./link-order";

function link(overrides: Partial<LinkItem> & { id: string }): LinkItem {
  return {
    ctx: "work",
    category_id: "cat-a",
    title: "Title",
    url: "https://example.com",
    description: null,
    sort_order: 0,
    pinned: false,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const NAMES = new Map([
  ["cat-a", "Alpha"],
  ["cat-b", "Beta"],
]);

describe("compareLinks", () => {
  it("orders by sort_order ascending in manual mode", () => {
    const a = link({ id: "a", sort_order: 2 });
    const b = link({ id: "b", sort_order: 1 });

    expect([a, b].sort((x, y) => compareLinks(x, y, "manual", NAMES))).toEqual([b, a]);
  });

  it("orders newest first for recent", () => {
    const older = link({ id: "a", created_at: "2026-01-01T00:00:00.000Z" });
    const newer = link({ id: "b", created_at: "2026-02-01T00:00:00.000Z" });

    expect([older, newer].sort((x, y) => compareLinks(x, y, "recent", NAMES))).toEqual([
      newer,
      older,
    ]);
  });

  it("orders by title for alpha", () => {
    const a = link({ id: "a", title: "Zebra" });
    const b = link({ id: "b", title: "Apple" });

    expect([a, b].sort((x, y) => compareLinks(x, y, "alpha", NAMES))).toEqual([b, a]);
  });

  it("orders by category name for category", () => {
    const a = link({ id: "a", category_id: "cat-b" });
    const b = link({ id: "b", category_id: "cat-a" });

    expect([a, b].sort((x, y) => compareLinks(x, y, "category", NAMES))).toEqual([b, a]);
  });

  // Without this, two links sharing a sort_order render in an order that can
  // change between renders, and a drag appears to "jump".
  it("breaks a manual tie deterministically by id", () => {
    const a = link({ id: "aaa", sort_order: 1 });
    const b = link({ id: "bbb", sort_order: 1 });

    expect(compareLinks(a, b, "manual", NAMES)).toBeLessThan(0);
    expect(compareLinks(b, a, "manual", NAMES)).toBeGreaterThan(0);
  });
});

describe("partitionPinned", () => {
  it("splits pinned from the rest, preserving order within each", () => {
    const a = link({ id: "a", pinned: true });
    const b = link({ id: "b" });
    const c = link({ id: "c", pinned: true });

    expect(partitionPinned([a, b, c])).toEqual({
      pinned: [a, c],
      rest: [b],
    });
  });

  it("returns an empty pinned band when nothing is pinned", () => {
    const a = link({ id: "a" });

    expect(partitionPinned([a])).toEqual({ pinned: [], rest: [a] });
  });
});

describe("groupByCategory", () => {
  it("groups links under their category name, preserving link order", () => {
    const a = link({ id: "a", category_id: "cat-a" });
    const b = link({ id: "b", category_id: "cat-b" });
    const c = link({ id: "c", category_id: "cat-a" });

    expect(groupByCategory([a, b, c], NAMES)).toEqual([
      { key: "cat-a", label: "Alpha", links: [a, c] },
      { key: "cat-b", label: "Beta", links: [b] },
    ]);
  });

  it("labels an unknown category rather than dropping the link", () => {
    const a = link({ id: "a", category_id: "gone" });

    expect(groupByCategory([a], NAMES)).toEqual([
      { key: "gone", label: "Uncategorized", links: [a] },
    ]);
  });

  it("returns no groups for no links", () => {
    expect(groupByCategory([], NAMES)).toEqual([]);
  });
});

describe("computeReorder", () => {
  it("moves a link down and renumbers from one", () => {
    const links = [link({ id: "a" }), link({ id: "b" }), link({ id: "c" })];

    expect(computeReorder(links, 0, 2)).toEqual([
      { id: "b", sort_order: 1 },
      { id: "c", sort_order: 2 },
      { id: "a", sort_order: 3 },
    ]);
  });

  it("moves a link up", () => {
    const links = [link({ id: "a" }), link({ id: "b" }), link({ id: "c" })];

    expect(computeReorder(links, 2, 0)).toEqual([
      { id: "c", sort_order: 1 },
      { id: "a", sort_order: 2 },
      { id: "b", sort_order: 3 },
    ]);
  });

  it("is a no-op when the indices match", () => {
    const links = [link({ id: "a" }), link({ id: "b" })];

    expect(computeReorder(links, 1, 1)).toEqual([
      { id: "a", sort_order: 1 },
      { id: "b", sort_order: 2 },
    ]);
  });

  it("returns an empty list for out-of-range indices", () => {
    const links = [link({ id: "a" })];

    expect(computeReorder(links, 5, 0)).toEqual([]);
    expect(computeReorder(links, 0, 9)).toEqual([]);
  });
});
