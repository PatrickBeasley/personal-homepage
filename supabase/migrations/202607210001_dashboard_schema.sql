-- Dashboard schema: private admin-only Links, Notes and per-workspace categories.
-- Every row belongs to exactly one workspace context ("work" or "home").

create table if not exists public.dashboard_categories (
  id uuid primary key default gen_random_uuid(),
  ctx text not null check (ctx in ('work', 'home')),
  kind text not null check (kind in ('link', 'note')),
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  unique (ctx, kind, name)
);

-- ctx is denormalized onto dashboard_links and dashboard_notes even though the
-- referenced category already implies it, so workspace filtering is a single-table
-- index lookup with no join. The API is responsible for validating that an item's
-- ctx matches its category's ctx on every write.

create table if not exists public.dashboard_links (
  id uuid primary key default gen_random_uuid(),
  ctx text not null check (ctx in ('work', 'home')),
  category_id uuid not null references public.dashboard_categories (id) on delete restrict,
  title text not null,
  url text not null,
  description text,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.dashboard_notes (
  id uuid primary key default gen_random_uuid(),
  ctx text not null check (ctx in ('work', 'home')),
  category_id uuid not null references public.dashboard_categories (id) on delete restrict,
  title text not null default '',
  content_html text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists dashboard_links_set_updated_at on public.dashboard_links;
create trigger dashboard_links_set_updated_at
  before update on public.dashboard_links
  for each row
  execute function public.set_updated_at();

drop trigger if exists dashboard_notes_set_updated_at on public.dashboard_notes;
create trigger dashboard_notes_set_updated_at
  before update on public.dashboard_notes
  for each row
  execute function public.set_updated_at();

create index if not exists dashboard_categories_ctx_kind_sort_idx on public.dashboard_categories (ctx, kind, sort_order);
create index if not exists dashboard_links_ctx_category_idx on public.dashboard_links (ctx, category_id);
create index if not exists dashboard_links_ctx_sort_idx on public.dashboard_links (ctx, sort_order);
create index if not exists dashboard_notes_ctx_updated_idx on public.dashboard_notes (ctx, updated_at desc);

alter table public.dashboard_categories enable row level security;
alter table public.dashboard_links enable row level security;
alter table public.dashboard_notes enable row level security;

-- These tables are private to the single admin: no public or anon policy exists,
-- by design. The API layer additionally gates every route with requireAdminAuth.

create policy "admins manage dashboard categories"
  on public.dashboard_categories
  for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "admins manage dashboard links"
  on public.dashboard_links
  for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "admins manage dashboard notes"
  on public.dashboard_notes
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- Default categories. sort_order is the zero-based position within each ctx+kind list.
insert into public.dashboard_categories (ctx, kind, name, sort_order)
values
  ('work', 'link', 'Dev', 0),
  ('work', 'link', 'Docs', 1),
  ('work', 'link', 'Tools', 2),
  ('work', 'link', 'Cloud', 3),
  ('work', 'link', 'Ops', 4),
  ('work', 'note', 'Task', 0),
  ('work', 'note', 'Meeting', 1),
  ('work', 'note', 'Idea', 2),
  ('work', 'note', 'Log', 3),
  ('home', 'link', 'Media', 0),
  ('home', 'link', 'Shopping', 1),
  ('home', 'link', 'Finance', 2),
  ('home', 'link', 'Health', 3),
  ('home', 'link', 'Learn', 4),
  ('home', 'note', 'Idea', 0),
  ('home', 'note', 'Todo', 1),
  ('home', 'note', 'Journal', 2),
  ('home', 'note', 'Recipe', 3)
on conflict (ctx, kind, name) do nothing;

comment on function public.set_updated_at is 'Trigger function that stamps updated_at with the current UTC time on every update.';

comment on table public.dashboard_categories is 'Per-workspace categories for dashboard links and notes; private to the admin.';
comment on table public.dashboard_links is 'Categorized bookmarks in the private admin dashboard.';
comment on table public.dashboard_notes is 'Rich-text notes in the private admin dashboard.';

-- Rollback guidance:
-- drop table if exists public.dashboard_notes;
-- drop table if exists public.dashboard_links;
-- drop table if exists public.dashboard_categories;
-- drop function if exists public.set_updated_at();
