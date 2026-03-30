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
