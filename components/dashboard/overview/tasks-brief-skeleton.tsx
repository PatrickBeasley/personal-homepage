/**
 * Body-only skeleton for the tasks card. Shared between the Suspense fallback
 * (while the GSD call streams) and TasksBriefView's pre-hydration frame, so
 * the stream resolves into an identical surface with no jump.
 */
export default function TasksBriefSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="flex animate-pulse flex-col gap-3 p-5 motion-reduce:animate-none"
    >
      <span className="block h-[14px] w-[84%] rounded bg-surface-2" />
      <span className="block h-[14px] w-[72%] rounded bg-surface-2" />
      <span className="block h-[14px] w-[58%] rounded bg-surface-2" />
    </div>
  );
}
