"use client";

import { useId, useMemo, useRef, useState } from "react";

import { GearIcon } from "@/components/dashboard/icons";
import { useToast } from "@/components/dashboard/toast";
import { CATEGORY_NAME_MAX_LENGTH } from "@/lib/dashboard/api";
import type { Category, CategoryKind, Ctx } from "@/lib/dashboard/types";

/**
 * The two workspace cards, rendered side by side. This section deliberately does
 * **not** use `useWorkspace()`: unlike Links and Notes it shows everything at
 * once, because its whole subject is how the two workspaces differ (design
 * `settingsGroups`, patrick-beasley.dc.html line 748). The accent colour still
 * follows the active workspace, but only through the `data-ctx` attribute the
 * dashboard shell already sets — nothing here filters on it.
 */
const GROUPS: { ctx: Ctx; label: string; dotColor: string }[] = [
  { ctx: "work", label: "Work", dotColor: "var(--accent-work)" },
  { ctx: "home", label: "Home", dotColor: "var(--accent-home)" },
];

/** Design line 747: `KINDS=[['link','Link categories'],['note','Note types']]`. */
const KINDS: { kind: CategoryKind; label: string }[] = [
  { kind: "link", label: "Link categories" },
  { kind: "note", label: "Note types" },
];

/**
 * Marks a chip that exists only in local state while its POST is in flight.
 * Such a row has no server id yet, so it can be neither renamed nor deleted.
 */
const OPTIMISTIC_PREFIX = "optimistic-";

const CHIP_CLASS =
  "inline-flex items-center gap-[5px] rounded-[20px] border border-border bg-surface-2 py-[5px] pr-[7px] pl-[11px] text-xs text-text-2";

function draftKey(ctx: Ctx, kind: CategoryKind): string {
  return `${ctx}_${kind}`;
}

/**
 * Pulls a human-readable message off a failed API response. Dashboard routes
 * answer with `{ error, message }`; both fields are read before falling back, so
 * `LAST_CATEGORY` and `CATEGORY_IN_USE` reach the user as the server phrased
 * them — the reason is the whole point of those two refusals.
 */
async function readApiError(response: Response, fallback: string): Promise<string> {
  try {
    const body: unknown = await response.json();

    if (typeof body === "object" && body !== null) {
      const { message, error } = body as { message?: unknown; error?: unknown };

      if (typeof message === "string" && message) {
        return message;
      }

      if (typeof error === "string" && error) {
        return error;
      }
    }
  } catch {
    // Non-JSON error responses fall through to the generic message.
  }

  return fallback;
}

