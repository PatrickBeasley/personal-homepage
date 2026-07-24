-- Link click tracking: an all-time counter and last-clicked timestamp per link,
-- plus an atomic increment RPC. Powers the "Most used" sort and the Overview
-- "Frequent links" card.

alter table public.dashboard_links
  add column if not exists click_count integer not null default 0,
  add column if not exists last_clicked_at timestamptz;

-- Ordering index for the sort and the top-N card, per workspace.
create index if not exists dashboard_links_ctx_clicks_idx
  on public.dashboard_links (ctx, click_count desc);

-- Atomic increment. security invoker (stated for emphasis) so the existing
-- "admins manage dashboard links" RLS policy still gates the UPDATE: a non-admin
-- caller matches zero rows and gets NO row back (setof), which the route turns
-- into a 404. MUST NOT be security definer — that would bypass RLS. Returns
-- setof (not a bare composite) so an unmatched/RLS-refused id yields an empty
-- result rather than an all-null row. search_path pinned per advisor 0011; the
-- body fully-qualifies public.dashboard_links and now() resolves via pg_catalog.
drop function if exists public.increment_link_click(uuid);

create function public.increment_link_click(link_id uuid)
returns setof public.dashboard_links
language sql
security invoker
set search_path = ''
rows 1
as $$
  update public.dashboard_links
     set click_count = click_count + 1,
         last_clicked_at = now()
   where id = link_id
  returning *;
$$;

grant execute on function public.increment_link_click(uuid) to anon, authenticated;

comment on function public.increment_link_click(uuid) is
  'Atomically bumps a link''s click_count and last_clicked_at. security invoker so RLS gates it; returns setof so an unmatched or RLS-refused id yields no row (route 404).';
