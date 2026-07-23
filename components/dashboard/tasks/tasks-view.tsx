"use client";

import { useEffect, useId, useMemo, useState } from "react";

import {
  FlagIcon,
  RefreshIcon,
  RepeatIcon,
  SearchIcon,
  TaskIcon,
} from "@/components/dashboard/icons";
import { useToast } from "@/components/dashboard/toast";
import { readApiError } from "@/lib/dashboard/read-api-error";
import {
  buildListRank,
  compareTasks,
  groupByListId,
  partitionDone,
  type TaskSortKey,
} from "@/lib/dashboard/task-order";
import type { GsdList, GsdTask } from "@/lib/gsd/client";

const SORT_OPTIONS: { value: TaskSortKey; label: string }[] = [
  { value: "manual", label: "Manual" },
  { value: "due", label: "Due date" },
  { value: "alpha", label: "A–Z" },
  { value: "priority", label: "Priority" },
];

/** localStorage key for the remembered Tasks view (sort, grouping, filter). */
const TASKS_PREFS_KEY = "pb-tasks-prefs";

/** The remembered view. Every field optional so a partial/older payload still applies. */
interface TasksPrefs {
  sort?: TaskSortKey;
  grouped?: boolean;
  filter?: string;
}

/**
 * Reads the remembered view from localStorage, validating each field so a
 * corrupt or stale payload can never push an invalid sort key into state.
 * Mirrors readLinksPrefs in links-view.tsx.
 */
function readTasksPrefs(): TasksPrefs | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(TASKS_PREFS_KEY);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const prefs: TasksPrefs = {};

    if (typeof parsed.sort === "string" && SORT_OPTIONS.some((option) => option.value === parsed.sort)) {
      prefs.sort = parsed.sort as TaskSortKey;
    }

    if (typeof parsed.grouped === "boolean") {
      prefs.grouped = parsed.grouped;
    }

    if (typeof parsed.filter === "string") {
      prefs.filter = parsed.filter;
    }

    return prefs;
  } catch {
    return null;
  }
}

const INPUT_CLASS =
  "h-[38px] rounded-[9px] border border-border-2 bg-surface px-3 text-sm text-text";

const CONTROL_CLASS =
  "h-9 rounded-[9px] border border-border-2 bg-surface-2 px-[10px] text-[13px] text-text";

/**
 * Marks a row that exists only in local state while its POST is in flight.
 * Such a row has no GSD id yet, so it cannot be toggled.
 */
const OPTIMISTIC_PREFIX = "optimistic-";