export default function SettingsView({
  initialCategories,
}: {
  initialCategories: Category[];
}) {
  const showToast = useToast();

  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  /**
   * Every refusal, with a sequence number. The number is the key of the
   * `role="alert"` node: re-inserting the element is what makes a screen reader
   * announce the *same* message twice (two attempts at the same doomed delete).
   */
  const [rejection, setRejection] = useState<{ text: string; seq: number } | null>(null);

  const rejectionSeq = useRef(0);
  const focusEditRef = useRef(false);
  /** Set by Escape so the blur that follows does not commit the edit anyway. */
  const cancelEditRef = useRef(false);
  /**
   * Ids whose DELETE is in flight or already done. Clicking a chip's × while its
   * name is being edited fires blur (a rename) and then the delete, and the
   * rename can land second and 404 — a failure for work that actually succeeded.
   */
  const removedIdsRef = useRef<Set<string>>(new Set());

  const baseId = useId();

  /** One pass over the flat list; every block reads its own bucket. */
  const grouped = useMemo(() => {
    const buckets = new Map<string, Category[]>();

    for (const category of categories) {
      const key = draftKey(category.ctx, category.kind);
      const bucket = buckets.get(key);

      if (bucket) {
        bucket.push(category);
      } else {
        buckets.set(key, [category]);
      }
    }

    for (const bucket of buckets.values()) {
      bucket.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
    }

    return buckets;
  }, [categories]);

  /** A refusal the user has to see: toast for sighted users, alert for the rest. */
  function reject(message: string) {
    rejectionSeq.current += 1;
    setRejection({ text: message, seq: rejectionSeq.current });
    showToast(message);
  }

  function startEdit(category: Category) {
    cancelEditRef.current = false;
    focusEditRef.current = true;
    setEditingId(category.id);
    setEditDraft(category.name);
  }

  function cancelEdit() {
    cancelEditRef.current = true;
    setEditingId(null);
    setEditDraft("");
  }

  async function handleAdd(event: React.FormEvent<HTMLFormElement>, ctx: Ctx, kind: CategoryKind) {
    event.preventDefault();

    const key = draftKey(ctx, kind);
    const name = (drafts[key] ?? "").trim();

    if (!name) {
      return;
    }

    const siblings = grouped.get(key) ?? [];

    // The design's own check (line 608). The server repeats it — this only
    // spares a request that is certain to come back 409, and doubles as the
    // double-submit guard, since the optimistic chip lands before the await.
    if (siblings.some((sibling) => sibling.name.toLowerCase() === name.toLowerCase())) {
      reject("Already exists");
      return;
    }

    // Purely local, never sent anywhere: it only has to be distinct from every
    // real uuid until the server's row replaces it.
    const temporaryId = `${OPTIMISTIC_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const optimistic: Category = {
      id: temporaryId,
      ctx,
      kind,
      name,
      // Mirrors the server: append to the end of this list.
      sort_order:
        siblings.reduce((highest, sibling) => Math.max(highest, sibling.sort_order), -1) + 1,
    };

    setCategories((previous) => [...previous, optimistic]);
    setDrafts((previous) => ({ ...previous, [key]: "" }));

    try {
      const response = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ctx, kind, name }),
      });

      if (!response.ok) {
        throw new Error(await readApiError(response, "Could not add the category."));
      }

      const saved: Category = await response.json();

      setCategories((previous) =>
        previous.map((category) => (category.id === temporaryId ? saved : category))
      );
      showToast("Added");
    } catch (error) {
      setCategories((previous) => previous.filter((category) => category.id !== temporaryId));
      // Give the draft back, but never over the top of something typed since.
      setDrafts((previous) => ({ ...previous, [key]: previous[key] || name }));
      reject(error instanceof Error ? error.message : "Could not add the category.");
    }
  }

  async function commitEdit(category: Category) {
    if (cancelEditRef.current) {
      return;
    }

    const name = editDraft.trim();

    // Closed synchronously, before the await: the blur that follows an Enter
    // must not find an open editor and send the same rename twice.
    setEditingId(null);
    setEditDraft("");

    if (!name || name === category.name) {
      return;
    }

    setCategories((previous) =>
      previous.map((entry) => (entry.id === category.id ? { ...entry, name } : entry))
    );

    try {
      const response = await fetch(`/api/categories/${category.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });

      if (!response.ok) {
        throw new Error(await readApiError(response, "Could not rename the category."));
      }

      const saved: Category = await response.json();

      setCategories((previous) =>
        previous.map((entry) => (entry.id === category.id ? saved : entry))
      );
      showToast("Renamed");
    } catch (error) {
      // The chip was deleted out from under the rename; the delete's own result
      // is the one that matters.
      if (removedIdsRef.current.has(category.id)) {
        return;
      }

      setCategories((previous) =>
        previous.map((entry) => (entry.id === category.id ? category : entry))
      );
      reject(error instanceof Error ? error.message : "Could not rename the category.");
    }
  }

  async function handleRemove(category: Category, isOnlyOne: boolean) {
    // The design's "Keep at least one" (line 610), enforced here so the button
    // can say why before it is pressed. The server enforces it independently.
    if (isOnlyOne) {
      reject("Keep at least one category in each list.");
      return;
    }

    if (category.id.startsWith(OPTIMISTIC_PREFIX)) {
      return;
    }

    removedIdsRef.current.add(category.id);
    setCategories((previous) => previous.filter((entry) => entry.id !== category.id));

    try {
      const response = await fetch(`/api/categories/${category.id}`, { method: "DELETE" });

      if (!response.ok) {
        throw new Error(await readApiError(response, "Could not remove the category."));
      }

      showToast("Removed");
    } catch (error) {
      removedIdsRef.current.delete(category.id);
      // Position is derived from `sort_order` at render time, so re-appending
      // puts the chip back exactly where it came from.
      setCategories((previous) =>
        previous.some((entry) => entry.id === category.id) ? previous : [...previous, category]
      );
      reject(error instanceof Error ? error.message : "Could not remove the category.");
    }
  }

  return (
    <section className="animate-[pbPop_0.2s_ease_both] overflow-hidden rounded-2xl border border-border bg-surface shadow motion-reduce:animate-none">
      <div className="flex flex-wrap items-center gap-[10px] border-b border-border px-5 py-[18px]">
        <span className="flex text-accent">
          <GearIcon />
        </span>
        <h2 className="font-heading text-[17px] font-semibold">Categories &amp; Types</h2>
        <span className="font-mono text-xs text-muted">segregated by workspace</span>
      </div>

      {/*
        The live region is always mounted so it is present before anything is
        announced; only the alert node itself is keyed and replaced.
      */}
      <div className="sr-only">
        {rejection ? (
          <p key={rejection.seq} role="alert">
            {rejection.text}
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-5 p-5">
        {GROUPS.map(({ ctx, label, dotColor }) => (
          <div key={ctx} className="overflow-hidden rounded-[14px] border border-border">
            <div className="flex items-center gap-[9px] border-b border-border bg-surface-2 px-4 py-3">
              <span
                aria-hidden="true"
                style={{ background: dotColor }}
                className="h-2.5 w-2.5 flex-none rounded-full"
              />
              <h3 className="font-heading text-sm font-semibold">{label}</h3>
            </div>

            <div className="flex flex-col gap-[18px] px-4 py-[14px]">
              {KINDS.map(({ kind, label: kindLabel }) => {
                const key = draftKey(ctx, kind);
                const items = grouped.get(key) ?? [];
                const onlyOne = items.length <= 1;
                const inputId = `${baseId}-${key}`;

                return (
                  <div key={kind}>
                    <h4
                      id={`${inputId}-label`}
                      className="mb-[9px] font-mono text-[11px] tracking-[0.05em] text-muted uppercase"
                    >
                      {kindLabel}
                    </h4>

                    {items.length === 0 ? (
                      <p className="mb-[11px] text-xs text-muted">
                        None yet — add the first one below.
                      </p>
                    ) : (
                      <ul
                        aria-labelledby={`${inputId}-label`}
                        className="mb-[11px] flex list-none flex-wrap gap-[7px]"
                      >
                        {items.map((category) => {
                          const optimistic = category.id.startsWith(OPTIMISTIC_PREFIX);
                          const editing = editingId === category.id;

                          return (
                            <li key={category.id} className={CHIP_CLASS}>
                              {editing ? (
                                <>
                                  <label htmlFor={`${inputId}-edit`} className="sr-only">
                                    Rename {category.name}
                                  </label>
                                  <input
                                    id={`${inputId}-edit`}
                                    ref={(element) => {
                                      if (element && focusEditRef.current) {
                                        focusEditRef.current = false;
                                        element.focus();
                                        element.select();
                                      }
                                    }}
                                    value={editDraft}
                                    maxLength={CATEGORY_NAME_MAX_LENGTH}
                                    onChange={(event) => setEditDraft(event.target.value)}
                                    onBlur={() => void commitEdit(category)}
                                    onKeyDown={(event) => {
                                      if (event.key === "Enter") {
                                        event.preventDefault();
                                        void commitEdit(category);
                                      } else if (event.key === "Escape") {
                                        event.preventDefault();
                                        cancelEdit();
                                      }
                                    }}
                                    style={{
                                      width: `${Math.max(editDraft.length, 4) + 1}ch`,
                                    }}
                                    className="min-w-0 rounded-[10px] border border-border-2 bg-surface px-1.5 text-xs text-text"
                                  />
                                </>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => startEdit(category)}
                                  disabled={optimistic}
                                  title="Rename"
                                  className="cursor-pointer bg-transparent text-xs text-text-2 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {category.name}
                                  <span className="sr-only"> — rename</span>
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => void handleRemove(category, onlyOne)}
                                // Not `disabled`: a disabled button drops out of
                                // the tab order, taking its explanation with it.
                                // Pressing it says why instead.
                                aria-disabled={onlyOne || optimistic}
                                aria-label={`Remove ${category.name}`}
                                title={onlyOne ? "Keep at least one" : "Remove"}
                                className={[
                                  "grid h-[17px] w-[17px] flex-none place-items-center rounded-full",
                                  "border-none bg-transparent p-0 text-sm leading-none text-muted",
                                  onlyOne || optimistic
                                    ? "cursor-not-allowed opacity-40"
                                    : "cursor-pointer hover:text-text",
                                ].join(" ")}
                              >
                                <span aria-hidden="true">×</span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    <form
                      onSubmit={(event) => void handleAdd(event, ctx, kind)}
                      className="flex gap-[7px]"
                    >
                      <label htmlFor={inputId} className="sr-only">
                        Add a {kind} category to {label}
                      </label>
                      <input
                        id={inputId}
                        value={drafts[key] ?? ""}
                        maxLength={CATEGORY_NAME_MAX_LENGTH}
                        onChange={(event) =>
                          setDrafts((previous) => ({ ...previous, [key]: event.target.value }))
                        }
                        placeholder={`Add a ${kind}…`}
                        className="h-[34px] min-w-0 flex-1 rounded-lg border border-border-2 bg-surface-2 px-[11px] text-[13px] text-text"
                      />
                      <button
                        type="submit"
                        className="h-[34px] cursor-pointer rounded-lg bg-accent px-[14px] text-[13px] font-semibold text-white"
                      >
                        Add
                      </button>
                    </form>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
