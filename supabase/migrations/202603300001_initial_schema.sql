create extension if not exists pgcrypto;

create table if not exists public.admin_users (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users (id) on delete set null,
  email text not null unique,
  created_at timestamptz not null default timezone('utc', now())
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

create table if not exists public.site_profile (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  headline text,
  bio text,
  location text,
  public_contact_email text,
  resume_url text,
  avatar_path text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  summary text,
  content_md text,
  repo_url text,
  live_url text,
  sort_order integer not null default 0,
  is_featured boolean not null default false,
  is_published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.external_links (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  url text not null,
  description text,
  sort_order integer not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.blog_posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  excerpt text,
  content_md text not null,
  cover_image_path text,
  is_published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.files_metadata (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null,
  file_extension text not null,
  file_size_bytes bigint not null,
  description text,
  visibility text not null default 'private' check (visibility in ('private', 'public')),
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  last_downloaded_at timestamptz
);

create table if not exists public.contact_submissions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  subject text,
  message text not null,
  status text not null default 'unread' check (status in ('unread', 'in_progress', 'resolved', 'archived')),
  handled_by uuid references auth.users (id) on delete set null,
  handled_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists projects_published_idx on public.projects (is_published, sort_order, published_at desc);
create index if not exists external_links_published_idx on public.external_links (is_published, sort_order);
create index if not exists blog_posts_published_idx on public.blog_posts (is_published, published_at desc);
create index if not exists files_metadata_visibility_idx on public.files_metadata (visibility, created_at desc);
create index if not exists contact_submissions_status_idx on public.contact_submissions (status, created_at desc);

alter table public.admin_users enable row level security;
alter table public.site_profile enable row level security;
alter table public.projects enable row level security;
alter table public.external_links enable row level security;
alter table public.blog_posts enable row level security;
alter table public.files_metadata enable row level security;
alter table public.contact_submissions enable row level security;

create policy "admin users are visible to admins"
  on public.admin_users
  for select
  using (public.is_admin());

create policy "admins manage admin_users"
  on public.admin_users
  for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "site profile is public"
  on public.site_profile
  for select
  using (true);

create policy "admins manage site_profile"
  on public.site_profile
  for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "published projects are public"
  on public.projects
  for select
  using (is_published);

create policy "admins can review all projects"
  on public.projects
  for select
  using (public.is_admin());

create policy "admins manage projects"
  on public.projects
  for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "published external links are public"
  on public.external_links
  for select
  using (is_published);

create policy "admins can review all external links"
  on public.external_links
  for select
  using (public.is_admin());

create policy "admins manage external links"
  on public.external_links
  for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "published blog posts are public"
  on public.blog_posts
  for select
  using (is_published);

create policy "admins can review all blog posts"
  on public.blog_posts
  for select
  using (public.is_admin());

create policy "admins manage blog posts"
  on public.blog_posts
  for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "public files metadata is public"
  on public.files_metadata
  for select
  using (visibility = 'public');

create policy "admins can review all file metadata"
  on public.files_metadata
  for select
  using (public.is_admin());

create policy "admins manage file metadata"
  on public.files_metadata
  for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "anyone can submit contact form"
  on public.contact_submissions
  for insert
  with check (true);

create policy "admins review contact submissions"
  on public.contact_submissions
  for select
  using (public.is_admin());

create policy "admins update contact submissions"
  on public.contact_submissions
  for update
  using (public.is_admin())
  with check (public.is_admin());

comment on function public.is_admin is 'Returns true when the authenticated user email exists in public.admin_users.';

comment on table public.admin_users is 'Allowlisted admin identities for content management and file operations.';
comment on table public.site_profile is 'Public-facing profile and homepage identity content.';
comment on table public.projects is 'Portfolio projects shown on the public site when published.';
comment on table public.external_links is 'Additional curated project or profile links shown on the public site.';
comment on table public.blog_posts is 'Blog content published to the site.';
comment on table public.files_metadata is 'Metadata for admin-uploaded files stored in Supabase Storage.';
comment on table public.contact_submissions is 'Private contact form submissions retained for up to 12 months by policy.';

-- Rollback guidance:
-- drop table if exists public.contact_submissions;
-- drop table if exists public.files_metadata;
-- drop table if exists public.blog_posts;
-- drop table if exists public.external_links;
-- drop table if exists public.projects;
-- drop table if exists public.site_profile;
-- drop table if exists public.admin_users;
-- drop function if exists public.is_admin();