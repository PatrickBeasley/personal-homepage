/**
 * Instant navigation fallback for every dashboard section.
 *
 * The dashboard pages are dynamic — each renders at request time and awaits a
 * Supabase query (and, for Tasks, two external Project-GSD calls). Next wraps
 * `page.tsx` in a Suspense boundary using this file, so on a client-side
 * navigation the persistent shell (sidebar + header) stays put and this
 * skeleton appears immediately while the new page's data streams in, instead
 * of the previous page sitting frozen until the fetch resolves.
 *
 * It mirrors the section-card shape (and the fill-height layout) so the swap to
 * real content is a fill, not a jump. Purely presentational — `aria-hidden`,
 * with a single polite status message for assistive tech.
 */
function Bar({ className }: { className: string }) {
  return <span className={`block rounded bg-surface-2 ${className}`} />;
}

export default function DashboardLoading() {
  // One row template, repeated. Keys are positional and stable — the list is
  // static placeholder content, never reordered.
  const rows = Array.from({ length: 7 });

  return (
    <section
      aria-hidden="true"
      className="flex min-h-0 flex-1 animate-pulse flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow motion-reduce:animate-none"
    >
      {/* Header: title + primary action */}
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-[18px]">
        <div className="flex items-center gap-[10px]">
          <Bar className="h-[18px] w-[18px] rounded-md" />
          <Bar className="h-4 w-24" />
        </div>
        <Bar className="h-[34px] w-24 rounded-[9px]" />
      </div>

      {/* Toolbar: search + controls */}
      <div className="flex flex-wrap items-center gap-[10px] border-b border-border px-5 py-3">
        <Bar className="h-9 min-w-[150px] flex-1 rounded-[9px]" />
        <Bar className="h-9 w-32 rounded-[9px]" />
        <Bar className="h-9 w-24 rounded-[9px]" />
      </div>

      {/* Rows */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {rows.map((_, index) => (
          <div
            key={index}
            className="flex items-center gap-3 border-b border-border px-5 py-[13px]"
          >
            <Bar className="h-[34px] w-[34px] flex-none rounded-[9px]" />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Bar className="h-[13px] w-1/3" />
              <Bar className="h-[11px] w-1/4" />
            </div>
            <Bar className="h-[22px] w-16 flex-none rounded-[20px]" />
          </div>
        ))}
      </div>

      <span role="status" className="sr-only">
        Loading…
      </span>
    </section>
  );
}
