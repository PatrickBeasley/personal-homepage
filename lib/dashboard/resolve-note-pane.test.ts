import { describe, expect, it } from "vitest";

import type { NoteItem } from "@/lib/dashboard/types";
import { resolveNotePane } from "./resolve-note-pane";

function note(overrides: Partial<NoteItem> & { id: string }): NoteItem {
  return {
    ctx: "work",
    category_id: "cat-a",
    title: "Title",
    content_html: "<p>body</p>",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("resolveNotePane", () => {
  it("is the list when no note is active", () => {
    expect(resolveNotePane(null)).toBe("list");
  });

  it("is the editor when a note is active", () => {
    expect(resolveNotePane(note({ id: "a" }))).toBe("editor");
  });
});
