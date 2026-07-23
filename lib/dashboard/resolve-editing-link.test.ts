import { describe, expect, it } from "vitest";

import type { LinkItem } from "@/lib/dashboard/types";
import { resolveEditingLink } from "./resolve-editing-link";

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

describe("resolveEditingLink", () => {
  it("returns null when nothing is being edited", () => {
    expect(resolveEditingLink([link({ id: "a" })], null)).toBeNull();
  });

  it("returns the matching link by id", () => {
    const a = link({ id: "a" });
    const b = link({ id: "b" });

    expect(resolveEditingLink([a, b], "b")).toBe(b);
  });

  it("returns null when the id is no longer present", () => {
    expect(resolveEditingLink([link({ id: "a" })], "gone")).toBeNull();
  });
});
