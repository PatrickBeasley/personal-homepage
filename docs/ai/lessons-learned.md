# Lessons Learned — personal-homepage

This file is the operational memory for AI-assisted development on this project.  
**Update rule**: add an entry at the end of every phase, and within 48 hours of any incident or repeated mistake.  
**Promotion rule**: if a lesson appears twice, promote it into the relevant `.instructions.md`, `.prompt.md`, or `SKILL.md`.

---

## Entry Template
```
## [DATE] — [Short Title]
**Phase/Context**: 
**What worked**: 
**What failed**: 
**Root cause**: 
**Reusable rule**: 
**Action to encode**: (instruction / prompt / skill / none)
```

---

## 2026-03-29 — Project Initialization
**Phase/Context**: Action 0 + Action 1 — repo creation and AI docs scaffold  
**What worked**: Using `gh` CLI with a PAT for repo creation; `create-next-app` with `--yes` flag for non-interactive scaffold  
**What failed**: Initial PAT was missing `read:org` scope — required regeneration  
**Root cause**: GitHub CLI requires `read:org` scope even for personal account operations  
**Reusable rule**: When generating a GitHub PAT for `gh` CLI, always include `repo`, `workflow`, `read:org`, and `project` scopes  
**Action to encode**: Add scope checklist to `project-bootstrap/SKILL.md` Stage 1

## 2026-03-30 — Bootstrap Credential Hygiene
**Phase/Context**: Resume after initial scaffold and GitHub setup  
**What worked**: Temporarily embedding the PAT in the git remote unblocked a non-interactive push when credential helper behavior was inconsistent  
**What failed**: `.env.example` was ignored by the default `.env*` gitignore rule, and the temporary credentialed remote needed immediate cleanup  
**Root cause**: Default scaffold ignore rules were broader than needed, and git credential behavior was not fully consistent across terminals  
**Reusable rule**: If a token is ever embedded in a remote URL to unblock automation, reset the remote to a clean URL immediately after push; also verify `.env.example` is force-added or explicitly unignored when the repo ignores `.env*`  
**Action to encode**: Update bootstrap guidance and repo instructions to check `.env.example` staging and remote URL cleanup

## 2026-03-30 — Migration Apply Order Matters
**Phase/Context**: Phase 1 schema apply against remote Supabase database  
**What worked**: Applying migrations with `supabase db push --db-url ... --include-all` and validating with a dry run before and after apply  
**What failed**: Initial migration run failed because `public.is_admin()` referenced `public.admin_users` before the table existed  
**Root cause**: SQL function dependency order in migration file did not match Postgres validation behavior  
**Reusable rule**: In initial schema migrations, create dependency tables before creating functions or policies that reference them  
**Action to encode**: Keep dependency-order checks in migration review prompt and run dry-run before first apply

## 2026-03-30 — OAuth Provider Save Is Not Enough Without Runtime Verification
**Phase/Context**: Phase 2 Google OAuth provider setup and callback validation  
**What worked**: Verifying provider status through `/auth/v1/settings` with anon API key and then running end-to-end sign-in via `/auth/login`  
**What failed**: Assuming provider config was active before checking runtime settings led to a false-complete state  
**Root cause**: Dashboard save state was not validated against the live auth service configuration  
**Reusable rule**: After provider setup, always verify `external.google=true` from auth settings and perform one full login callback test before closing auth tasks  
**Action to encode**: Add provider-status and callback test checklist to bootstrap skill
