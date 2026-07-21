# Rebuild: patrickbeasley.com — Public One-Pager + Private Dashboard

## Context

Complete redesign of the personal site. The current Next.js 16 + Supabase site (blog, projects, admin, contact) is replaced by a new design, fully prototyped in Claude Design project `fcde1df2-3faa-4a80-ab24-8f90fcb3c513` ("Patrick Beasley.dc.html" — read in full):

- **Public `/`**: minimal one-pager — sticky translucent header (PB mark, About/Projects/Contact anchors, theme toggle, "Login →"), About (bio + stack pills), Projects (2 external cards: Get Stuff Done → project-gsd.com, Pokémon Database → pogo-db.com), Contact (**mailto link only** — form dropped per user), footer with legal boilerplate.
- **Private `/dashboard`** (Google OAuth, single admin): Work/Home workspace switch (accent blue `#3d6bff` / green `#12b886`), sections **Links** (categorized bookmarks, search/filter/sort), **Notes** (rich-text contenteditable, autosave), **Documents** (upload/download — reuses existing files infra), **Feeds** (placeholder cards only), **Settings** (category management per workspace). Mobile: burger sidebar, bottom tab bar, swipe ctx switch, pull-to-refresh.

**User decisions**: same repo on a branch (keeps Vercel host, URL, Supabase project, env). All dashboard data in Supabase (docs via existing Storage). Feeds stay placeholders. All old pages removed. **Contact form dropped entirely.** Grid/widget-layout mode cut for v1 (sidebar nav only). Dark theme default. Fonts: Space Grotesk / IBM Plex Sans / IBM Plex Mono. **Auth: replace Google OAuth with email+password (magic-link email as backup)** — sessions persist indefinitely per device (Supabase refresh-token rotation via `proxy.ts` already does this), so login only happens on a new device or cleared cookies.

**Key facts from exploration**:
- Next 16: `proxy.ts` (tracked) is the canonical middleware convention; untracked `middleware.ts` is a redundant duplicate — delete it. `params`/`searchParams` are Promises (`await params`). Route handlers uncached by default. Tailwind v4 CSS-first (`@theme inline` in `globals.css`, no config file). Docs: `node_modules/next/dist/docs/` (esp. `01-app/02-guides/upgrading/version-16.md`).
- Current auth is Google OAuth via `app/auth/{login,callback,logout}/route.ts` with `?next=` preserved; admin = `ADMIN_EMAIL` env (app layer, `lib/auth/admin.ts` + `admin-guard.ts` + `user-context.ts`) AND `admin_users` table via `public.is_admin()` (RLS layer). The admin-gating layers (`lib/auth/*` except the OAuth route, `lib/supabase/*`, `is_admin()` RLS) are auth-method-agnostic and reused unchanged; only the sign-in entry points change.
- Files infra reused as Documents backend: private `files` bucket, `files_metadata` table, `app/api/files*` routes (allowlist .pdf,.docx,.txt,.md,.sql,.py + 10MB, signed-URL downloads). Design labels docs "shared" — not workspace-scoped; v1 shows all files in both workspaces (matches design).
- Standing rules: server-side auth on every protected route/API; regression test per bug fix; lint + `tsc --noEmit` + build gates (CI enforces); **issue-first planning** (parent + child GitHub issues before code); **pause for user confirm before prod schema changes**; page titles bare (root `title.template`).
- **API wire conventions (all new dashboard routes)**: JSON only. Success → the entity (or `{ok: true}` for deletes). Errors → `{error: "<MACHINE_CODE>", message: "<human text>"}` with proper status: 400 validation (`INVALID_CTX`, `INVALID_URL`, `INVALID_BODY`…), 401 unauthenticated / 403 non-admin (from `requireAdminAuth`), 404 missing row, 409 conflict (`LAST_CATEGORY`, `CATEGORY_IN_USE`, `DUPLICATE_NAME`). Every phase brief copies this verbatim so shapes don't drift.
- **Spec = design snapshot + deviations**: behavioral detail (interactions, empty states, sort semantics, hover states) lives in `design/patrick-beasley.dc.html`, not prose. Phase briefs point implementers at the exact design lines plus the sanctioned deviations listed in this plan. Never paraphrase the design from memory.

