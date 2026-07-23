-- Single-row config holding the Project-GSD API key, managed from the
-- dashboard's Settings page (spec: docs/superpowers/specs/
-- 2026-07-23-gsd-key-management-design.md). Replaces the GSD_API_KEY env var.
--
-- key_last4 is a separate column so status reads never touch api_key: the
-- GET /api/gsd-key handler and the Settings page select key_last4/updated_at
-- only, and no endpoint ever returns api_key.
--
-- Re-run guard: none needed — create table fails loudly if it already exists,
-- which is the correct signal that the version ledger is out of step.
--
-- Rollback:
--   drop table public.gsd_config;

create table public.gsd_config (
  id smallint primary key default 1 check (id = 1),
  api_key text not null,
  key_last4 text not null,
  updated_at timestamptz not null default now()
);

alter table public.gsd_config enable row level security;

-- Same admin-only shape as every private table: RLS policy expressions run in
-- the querying role's security context, so is_admin() must remain EXECUTE-able
-- by PUBLIC (see AGENTS.md — never revoke it).
create policy "gsd_config_admin_all" on public.gsd_config
  for all using (public.is_admin()) with check (public.is_admin());
