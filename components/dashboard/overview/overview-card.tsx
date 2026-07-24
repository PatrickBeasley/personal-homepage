import Link from "next/link";

/**
 * Shared chrome for Overview cards: header row (title, mono meta, "View all")
 * above arbitrary body content. Deliberately not "use client" — the tasks
 * card uses it from a server tree, Recent notes from a client tree.
 */
export default function OverviewCard({
  title,
  meta,
  href,
  children,
}: {
  title: string;
  meta?: string;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow">
      <div className="flex items-center gap-[10px] border-b border-border px-5 py-[15px]">
        <h2 className="font-heading text-[17px] font-semibold">{title}</h2>
        {meta ? <span className="font-mono text-[11px] text-muted">{meta}</span> : null}
        <Link href={href} className="ml-auto text-[13px] font-semibold text-accent">
          View all →
        </Link>
      </div>
      {children}
    </section>
  );
}
