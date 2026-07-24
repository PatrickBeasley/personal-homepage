import Link from "next/link";

import TasksBriefView from "@/components/dashboard/overview/tasks-brief-view";
import { getAllTasks, getLists } from "@/lib/gsd/client";

/**
 * Streams inside the Overview page's <Suspense>. NOT workspace-scoped: GSD
 * knows nothing about Work/Home. Failures degrade to an inline card — never
 * a page-level error — because the rest of the Overview is independent.
 */
export default async function TasksBrief() {
  const [lists, tasks] = await Promise.all([getLists(), getAllTasks()]);

  const failure = !lists.ok ? lists.error : !tasks.ok ? tasks.error : null;

  if (failure) {
    // status -1 = no key configured — a setup state, not an error.
    if (failure.status === -1) {
      return (
        <div className="p-5">
          <p className="font-heading text-[15px] font-semibold">Connect Project-GSD</p>
          <p className="mt-1 text-sm text-text-2">
            Tasks show here once an API key is connected. Add one in{" "}
            <Link href="/dashboard/settings" className="font-semibold text-accent">
              Settings
            </Link>
            .
          </p>
        </div>
      );
    }

    // GsdError never contains the key, so this log is safe.
    console.error("Overview tasks load error:", failure);

    return (
      <div className="p-5">
        <p className="font-heading text-[15px] font-semibold">Tasks unavailable</p>
        <p className="mt-1 text-sm text-text-2">
          Project-GSD didn&rsquo;t respond. The rest of the page is unaffected — try again from{" "}
          <Link href="/dashboard/tasks" className="font-semibold text-accent">
            Tasks
          </Link>
          .
        </p>
      </div>
    );
  }

  if (!lists.ok || !tasks.ok) {
    // Unreachable (failure covered both), but narrows the types below.
    return null;
  }

  // Server→client props must be serializable: a plain Record, not a Map.
  const listNames = Object.fromEntries(lists.data.map((list) => [list.id, list.name]));

  return <TasksBriefView tasks={tasks.data} listNames={listNames} />;
}
