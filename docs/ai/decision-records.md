# AI Decision Records — personal-homepage

This file tracks significant decisions made about AI workflows, tooling, and conventions on this project.  
**Format**: one entry per decision, newest at the bottom. Mark superseded decisions clearly.

---

## Decision Template
```
## [DATE] — [Decision Title]
**Status**: Active | Superseded by [date/title]
**Context**: 
**Decision**: 
**Alternatives considered**: 
**Consequences**: 
**Follow-up tasks**: 
```

---

## 2026-03-29 — AI Markdown File Structure
**Status**: Active  
**Context**: Project uses AI assistance heavily; needed a standard way to capture and reuse learnings across phases and future projects.  
**Decision**: Adopt the VS Code Copilot customization primitive set: `copilot-instructions.md` for always-on baseline, `.instructions.md` files scoped by `applyTo` glob, `.prompt.md` for reusable task prompts, `SKILL.md` for multi-step workflows, and `docs/ai/` for human-maintained knowledge capture.  
**Alternatives considered**: Single monolithic instructions file (too large, hard to maintain); external wiki (not co-located with code).  
**Consequences**: AI files must be updated at every phase close gate. Maintenance cadence: monthly review, post-incident within 48h, quarterly cleanup.  
**Follow-up tasks**: Add AI docs update as required step in each phase definition.

---

## 2026-03-29 — Admin Authentication Method
**Status**: Active  
**Context**: Site needs a protected admin area for content management and file uploads.  
**Decision**: Use Supabase Auth with Google OAuth. Admin access restricted to an explicit email allowlist (`ADMIN_EMAIL` env var). Single admin account at launch.  
**Alternatives considered**: Magic link email (less friction but less familiar); GitHub OAuth (fewer people have it as primary identity).  
**Consequences**: Admin must have a Google account. If admin email changes, `ADMIN_EMAIL` env var must be updated in Vercel and Supabase RLS policies reviewed.  
**Follow-up tasks**: Document admin email change runbook in `docs/` once auth is implemented.

---

## 2026-03-29 — File Upload Policy
**Status**: Active  
**Context**: Personal homepage needs admin-only file upload/download with controlled scope.  
**Decision**: Allowed extensions: `.pdf`, `.docx`, `.txt`, `.md`, `.sql`, `.py`. Max 10MB per file. All files private by default; public visibility must be explicitly toggled per file. Admin-only uploads via Google-authenticated session.  
**Alternatives considered**: Broader extension list (higher risk surface); public-by-default (accidental exposure risk).  
**Consequences**: Server-side validation required for both extension and MIME type. Supabase Storage bucket must be private. Signed URLs with short TTL for downloads.  
**Follow-up tasks**: Implement MIME+extension validation in upload API route; encode rules in `backend.instructions.md`.

---

## 2026-03-31 — Admin Dashboard Architecture
**Status**: Active  
**Context**: Phase 4 required building an admin dashboard for file management and contact form submission handling.  
**Decision**: Implement admin routes and API endpoints with a shared `requireAdminAuth` middleware that verifies session and admin email. Client-side dashboard is a React component (`"use client"`) with tabbed interface for files and contact submissions. File operations (upload, delete, visibility toggle) use separate HTTP methods on a polymorphic `/api/files/[id]` route. Contact submissions are read-only to admins with status-update capability.  
**Alternatives considered**: Server-side rendered admin dashboard (less interactive); separate file and contact endpoints (more routes to manage).  
**Consequences**: All admin API routes are protected by `requireAdminAuth` which must be called first in each handler. The middleware pattern is reusable for future admin endpoints. Client state is local (React useState) rather than server-cached, so list refreshes after mutations.  
**Follow-up tasks**: Implement optimistic UI updates if performance becomes an issue; consider adding confirmation dialogs for destructive operations; add server-side logging of admin actions for audit trail.

---

## 2026-03-30 — Phase 0 Security and Secret Handling Policy
**Status**: Active  
**Context**: Phase 0 requires a concrete security baseline before Vercel, Supabase, and Google OAuth setup.  
**Decision**: Admin access remains single-user at launch and is controlled by the `ADMIN_EMAIL` environment variable. Files are private by default and require an explicit visibility toggle to become public. Secrets live only in local `.env.local`, Vercel environment variables, or Supabase configuration; they must never appear in committed files, issue bodies, or git remote URLs after use. Upload endpoints will enforce extension allowlist, MIME verification, filename sanitization, and a baseline rate limit even for admin-only traffic.  
**Alternatives considered**: Multi-admin role model at launch (more complexity); public-by-default files (higher accidental exposure risk); storing secrets in repo-level encrypted files (unnecessary for current scope).  
**Consequences**: Auth and storage code can assume least privilege and explicit allowlists. Operational steps must include credential hygiene, including resetting remotes if a token is embedded temporarily.  
**Follow-up tasks**: Implement admin allowlist check in auth guard; add upload rate limiting; document token hygiene in bootstrap guidance.