## Phases

Branch: `rebuild/v2`. Before starting: create parent tracking issue + one child issue per phase (standing rule). Every phase gates on `npm run lint` + `npx tsc --noEmit` + `npm run build` + listed smoke.

### Phase 0 — Branch & housekeeping
- Commit pending `.github/copilot-instructions.md` + `.github/instructions/workflow.instructions.md`; create branch; delete untracked `middleware.ts`.
- Adopt project-gsd workflow conventions: create `docs/superpowers/` (specs/, plans/) and snapshot the Claude Design source to `design/patrick-beasley.dc.html` (+ `support.js`) via claude-design MCP `read_file` — decode HTML entities exactly one level. Commit as read-only design reference.
- Smoke: dev server boots, `/` renders.

### Phase 1 — Design foundation + public homepage
- `app/layout.tsx`: swap Geist → `Space_Grotesk` (`--font-heading`), `IBM_Plex_Sans` 400/500/600 (`--font-body`), `IBM_Plex_Mono` 400/500 (`--font-mono`) via `next/font/google`; add `suppressHydrationWarning` + inline pre-hydration script reading `localStorage.theme` → `data-theme` (dark default, no FOUC); update metadata copy (drop blog references).
- `app/globals.css`: port the prototype's full token set — dark values on `:root`, light under `[data-theme="light"]`, accent swap under `[data-ctx="home"]`; map via `@theme inline` so `bg-surface`, `text-text-2`, `border-border`, `text-accent`, `font-heading` etc. work.
- New `app/page.tsx` (server) composing `components/home/`: `site-header.tsx` (client: anchors, theme toggle, "Login →" linking to `/login?next=%2Fdashboard`), `about-section.tsx`, `projects-section.tsx`, `site-footer.tsx` (all server). Contact section = heading + mailto link, no form.
- Delete: `app/blog/`, `app/projects/`, `app/privacy/`, `components/site-nav.tsx`, `components/contact-form.tsx`, `app/api/contact/`, `app/api/contact-submissions/`. Trim `app/sitemap.ts` to `/` only. Keep `components/hash-scroll-handler.tsx`.
- Smoke: anchors scroll, theme persists across reload, both themes legible, Login reaches Google OAuth. Independently deployable (`/admin` still works).

### Phase 2 — Dashboard schema (⚠ user confirm before `supabase db push`)
- New `supabase/migrations/202607200001_dashboard_schema.sql`:
  - `dashboard_categories` (id, ctx check work|home, kind check link|note, name, sort_order; unique(ctx,kind,name))
  - `dashboard_links` (id, ctx, category_id FK **on delete restrict**, title, url, sort_order, timestamps)
  - `dashboard_notes` (id, ctx, category_id FK restrict, title default '', content_html default '', timestamps)
  - `set_updated_at()` triggers; indexes on (ctx, …); RLS enabled, one admin-only policy per table reusing `public.is_admin()` (`for all using/with check is_admin()`), **no public policies**.
  - Seed default categories (`on conflict do nothing`): work link Dev,Docs,Tools,Cloud,Ops; work note Task,Meeting,Idea,Log; home link Media,Shopping,Finance,Health,Learn; home note Idea,Todo,Journal,Recipe. **Seed ONLY categories — no sample links/notes.** The prototype's seeded links/notes are demo content; production starts empty (empty states are in the design).
  - Rollback comment block (match initial migration style). **Do not** drop legacy tables here.
- Verify: seeds present; anon-key select returns empty; admin path works; `ADMIN_EMAIL` row exists in `admin_users`.

