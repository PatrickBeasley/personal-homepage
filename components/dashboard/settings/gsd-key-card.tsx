"use client";

import { useId, useState } from "react";

import { TaskIcon } from "@/components/dashboard/icons";
import { useToast } from "@/components/dashboard/toast";
import { readApiError } from "@/lib/dashboard/read-api-error";
import type { GsdKeyStatus } from "@/lib/dashboard/types";

/**
 * "Jul 23" from a timestamptz ISO string. Formats the UTC date components
 * with a fixed locale so server and client render the same text — no
 * timezone-dependent hydration drift.
 */
function formatSavedDate(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);

  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/**
 * Write-only management of the Project-GSD key. The input never echoes a
 * stored key (there is no read-back API); after a successful save it is
 * cleared and only the last-4 hint renders. Non-optimistic throughout:
 * verify-on-save is inherently a server round-trip, so a saving state and a
 * toast are the whole story — no rollback machinery.
 *
 * Like the rest of Settings, this card is not workspace-scoped.
 */
export default function GsdKeyCard({ initialStatus }: { initialStatus: GsdKeyStatus }) {
  const showToast = useToast();

  const [status, setStatus] = useState<GsdKeyStatus>(initialStatus);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);

  const inputId = useId();

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const candidate = draft.trim();

    if (!candidate || saving) {
      return;
    }

    setSaving(true);

    try {
      const response = await fetch("/api/gsd-key", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: candidate }),
      });

      if (!response.ok) {
        throw new Error(await readApiError(response, "Could not save the key."));
      }

      const saved: GsdKeyStatus = await response.json();
      const replaced = status.configured;

      setStatus(saved);
      setDraft("");
      showToast(replaced ? "Project-GSD key updated" : "Project-GSD connected");
    } catch (error) {
      // The typed key stays in the input so a rejected paste can be corrected.
      showToast(error instanceof Error ? error.message : "Could not save the key.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    if (removing) {
      return;
    }

    setRemoving(true);

    try {
      const response = await fetch("/api/gsd-key", { method: "DELETE" });

      if (!response.ok) {
        throw new Error(await readApiError(response, "Could not remove the key."));
      }

      setStatus({ configured: false, last4: null, updated_at: null });
      showToast("Project-GSD key removed");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not remove the key.");
    } finally {
      setRemoving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-surface shadow">
      <div className="flex items-center gap-[10px] border-b border-border px-5 py-[18px]">
        <span className="flex text-accent">
          <TaskIcon />
        </span>
        <h2 className="font-heading text-[17px] font-semibold">Integrations</h2>
      </div>

      <div className="flex flex-col gap-3 p-5">
        <p className="text-sm text-text-2">
          Tasks reads from Project-GSD. Keys are created on your GSD Account page and
          verified against GSD before being saved. A saved key is never shown again —
          only its last four characters.
        </p>

        {status.configured ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-text">
              Key set
              {status.last4 ? (
                <>
                  {" "}· ends in <span className="font-mono">…{status.last4}</span>
                </>
              ) : null}
              {status.updated_at ? ` · saved ${formatSavedDate(status.updated_at)}` : null}
            </span>
            <button
              type="button"
              onClick={() => void handleRemove()}
              disabled={removing}
              className="h-[34px] cursor-pointer rounded-[9px] border border-border bg-transparent px-3 text-[13px] text-red-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Remove
            </button>
          </div>
        ) : null}

        <form onSubmit={(event) => void handleSave(event)} className="flex flex-wrap gap-[10px]">
          <label htmlFor={inputId} className="sr-only">
            {status.configured ? "Replace the Project-GSD API key" : "Project-GSD API key"}
          </label>
          <input
            id={inputId}
            type="password"
            autoComplete="off"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={status.configured ? "Replace key: gsd_…" : "gsd_…"}
            maxLength={200}
            className="h-[38px] min-w-0 flex-1 rounded-[9px] border border-border-2 bg-surface-2 px-3 font-mono text-sm text-text"
          />
          <button
            type="submit"
            disabled={saving || !draft.trim()}
            className="h-[38px] cursor-pointer rounded-[9px] bg-accent px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Verifying…" : "Save"}
          </button>
        </form>
      </div>
    </section>
  );
}