---

## 2026-03-30 — Data Classification, Retention, and Launch Policy Pages
**Status**: Active  
**Context**: The site will store public content, contact submissions, and private admin-managed files, so data boundaries need to be explicit before schema work starts.  
**Decision**: Public data includes homepage content, projects, blog posts, external project links, and only files explicitly marked public. Private data includes contact form submissions, unpublished content, admin audit metadata, and all storage objects without a public toggle. Sensitive data includes all credentials, OAuth secrets, service-role keys, and any signed URL generation inputs. Contact submissions will be retained for 12 months by default unless legal or operational needs change. A privacy policy is required before production launch; terms of use can remain lightweight but should include a download/use disclaimer if public files are offered.  
**Alternatives considered**: Indefinite retention (higher privacy burden); no privacy page at launch (not appropriate once contact data is stored).  
**Consequences**: Schema and RLS can separate public tables from private tables cleanly. Production launch is gated on a privacy policy page and retention wording.  
**Follow-up tasks**: Reflect public/private split in schema design; add retention note to contact-submission implementation; create privacy page before launch.

---

## 2026-03-30 — Observability, Backup Targets, and Budget Guardrails
**Status**: Active  
**Context**: Phase 0 includes selecting a practical operations baseline that fits a personal site without over-engineering.  
**Decision**: Use Sentry for application error tracking and UptimeRobot for external uptime checks, with Vercel native logs used for deployment/runtime diagnostics. Set baseline recovery targets to RPO 24 hours and RTO 8 hours for launch. Treat Supabase automated backups and periodic exports of critical content/file metadata as the minimum backup posture. Keep the initial deployment on Vercel Hobby and Supabase free or starter tier, with a monthly review of storage growth, bandwidth, and runtime usage before any paid upgrade.  
**Alternatives considered**: Vercel-only monitoring (weaker application-level error workflow); enterprise-grade monitoring stack (too heavy for current scope).  
**Consequences**: Phase 1 and Phase 5 work can integrate a specific alerting stack rather than leaving monitoring undefined. Restore expectations are clear enough for a personal site without promising enterprise SLA behavior.  
**Follow-up tasks**: Add Sentry and uptime-monitoring setup tasks; document manual backup/export steps once schema is in place.

---

## 2026-03-30 — Domain and OAuth Ownership Assumption
**Status**: Active  
**Context**: Platform setup depends on control of the production domain and OAuth provider configuration, but those are external operational assets.  
**Decision**: Proceed under the assumption that the project owner controls `patrickbeasley.com` DNS and can manage the Google OAuth application needed for Supabase Auth production callbacks. Treat explicit verification of that access as an operational checklist item before production configuration is applied.  
**Alternatives considered**: Blocking all setup until ownership is manually re-confirmed (slows progress without changing technical design).  
**Consequences**: Build work can continue, but the Phase 0 operational verification issue stays open until DNS and OAuth access are confirmed.  
**Follow-up tasks**: Confirm registrar/DNS access and Google Cloud project ownership before Vercel custom domain and OAuth callback setup.

---

## 2026-03-30 — Phase 1 Platform Bootstrap Completion Baseline
**Status**: Active  
**Context**: Phase 1 targeted platform readiness: Vercel deployment, Supabase project creation, base schema migration, and env wiring for local + deployed environments.  
**Decision**: Treat Phase 1 implementation as complete once the repo is deployed to Vercel, Supabase project is created, initial migration `202603300001_initial_schema.sql` is applied, and required environment values are available in local runtime and deployment settings.  
**Alternatives considered**: Keeping Phase 1 open until custom domain cutover (mixes platform bootstrap with DNS operations tracked separately).  
**Consequences**: Remaining domain verification work can be tracked independently while Phase 2 auth and app feature work proceeds.  
**Follow-up tasks**: Keep DNS/OAuth ownership verification open as a separate operational gate before production launch.

---

## 2026-03-30 — Phase 2 Auth Foundation Completion Baseline
**Status**: Active  
**Context**: Phase 2 required server-side OAuth flow support, secure redirect handling, and admin access bootstrapping for RLS-based authorization.  
**Decision**: Mark auth foundation complete when Google provider is enabled in Supabase, callback/login routes are implemented in app code, sign-in is validated successfully, and the admin email is inserted into `public.admin_users`.  
**Alternatives considered**: Delaying completion until full admin dashboard exists (moves goalposts into Phase 4 scope).  
**Consequences**: Auth is ready for protected routes and admin features; dashboard and content workflows can proceed without revisiting provider bootstrap.  
**Follow-up tasks**: Add protected admin route guards and session-aware UI as Phase 4 implementation tasks.
