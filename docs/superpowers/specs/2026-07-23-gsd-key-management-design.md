# GSD API key management from the dashboard

**Date:** 2026-07-23
**Status:** Approved design, ready for planning
**Scope:** Migration (one table) + one route file + `lib/gsd/client.ts` key-resolution
change + a Settings card + a Tasks-page empty state. Removes the `GSD_API_KEY`
env var entirely.

## Problem

The Tasks section (shipped `main` `d1ce551`) reads its Project-GSD bearer key
from a `GSD_API_KEY` env var that has never been provisioned — setting or
rotating it requires the Vercel console and a redeploy. The owner wants to
manage the key from the dashboard itself.

## Decisions (user-confirmed)

1. **Database only.** Supabase becomes the single source of truth; the env-var
   path is removed (it was never set anywhere, so there is nothing to migrate).
2. **Write-only with a hint.** After saving, no endpoint ever returns the key.
   The dashboard shows status + the last 4 characters + saved date.
3. **Verify on save.** A key is stored only after GSD accepts it on a live
   `GET /lists` call made with the candidate key. No saved-but-dead states.
4. **Plain table + RLS** (not Vault): proportionate for a remintable,
   low-blast-radius key in a single-admin app, and avoids new
   SECURITY DEFINER/grant machinery — the area that has bitten this repo
   before (see the `is_admin()` EXECUTE grant history).
5. **Settings** hosts the UI (already not workspace-scoped, already the home
   of dashboard-management concerns).

## Data

Migration `202607230001_gsd_config.sql` (next in sequence after
`202607220001`; applied to prod via Supabase MCP like that one was):

```sql
create table public.gsd_config (
  id smallint primary key default 1 check (id = 1),  -- single row, upserted
  api_key text not null,
  key_last4 text not null,
  updated_at timestamptz not null default now()
);

alter table public.gsd_config enable row level security;

create policy "gsd_config_admin_all" on public.gsd_config
  for all using (public.is_admin()) with check (public.is_admin());
```

Same admin-only RLS shape as every private table. `key_last4` is a separate
column so status reads never touch `api_key`.

## API — `app/api/gsd-key/route.ts`

Flat path (like `/api/categories`). All handlers `requireAdminAuth`-first;
wire format per repo conventions.

| Method | Behaviour | Success |
|---|---|---|
| `GET` | Status read: selects `key_last4`, `updated_at` only | 200 `{ configured, last4, updated_at }` (`last4`/`updated_at` null when unconfigured) |
| `PUT` | Body `{ api_key }`. Trim; require non-empty string ≤ 200 chars (400 `INVALID_BODY`). Verify by calling GSD `GET /lists` with the **candidate** key via `testGsdKey`. Then upsert `{ id: 1, api_key, key_last4, updated_at: now }` | 200 `{ configured: true, last4, updated_at }` |
| `DELETE` | Deletes the row (idempotent — deleting when unconfigured still succeeds) | 200 `{ ok: true }` |

**PUT verify failures (nothing is stored on any failure):**

| GSD result for the candidate | Response |
|---|---|
| 401 | 400 `INVALID_KEY` — "Project-GSD rejected this key." |
| 429 | 429 `RATE_LIMITED`, message forwarded |
| network / timeout / 5xx / non-JSON | 502 `GSD_UNAVAILABLE` — save rejected; user retries. Never save blind. |
| Postgres write error after a good verify | 500 `SERVER_ERROR` |

**No endpoint returns, logs, or echoes `api_key`.** `GET`'s select list is
`key_last4, updated_at` — the key column is never read for display.

## `lib/gsd/client.ts` changes

- **Key resolution.** `process.env.GSD_API_KEY` is replaced by
  `resolveGsdKey(): Promise<string | null>` — a one-row select of `api_key`
  from `gsd_config` through the session-scoped server Supabase client
  (`createServerSupabaseClient`). Every caller is already behind
  `requireAdminAuth` or the dashboard layout guard, so RLS admits exactly the
  right sessions. Isolated as its own function so unit tests stub one seam
  (no more `vi.stubEnv`).
- **No caching.** The PK lookup is noise next to the GSD round-trip it
  precedes, and rotation/removal takes effect on the next request on every
  serverless instance. A cache would keep a revoked key alive until TTL.
- **`testGsdKey(candidate: string): Promise<GsdResult<GsdList[]>>`** — new
  export used by PUT. Internally `gsdFetch` gains an optional key-override
  parameter; `testGsdKey` calls `/lists` with it. The override key travels
  only in the `Authorization` header to `project-gsd.com`.