### Phase 3 — Auth cutover (password + magic link) + dashboard shell
- **One-time Supabase setup (user does in Supabase Studio, with my guidance)**: enable Email provider; set a password on the existing admin auth user (must match `ADMIN_EMAIL` and the `admin_users` row); **disable public sign-ups**; optionally disable the Google provider after cutover. Leave session timebox/inactivity-timeout settings OFF (this is what makes sessions last forever per device).
- New `app/login/page.tsx` (server; redirects to `next` if already signed in) + `components/auth/login-form.tsx` (client): the prototype's login card, centered as a page — **email** + password (sanctioned deviation: the prototype's "Username" placeholder becomes "Email"; drop the "Demo: any credentials work" line) → `supabase.auth.signInWithPassword` via `createBrowserSupabaseClient` (cookie storage handled by `@supabase/ssr`), plus a "Email me a magic link" button → `signInWithOtp({ emailRedirectTo: origin + "/auth/confirm?next=..." })`. On success, `router.push(next)`. `next` sanitized with existing `normalizeNextPath`.
- New `app/auth/confirm/route.ts`: magic-link landing → redirect to `next`. **Resolve the exact verification pattern (`token_hash` + `verifyOtp` vs. `code` exchange) from the installed `@supabase/ssr@0.10` package docs/types — not from memory** — and record which in the phase report. Replaces the OAuth `callback` route. Delete `app/auth/login/route.ts` (OAuth) and `app/auth/callback/route.ts`; keep `app/auth/logout/route.ts`.
- Update `docs/ai/decision-records.md`: supersede the 2026-03-29 "Google OAuth only" decision with password + magic-link backup (rationale: daily lifelong use, indefinite per-device sessions, no third-party dependency for sign-in).
- `app/dashboard/layout.tsx` (server): `getUserContext()` → no user → `redirect("/login?next=%2Fdashboard")`; not admin → `redirect("/")`; wraps children in shell.
- `app/dashboard/page.tsx` → `redirect("/dashboard/links")`. Stub section pages.
- `components/dashboard/`: `shell.tsx` (client: 264px sidebar, burger+scrim <860px, bottom tab bar, ctx switch setting `data-ctx`, logout link → `/auth/logout`), `workspace-context.tsx` (ctx in React context + localStorage), `toast.tsx`.
- `app/dashboard/feeds/page.tsx`: static placeholder cards (RSS/Calendar/Weather/GitHub, "coming soon" toast).
- Delete `app/admin/`, `app/api/blog-posts/`.
- Smoke: unauth `/dashboard` → `/login` → password sign-in lands back on `/dashboard`; magic-link email round-trip works; wrong password rejected; non-admin account → `/`; **session survives full browser restart**; ctx switch flips accent; sidebar collapses <860px; `/admin` 404s.

### Phase 4 — Links
- `app/api/links/route.ts` (GET, POST) + `app/api/links/[id]/route.ts` (PATCH, DELETE); `app/api/categories/route.ts` (GET). All: `requireAdminAuth` first; `await params`; validate ctx enum, URL http/https, category exists + ctx matches.
- `app/dashboard/links/page.tsx` (server: fetch links+categories for both ctx in one pass) → `links-view.tsx` (client: search/filter/sort, add form, delete; optimistic state with rollback + toast on API failure).
- `lib/dashboard/types.ts`, `lib/dashboard/client-api.ts` (typed fetch wrappers).
- Smoke: CRUD in both workspaces; survives reload; unauth API → 401.

### Phase 5 — Notes
- `app/api/notes/route.ts` + `[id]/route.ts`; `lib/sanitize.ts` — hand-rolled server-side allowlist (`b,strong,i,em,ul,li,h3,p,br,div`, strip all attributes) applied to `content_html` on write.
- `notes-view.tsx` (list+editor split) + `note-editor.tsx`: contenteditable, B/i/•/H3 toolbar (`document.execCommand`), 300ms debounced PATCH autosave with revision counter (ignore stale responses), flush on blur/note-switch/`pagehide` via `keepalive` fetch, Saved/Saving indicator. New note = POST empty first, then PATCH.
- Smoke: formatting persists; close-tab-mid-edit persists; pasted `<script>` stripped server-side (regression test).

