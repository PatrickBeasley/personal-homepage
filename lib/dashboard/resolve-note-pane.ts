import type { NoteItem } from "@/lib/dashboard/types";

export type NotePane = "list" | "editor";

/**
 * Which Notes pane is active, derived from the selected note.
 *
 * On phones (≤560px) the card shows one pane at a time; this value becomes the
 * `data-pane` attribute the mobile CSS switches on. Returns "list" when no note
 * is active (including when the selected note belongs to the other workspace and
 * has stopped resolving), so the view falls back to the list by derivation rather
 * than via a separate effect.
 */
export function resolveNotePane(activeNote: NoteItem | null): NotePane {
  return activeNote ? "editor" : "list";
}
