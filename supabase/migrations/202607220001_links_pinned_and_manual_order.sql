-- Manual ordering and pinning for dashboard links.
--
-- sort_order has existed since the dashboard schema but was never written: every
-- row holds 0 and the client always derived order at render time. It now carries
-- the user's manual order, so it needs a meaningful starting state.

alter table public.dashboard_links
  add column if not exists pinned boolean not null default false;

-- Backfill from created_at desc within each workspace, which reproduces exactly
-- what the default "Recent" view shows today. Without this every row would share
-- sort_order 0 and the first drag would scramble the list.
--
-- This is a one-shot backfill: it runs once as this migration is applied, before
-- any manual ordering exists. It is deliberately unconditional (no guard on the
-- prior value) because there is nothing to preserve yet. Do NOT replay this file
-- after the reorder API is live, or it would reset every list to created_at order.
with ranked as (
  select id,
         row_number() over (partition by ctx order by created_at desc) as position
  from public.dashboard_links
)
update public.dashboard_links as l
set sort_order = ranked.position
from ranked
where l.id = ranked.id;

-- Serves the default view directly: workspace, then pinned band, then manual order.
create index if not exists dashboard_links_ctx_pinned_sort_idx
  on public.dashboard_links (ctx, pinned, sort_order);

comment on column public.dashboard_links.pinned is
  'Pinned links render in a band above all other links in the same workspace.';

-- Rollback guidance:
-- drop index if exists public.dashboard_links_ctx_pinned_sort_idx;
-- alter table public.dashboard_links drop column if exists pinned;
-- (sort_order is not dropped; it predates this migration. To revert the backfill,
--  update public.dashboard_links set sort_order = 0;)