### Phase 6 — Documents
- `app/dashboard/documents/page.tsx` + `documents-view.tsx` against existing `/api/files*` (widen list select to include `mime_type`/`file_extension` if needed for icons). Drag-drop + picker upload, signed-URL download, delete.
- Smoke: allowed ext uploads; `.exe` and >10MB rejected; download works; delete removes row + object.

### Phase 7 — Settings, mobile polish, legacy cleanup
- `app/api/categories/route.ts` POST + `[id]/route.ts` DELETE (409 `LAST_CATEGORY` if last of its ctx+kind; 409 `CATEGORY_IN_USE` if referenced — DB restrict backstops) and PATCH rename. **Rename is a sanctioned design deviation**: the prototype's Settings has no rename UI, but delete is blocked for in-use categories, so rename is the only way to fix a typo — add a click-to-edit affordance on the category chips in `settings-view.tsx`, keeping the design's chip styling.
- Mobile: swipe ctx switch + pull-to-refresh (`router.refresh()`) in shell — cuttable if fiddly.
- Rewrite `CLAUDE.md` (and README overview) to describe the v2 site: new architecture, auth model, dashboard schema, design-snapshot convention; prune stale phase tables and `RECONCILIATION.md` if obsolete.
- Separate migration `..._drop_legacy_tables.sql`: `blog_posts`, `projects`, `site_profile`, `external_links`, `contact_submissions` — **export data first, pause for user confirm**, then push. Deferrable indefinitely.
- Smoke: full phone-viewport walkthrough; last-category and in-use deletes blocked.

## Testing
- Add `vitest` devDep + `"test": "vitest run"`; wire into CI (`.github/workflows/ci.yml`).
- Unit tests: `tests/sanitize.test.ts`, `tests/redirects.test.ts` (`normalizeNextPath` open-redirect cases — now also used by the login form), category-rule guards, link URL validation.
- Rewrite `scripts/test-pages.mjs` as plain-fetch smoke (drop the unlisted playwright dep): `/` content, unauth `/dashboard` → redirect, unauth `/api/links` → 401.
- Every bug fixed during the rebuild gets a regression test in the same commit (standing rule).

## Verification (end-to-end)
1. Gates: `npm run lint`, `npx tsc --noEmit`, `npm run build`, `npm test` — all clean.
2. Manual: password login + magic-link round-trips; session survives browser restart; all five dashboard sections functional in both workspaces; theme + ctx persist; mobile layout at 375px width; anon API probes 401; anon Supabase queries return nothing.
3. Deploy preview on Vercel from the branch before merging to `main`; verify Supabase auth redirect URLs (magic-link `emailRedirectTo`) cover both preview and prod domains.

## Risks / notes
- Dual admin truth (`ADMIN_EMAIL` env vs `admin_users` row) — verified in Phase 2; document in CLAUDE.md.
- **Auth cutover ordering**: set the password and verify password login works in a Vercel preview BEFORE deleting the OAuth routes on prod, so there is never a moment with no working sign-in path. Magic link is the standing lockout backstop; Supabase Studio access is the last resort.
- **Sign-ups must be disabled in Supabase** — with password auth enabled, strangers could otherwise create (useless but polluting) accounts. Admin gating already renders them harmless, but close the door anyway.
- Legacy table drop is irreversible — export first, separate migration, explicit confirm (already gated).
- Note sanitization is self-XSS defense-in-depth; server-side mandatory.
- Swipe/pull-to-refresh gestures conflict with native scroll — sequenced last, cuttable.
- Upload extension allowlist is narrow (.pdf,.docx,.txt,.md,.sql,.py) — kept as-is per standing rules; widen later if the Documents section needs it (separate decision).
