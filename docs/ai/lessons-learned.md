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

## 2026-03-31 — Dev Server Startup Fails with "Couldn't Find App Directory" Despite Directory Existing
**Phase/Context**: Phase 3 — Attempted to start dev server for Playwright testing validation  
**What worked**: Verified that `app/` directory exists at correct location via Node fs API and directory listing (`Get-ChildItem app/` showed the folder)  
**What failed**: `npm run dev`, `npx next dev`, and `npx next dev --port 3000` all fail with error "Couldn't find any `pages` or `app` directory"  
**Root cause**: Unknown — likely one of: (a) cached build state issue, (b) TypeScript compiler not finding app dir during sourcemap/type generation, (c) environment variable issue, (d) Next.js 16 specific edge case with Windows paths  
**Reusable rule**: If dev server fails to find app directory despite its existence, try: 1) `rm -r .next .turbo` to clean build cache, 2) verify CWD is correct with `pwd`, 3) check tsconfig.json includes app in compilerOptions, 4) try `npx tsc --noEmit` to validate TypeScript, 5) check for .vercelignore or next.config issues, 6) if persists, this may indicate a deeper toolchain issue needing manual troubleshooting or rebuild  
**Action to encode**: Add "dev server startup troubleshooting" section to `backend.instructions.md` with the above checklist

## 2026-03-31 — Phase 4: Admin Dashboard and File Upload Implementation
**Phase/Context**: Phase 4 — Admin dashboard with file upload/download/management  
**What worked**: Creating modular API route handlers with shared admin guard middleware (`requireAdminAuth`); separating concerns into library function for reuse; using Supabase Storage for files with database metadata tracking; reactive React component with tabbed interface for file and contact submission management; error handling with clear user feedback  
**What failed**: Initial UUID import was incorrect (tried to import `v4` from `crypto` module)  
**Root cause**: Crypto module doesn't export UUID v4 — should use `crypto.randomUUID()` instead  
**Reusable rule**: For file uploads, always validate extension AND MIME type server-side; separate storage operations from metadata tracking so cleanup is consistent if one fails; use `crypto.randomUUID()` for Node.js 16+, or import from `uuid` package for compatibility  
**Action to encode**: Update `backend.instructions.md` with file upload validation pattern and middleware example

## 2026-03-31 — .mjs Files Cannot Use TypeScript Type Annotations
**Phase/Context**: Post-Phase 4 — Verification of script files before use  
**What worked**: Syntax checking with `node --check` identified the invalid script syntax  
**What failed**: `scripts/test-pages.mjs` contained TypeScript type annotations (`: Browser`, `: Page`, `: string[]`) which are not valid in plain JavaScript ES modules  
**Root cause**: File was written with TypeScript syntax despite being a `.mjs` (plain JavaScript) file; also included documentation saying to run with `npx ts-node` when the file is ES module JavaScript  
**Reusable rule**: .mjs files are plain JavaScript ES modules and do NOT support TypeScript syntax. If type annotations are needed, either: (a) rename to `.ts` and run with TypeScript compiler/loader, or (b) keep as `.mjs` and use JSDoc comments for type hints instead of TypeScript annotations. Always verify execution instruction matches file type (`node` for .mjs, `ts-node` for .ts).  
**Action to encode**: Add to `frontend.instructions.md` or create a `.mjs` file guide clarifying the distinction between .ts (TypeScript) and .mjs (plain ES module) files

## 2026-03-31 — Dev Server "Couldn't Find App Directory" Was a Wrong Working Directory
**Phase/Context**: Phase 5 — Attempting to start dev server for Playwright smoke tests  
**What worked**: Running `npx next dev` from `C:\Projects\personal-homepage` — server started in 443ms  
**What failed**: All prior attempts ran `npm run dev` / `npx next dev` from `C:\Projects` (workspace root), not the Next.js project subdirectory  
**Root cause**: VS Code workspace is rooted at `C:\Projects` but the Next.js app lives at `C:\Projects\personal-homepage`; terminal `cwd` defaulted to the workspace root, not the project subfolder  
**Reusable rule**: Always run Next.js CLI commands (`npm run dev`, `npm run build`, `npx next`) from the directory containing `package.json` and `next.config.ts`. In a multi-project workspace, that is the subdirectory, not the workspace root. Verify with `Get-Location` before running.  
**Action to encode**: Add CWD check to quick-start instructions; update dev server troubleshooting entry to include "verify cwd matches package.json location" as the first diagnostic step
