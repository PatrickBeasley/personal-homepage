-- Link click tracking: an all-time counter and last-clicked timestamp per link,
-- plus an atomic increment RPC. Powers the "Most used" sort and the Overview
-- "Frequent links" card.

alter table public.dashboard_links
  add column if not exists click_count integer not null default 0,
  add column if not exists last_clicked_at timestamptz;

-- Ordering index for the sort and the top-N card, per workspace.
create index if not exists dashboard_links_ctx_clicks_idx
  on public.dashboard_links (ctx, click_count desc);

-- Atomic increment. security invoker (the default, stated for emphasis) so the
-- existing "admins manage dashboard links" RLS policy still gates the UPDATE:
-- a non-admin caller matches zero rows and gets NULL back, which the route
-- turns into a 404. MUST NOT be security definer — that would bypass RLS.
create or replace function public.increment_link_click(link_id uuid)
returns public.dashboard_links
language sql
security invoker
-- Pin the search_path (advisor 0011): the body fully-qualifies
-- public.dashboard_links, and built-ins like now() resolve via pg_catalog,
-- which is always implicitly searched — so an empty search_path is safe and
-- closes the mutable-search_path warning.
set search_path = ''
as $$
  update public.dashboard_links
     set click_count = click_count + 1,
         last_clicked_at = now()
   where id = link_id
  returning *;
$$;

grant execute on function public.increment_link_click(uuid) to anon, authenticated;

comment on function public.increment_link_click(uuid) is
  'Atomically bumps a link''s click_count and last_clicked_at. security invoker so RLS gates it.';