/** Local YYYY-MM-DD for "today", in the viewer's timezone. */
function localTodayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${now.getFullYear()}-${month}-${day}`;
}

/** "Jul 21", or "Today" when the date matches todayIso. */
function formatDue(iso: string, todayIso: string | null): string {
  if (todayIso !== null && iso === todayIso) {
    return "Today";
  }

  const [year, month, day] = iso.split("-").map(Number);

  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/** Tone class for a due date: overdue red, today accent, future muted. */
function dueClass(iso: string, todayIso: string | null): string {
  if (todayIso === null) {
    return "text-muted";
  }

  if (iso < todayIso) {
    return "font-semibold text-red-500";
  }

  if (iso === todayIso) {
    return "font-semibold text-accent-2";
  }

  return "text-muted";
}

function TaskRow({
  task,
  listName,
  listColor,
  todayIso,
  busy,
  onToggle,
}: {
  task: GsdTask;
  listName: string;
  listColor: string;
  todayIso: string | null;
  busy: boolean;
  onToggle: (task: GsdTask) => void;
}) {
  const repeating = task.repeat !== "none";

  return (
    <li className="flex items-center gap-3 border-b border-border px-5 py-[13px] hover:bg-surface-2">
      <input
        type="checkbox"
        checked={task.done}
        disabled={busy}
        onChange={() => onToggle(task)}
        aria-label={`${task.done ? "Un-complete" : "Complete"} ${task.title}${
          repeating ? " (repeating — advances the due date)" : ""
        }`}
        className="h-[19px] w-[19px] flex-none cursor-pointer appearance-none rounded-full border-2 border-border-2 transition-colors checked:border-accent checked:bg-accent hover:border-accent disabled:cursor-not-allowed disabled:opacity-50 [&:checked]:bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 16 16%22><path d=%22m4 8.4 2.7 2.7L12.3 5%22 fill=%22none%22 stroke=%22white%22 stroke-width=%222.4%22 stroke-linecap=%22round%22/></svg>')] [&:checked]:bg-center [&:checked]:bg-no-repeat"
      />

      <div className="min-w-0 flex-1">
        <span
          className={[
            "block truncate text-sm",
            task.done ? "font-normal text-muted line-through" : "font-semibold text-text",
          ].join(" ")}
        >
          {task.title}
        </span>
        {task.priority === "high" || repeating || task.dueDate ? (
          <span
            className={[
              "flex items-center gap-[7px] font-mono text-[11px] text-muted",
              task.done ? "opacity-60" : "",
            ].join(" ")}
          >
            {task.priority === "high" ? (
              <span className="text-red-500" title="High priority">
                <FlagIcon />
              </span>
            ) : null}
            {repeating ? (
              <span title={`Repeats ${task.repeat}`}>
                <RepeatIcon />
              </span>
            ) : null}
            {task.dueDate ? (
              <span className={task.done ? "text-muted" : dueClass(task.dueDate, todayIso)}>
                {formatDue(task.dueDate, todayIso)}
              </span>
            ) : null}
          </span>
        ) : null}
      </div>

      <span className="flex flex-none items-center gap-[6px] whitespace-nowrap rounded-[20px] border border-border bg-surface-2 px-[9px] py-[3px] text-[11px] text-text-2">
        <span
          aria-hidden="true"
          className="h-[7px] w-[7px] rounded-full"
          style={{ background: listColor }}
        />
        {listName}
      </span>
    </li>
  );
}

export default function TasksView({
  initialLists,
  initialTasks,
}: {
  initialLists: GsdList[];
  initialTasks: GsdTask[];
}) {
  const showToast = useToast();

  const [lists, setLists] = useState<GsdList[]>(initialLists);
  const [tasks, setTasks] = useState<GsdTask[]>(initialTasks);
  const [formOpen, setFormOpen] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDue, setDraftDue] = useState("");
  const [draftListId, setDraftListId] = useState("");
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [listFilter, setListFilter] = useState("all");
  const [sort, setSort] = useState<TaskSortKey>("manual");
  const [grouped, setGrouped] = useState(false);
  // Repeating tasks toggle non-optimistically; their ids sit here while the
  // POST is in flight so the checkbox cannot be double-fired.
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  /*
   * "Today" is client-local information the server render cannot know: the
   * server runs in UTC, so computing it during render would make "Today" (and
   * the overdue tone) disagree between the server HTML and the client's first
   * render for part of every day — a hydration mismatch. Like the prefs
   * restore below, it is a genuine external read, so it enters state in an
   * effect; dates paint neutral for one frame, then take their tone.
   */
  const [todayIso, setTodayIso] = useState<string | null>(null);

  useEffect(() => {
    setTodayIso(localTodayIso());
  }, []);

  // Restore the last-used view once on mount — the same sanctioned external
  // -store read links-view.tsx performs, for the same hydration reason.
  useEffect(() => {
    const prefs = readTasksPrefs();

    if (!prefs) {
      return;
    }

    if (prefs.sort !== undefined) {
      setSort(prefs.sort);
    }

    if (prefs.grouped !== undefined) {
      setGrouped(prefs.grouped);
    }

    if (prefs.filter !== undefined) {
      setListFilter(prefs.filter);
    }
  }, []);

  // Written from the change handlers rather than an effect, so the mount
  // restore can never race a write of the defaults (links-view convention).
  function persistPrefs(next: TasksPrefs) {
    try {
      window.localStorage.setItem(
        TASKS_PREFS_KEY,
        JSON.stringify({ sort, grouped, filter: listFilter, ...next })
      );
    } catch {
      // Private mode or a full quota just means the view is not remembered.
    }
  }

  function handleSortChange(value: TaskSortKey) {
    setSort(value);
    persistPrefs({ sort: value });
  }

  function handleGroupedChange(value: boolean) {
    setGrouped(value);
    persistPrefs({ grouped: value });
  }

  function handleFilterChange(value: string) {
    setListFilter(value);
    persistPrefs({ filter: value });
  }

  const formId = useId();
  const searchId = useId();
  const filterId = useId();
  const sortId = useId();
  const titleId = useId();
  const dueId = useId();
  const listFieldId = useId();

  const listRank = useMemo(() => buildListRank(lists), [lists]);

  const listNames = useMemo(() => new Map(lists.map((list) => [list.id, list.name])), [lists]);
  const listColors = useMemo(() => new Map(lists.map((list) => [list.id, list.color])), [lists]);

  // Derived, never reset in an effect: a filter or draft list that no longer
  // exists simply stops being a valid choice and falls back on this render.
  const activeFilter = lists.some((list) => list.id === listFilter) ? listFilter : "all";
  const activeDraftListId = lists.some((list) => list.id === draftListId)
    ? draftListId
    : (lists[0]?.id ?? "");

  const visibleTasks = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return tasks
      .filter((task) => activeFilter === "all" || task.listId === activeFilter)
      .filter((task) => !needle || task.title.toLowerCase().includes(needle));
  }, [tasks, activeFilter, query]);

  // Partition after sorting, so both halves hold the active order; the Done
  // band then re-sorts manually — completion order is noise, GSD order is not.
  const { open, done } = useMemo(() => {
    const sorted = [...visibleTasks].sort((a, b) => compareTasks(a, b, sort, listRank));
    const parts = partitionDone(sorted);

    return {
      open: parts.open,
      done: [...parts.done].sort((a, b) => compareTasks(a, b, "manual", listRank)),
    };
  }, [visibleTasks, sort, listRank]);

  // Grouping is a view toggle, not a sort: it sections whatever `open` already
  // holds, so the active sort still decides the order inside each section.
  const groups = useMemo(() => {
    if (!grouped) {
      return null;
    }

    return groupByListId(open, lists);
  }, [grouped, open, lists]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const title = draftTitle.trim();
    const listId = activeDraftListId;

    if (!title || !listId || saving) {
      return;
    }

    const dueDate = draftDue || null;
    // Purely local, never sent anywhere: distinct from every real uuid until
    // GSD's row (with GSD's id) replaces it.
    const temporaryId = `${OPTIMISTIC_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2)}`;
    // GSD inserts new tasks at the top of the list, so the optimistic row
    // takes a position below every existing one — position 0 is the top.
    const topPosition = Math.min(
      0,
      ...tasks.filter((task) => task.listId === listId).map((task) => task.position)
    );
    const optimistic: GsdTask = {
      id: temporaryId,
      title,
      done: false,
      status: "todo",
      priority: "none",
      dueDate,
      dueTime: null,
      repeat: "none",
      notes: "",
      assigneeId: null,
      linkedListId: null,
      subtasks: [],
      attachments: [],
      position: topPosition - 1,
      tags: [],
      createdAt: new Date().toISOString(),
      listId,
    };

    setTasks((previous) => [optimistic, ...previous]);
    setDraftTitle("");
    setDraftDue("");
    setFormOpen(false);
    setSaving(true);

    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          list_id: listId,
          title,
          ...(dueDate ? { due_date: dueDate } : {}),
        }),
      });

      if (!response.ok) {
        throw new Error(await readApiError(response, "Could not save the task."));
      }

      // The 201 carries GSD's authoritative Task — real uuid, real position.
      const saved: GsdTask = await response.json();

      setTasks((previous) => previous.map((task) => (task.id === temporaryId ? saved : task)));
      showToast("Task added");
    } catch (error) {
      setTasks((previous) => previous.filter((task) => task.id !== temporaryId));
      // Give the draft back, but never over the top of something typed since.
      setDraftTitle((current) => current || title);
      setDraftDue((current) => current || (dueDate ?? ""));
      setFormOpen(true);
      showToast(error instanceof Error ? error.message : "Could not save the task.");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(target: GsdTask) {
    if (target.id.startsWith(OPTIMISTIC_PREFIX) || pendingIds.has(target.id)) {
      return;
    }

    const repeating = target.repeat !== "none";

    if (repeating) {
      // GSD advances the due date instead of completing — there is nothing
      // safe to guess, so wait for the entity and apply it.
      setPendingIds((previous) => new Set(previous).add(target.id));
    } else {
      const nextDone = !target.done;

      setTasks((previous) =>
        previous.map((task) =>
          task.id === target.id
            ? { ...task, done: nextDone, status: nextDone ? "done" : "todo" }
            : task
        )
      );
    }

    try {
      const response = await fetch(`/api/tasks/${target.id}/toggle`, { method: "POST" });

      if (!response.ok) {
        throw new Error(await readApiError(response, "Could not update the task."));
      }

      // Always apply GSD's returned Task — it is authoritative for every
      // field (repeating tasks come back open with a new dueDate).
      const saved: GsdTask = await response.json();

      setTasks((previous) => previous.map((task) => (task.id === target.id ? saved : task)));
    } catch (error) {
      if (!repeating) {
        setTasks((previous) =>
          previous.map((task) => (task.id === target.id ? target : task))
        );
      }

      showToast(error instanceof Error ? error.message : "Could not update the task.");
    } finally {
      if (repeating) {
        setPendingIds((previous) => {
          const next = new Set(previous);

          next.delete(target.id);

          return next;
        });
      }
    }
  }

  async function handleRefresh() {
    if (refreshing) {
      return;
    }

    setRefreshing(true);

    try {
      const response = await fetch("/api/tasks");

      if (!response.ok) {
        throw new Error(await readApiError(response, "Could not refresh tasks."));
      }

      const fresh: { lists: GsdList[]; tasks: GsdTask[] } = await response.json();

      // Wholesale swap: GSD is the source of truth and this is the freshest
      // full snapshot; any optimistic leftovers are superseded by it.
      setLists(fresh.lists);
      setTasks(fresh.tasks);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not refresh tasks.");
    } finally {
      setRefreshing(false);
    }
  }

  function renderRows(rows: GsdTask[]) {
    return (
      <ul className="list-none">
        {rows.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            listName={listNames.get(task.listId) ?? "Other"}
            listColor={listColors.get(task.listId) ?? "var(--muted)"}
            todayIso={todayIso}
            busy={task.id.startsWith(OPTIMISTIC_PREFIX) || pendingIds.has(task.id)}
            onToggle={handleToggle}
          />
        ))}
      </ul>
    );
  }

  return (
    <section className="flex flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-[18px]">
        <div className="flex min-w-[160px] flex-1 items-center gap-[10px]">
          <span className="flex text-accent">
            <TaskIcon />
          </span>
          <h2 className="font-heading text-[17px] font-semibold">Tasks</h2>
          <span className="font-mono text-xs text-muted">{open.length}</span>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          aria-label="Refresh from Project-GSD"
          title="Refresh"
          className="grid h-[34px] w-[34px] cursor-pointer place-items-center rounded-[9px] border border-border bg-transparent text-muted hover:text-text disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className={refreshing ? "flex animate-spin" : "flex"}>
            <RefreshIcon />
          </span>
        </button>
        <button
          type="button"
          onClick={() => setFormOpen((formIsOpen) => !formIsOpen)}
          aria-expanded={formOpen}
          aria-controls={formOpen ? formId : undefined}
          className="inline-flex h-[34px] cursor-pointer items-center gap-1.5 rounded-[9px] px-[14px] text-[13px] font-semibold text-white bg-accent"
        >
          + Add task
        </button>
      </div>

      {formOpen ? (
        <form
          id={formId}
          onSubmit={handleSubmit}
          className="grid animate-[pbPop_0.2s_ease_both] grid-cols-[2fr_auto_1fr_auto] gap-[10px] border-b border-border bg-surface-2 px-5 py-4 motion-reduce:animate-none max-[560px]:grid-cols-1"
        >
          <label htmlFor={titleId} className="sr-only">
            Task title
          </label>
          <input
            id={titleId}
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            placeholder="Task title"
            required
            className={INPUT_CLASS}
          />

          <label htmlFor={dueId} className="sr-only">
            Due date (optional)
          </label>
          <input
            id={dueId}
            type="date"
            value={draftDue}
            onChange={(event) => setDraftDue(event.target.value)}
            className={INPUT_CLASS}
          />

          <label htmlFor={listFieldId} className="sr-only">
            List
          </label>
          <select
            id={listFieldId}
            value={activeDraftListId}
            onChange={(event) => setDraftListId(event.target.value)}
            className={INPUT_CLASS}
          >
            {lists.map((list) => (
              <option key={list.id} value={list.id}>
                {list.name}
              </option>
            ))}
          </select>

          <button
            type="submit"
            disabled={saving || lists.length === 0}
            className="h-[38px] cursor-pointer rounded-[9px] px-4 text-sm font-semibold text-white bg-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            Save
          </button>
        </form>
      ) : null}

      <div className="flex flex-wrap items-center gap-[10px] border-b border-border px-5 py-3">
        <div className="relative min-w-[150px] flex-1">
          <label htmlFor={searchId} className="sr-only">
            Search tasks
          </label>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-[11px] top-1/2 -translate-y-1/2 text-muted"
          >
            <SearchIcon />
          </span>
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search tasks…"
            className={`${CONTROL_CLASS} w-full pl-[34px]`}
          />
        </div>

        <label htmlFor={filterId} className="sr-only">
          Filter by list
        </label>
        <select
          id={filterId}
          value={activeFilter}
          onChange={(event) => handleFilterChange(event.target.value)}
          className={CONTROL_CLASS}
        >
          <option value="all">All lists</option>
          {lists.map((list) => (
            <option key={list.id} value={list.id}>
              {list.name}
            </option>
          ))}
        </select>

        <label htmlFor={sortId} className="sr-only">
          Sort tasks
        </label>
        <select
          id={sortId}
          value={sort}
          onChange={(event) => handleSortChange(event.target.value as TaskSortKey)}
          className={CONTROL_CLASS}
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-[9px] border border-border-2 bg-surface-2 px-[10px] text-[13px] text-text">
          <input
            type="checkbox"
            checked={grouped}
            onChange={(event) => handleGroupedChange(event.target.checked)}
            className="h-3.5 w-3.5 accent-[var(--accent)]"
          />
          Group
        </label>
      </div>

      <div className="max-h-[520px] flex-1 overflow-auto">
        {open.length === 0 && done.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-muted">
            No tasks match. Add one ↑
          </p>
        ) : (
          <>
            {groups
              ? groups.map((group) => (
                  <div key={group.key}>
                    <h3 className="flex items-center justify-between border-b border-border bg-surface-2 px-5 py-2 font-mono text-[11px] uppercase tracking-wide text-muted">
                      <span className="flex items-center gap-[7px]">
                        <span
                          aria-hidden="true"
                          className="h-[7px] w-[7px] rounded-full"
                          style={{ background: group.color }}
                        />
                        {group.label}
                      </span>
                      <span>{group.tasks.length}</span>
                    </h3>
                    {renderRows(group.tasks)}
                  </div>
                ))
              : renderRows(open)}

            {done.length > 0 ? (
              <div>
                <h3 className="flex items-center justify-between border-b border-border bg-surface-2 px-5 py-2 font-mono text-[11px] uppercase tracking-wide text-muted">
                  Done
                  <span>{done.length}</span>
                </h3>
                {renderRows(done)}
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
