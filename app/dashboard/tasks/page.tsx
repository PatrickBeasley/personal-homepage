import type { Metadata } from "next";
import Link from "next/link";

import TasksView from "@/components/dashboard/tasks/tasks-view";
import { getAllTasks, getLists } from "@/lib/gsd/client";

export const metadata: Metadata = {
  title: "Tasks",
};

// The GSD fetches use cache: "no-store", which requires request-time rendering.
export const dynamic = "force-dynamic";

export default async function TasksPage() {
  // The dashboard layout has already established that the caller is the admin.
  // Tasks are NOT workspace-scoped (like Documents): GSD knows nothing about
  // Work/Home, so both workspaces see the same data.
  const [lists, tasks] = await Promise.all([getLists(), getAllTasks()]);

  const failure = !lists.ok ? lists.error : !tasks.ok ? tasks.error : null;

  if (failure) {
    // status -1 = no key configured — a setup state, not an error. The card
    // points at Settings instead of telling the owner to "check" anything.
    if (failure.status === -1) {
      return (
        <section className="rounded-2xl border border-border bg-surface p-5 shadow">
          <h2 className="font-heading text-[17px] font-semibold">Connect Project-GSD</h2>
          <p className="mt-2 text-sm text-text-2">
            Tasks shows your Project-GSD lists once an API key is connected. Add one in{" "}
            <Link href="/dashboard/settings" className="font-semibold">
              Settings
            </Link>
            .
          </p>
        </section>
      );
    }

    // GsdError never contains the key, so this log is safe.
    console.error("Tasks page load error:", failure);

    return (
      <section className="rounded-2xl border border-border bg-surface p-5 shadow">
        <h2 className="font-heading text-[17px] font-semibold">Tasks</h2>
        <p className="mt-2 text-sm text-text-2">
          Tasks could not be loaded from Project-GSD. Reload the page — if it keeps
          failing, check the key in Settings.
        </p>
      </section>
    );
  }

  if (!lists.ok || !tasks.ok) {
    // Unreachable (failure covered both), but narrows the types below.
    return null;
  }

  return <TasksView initialLists={lists.data} initialTasks={tasks.data} />;
}