- **Not-configured becomes first-class.** `resolveGsdKey` returns
  `string | null`, so a missing row and a failed lookup query both collapse
  to the same `-1` GsdError (the query error is additionally logged
  server-side). `mapGsdFailure` maps `-1` to **503
  `NOT_CONFIGURED`** — "Add your Project-GSD key in Settings." — replacing
  the current 500 `SERVER_ERROR` row. It is a setup state, not a server
  fault.
- Everything else (error table, timeout, no-throw contract, key never in any
  error path) is unchanged.

## Settings UI — Integrations card

New card on the Settings page below the category managers, standard section
styling, identical in both workspaces (Settings is not workspace-scoped).
Server page fetches the status row (`key_last4`, `updated_at` — never
`api_key`) and passes it to the client card.

- **Not connected:** one explanatory line ("Tasks reads from Project-GSD;
  keys are created on your GSD Account page"), a password-type input
  (`autocomplete="off"`, placeholder `gsd_…`), **Save**. Save → PUT with
  saving state ("Verifying…") → on success clear the input, flip to
  connected, toast "Project-GSD connected". On `INVALID_KEY` keep the typed
  value and toast the message.
- **Connected:** status line "Key set · ends in …{last4} · saved {date}",
  a **Replace** input (same PUT path, upserts over the old key), and
  **Remove** (immediate DELETE, no confirm — repo convention, and the key is
  remintable from GSD anytime).
- Non-optimistic throughout: verify-on-save is inherently a round-trip, so
  plain saving state + toast; no rollback machinery.

## Tasks page empty state

When the page's GSD fetches fail with `error.status === -1`
(not-configured), render a **"Connect Project-GSD"** setup card — one
sentence plus a link to `/dashboard/settings` — instead of the generic
"could not be loaded" card, which remains for genuine GSD failures.
Client-side mutations that hit `NOT_CONFIGURED` (key removed mid-session)
surface the mapped message through the existing toast path; no special
client handling.

## Env cleanup

`GSD_API_KEY` removed from `.env.example` and README (env list back to
"all four"; the Tasks row's description gains "key managed in Settings").
`lib/gsd/client.test.ts` drops its env stubs in favor of the resolution
seam.

## Security invariants (binding)

- No endpoint returns, logs, or echoes `api_key`. `key_last4` is the only
  key-derived value that ever reaches a browser, computed server-side at
  save time.
- The candidate key in PUT travels only in the `Authorization` header to
  `project-gsd.com` and into the `gsd_config` upsert — never into logs,
  error bodies, or responses.
- During development and verification, no query in any session may select
  `api_key` — status checks read `key_last4`/`updated_at` only. The
  standing secret-safety rule applies to the DB copy exactly as it did to
  the env var.

## Testing / verification

Gates as always (`lint`, `tsc --noEmit`, `test`, `build`), exit codes
checked directly.

Unit (node-only harness):
- `resolveGsdKey` seam: row present → key; no row → null; query error →
  null (and the resulting `-1` GsdError carries no key material).
- `mapGsdFailure`: `-1` → `{ error: "NOT_CONFIGURED", status: 503 }`
  (replaces the 500 row's test).
- `testGsdKey`: uses the override key in the Authorization header, hits
  `/lists`, and its result never contains the candidate key.
- PUT-route validation reduced to pure helpers where practical (trim /
  non-empty / length cap).

UI cards are not unit-testable (no jsdom) — consistent with the repo.

**Deferred live acceptance** (needs the real GSD key; prove by reading
state, not 200s):
- Paste the real key in Settings → "Verifying…" → connected status with
  correct last4 → Tasks page loads real lists.
- Paste a garbage key → `INVALID_KEY` toast, `gsd_config` still empty
  (prove via a `key_last4`-only query).
- Remove → Tasks page shows the Connect setup card.
- Rotation: remint in GSD, Replace in dashboard → Tasks works on the next
  request, no redeploy.

## Files touched

- `supabase/migrations/2026072300xx_gsd_config.sql` — new.
- `app/api/gsd-key/route.ts` — new (GET/PUT/DELETE).
- `lib/gsd/client.ts` (+ `client.test.ts`) — key resolution seam,
  `testGsdKey`, `NOT_CONFIGURED` mapping; env stubs dropped.
- `app/dashboard/settings/page.tsx` + the settings view — Integrations card
  (exact component split follows the existing Settings structure, read at
  planning time).
- `app/dashboard/tasks/page.tsx` — setup-card branch on status `-1`.
- `.env.example`, `README.md` — env var removed; docs updated.
