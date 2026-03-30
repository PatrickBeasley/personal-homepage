---
name: project-bootstrap
description: Use when initializing a new project module or service from scratch — repo scaffold, env config, CI baseline, and docs setup. Trigger phrases: bootstrap, new project, initialize project, scaffold.
---

# Project Bootstrap Skill

## Use When
- Starting a new project or adding a major new service/module
- Setting up a new developer environment for this project
- Reproducing the project setup from scratch

## Required Inputs
- Project name and description
- Target stack (already defined: Next.js, Supabase, Vercel, TypeScript, Tailwind)
- Deployment target (Vercel)
- Auth provider (Supabase + Google OAuth)

## Workflow Stages

### Stage 1 — Repository
- [ ] Create GitHub repo with description and license
- [ ] Clone locally and verify remote
- [ ] Confirm `.gitignore` covers `node_modules`, `.env*`, `.next`, `supabase/.branches`

### Stage 2 — App Scaffold
- [ ] Run `create-next-app` with TypeScript, ESLint, Tailwind, App Router
- [ ] Verify `npm run build` passes on clean scaffold
- [ ] Add `@supabase/supabase-js` and `@supabase/ssr` dependencies

### Stage 3 — Environment Setup
- [ ] Create `.env.local` from `.env.example` template
- [ ] Add: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_EMAIL`
- [ ] Add same vars to Vercel project environment settings
- [ ] Verify `.env.local` is git-ignored

### Stage 4 — AI Docs
- [ ] Create all `.github/` AI markdown files with starter outlines
- [ ] Verify frontmatter is valid YAML
- [ ] Commit AI docs as first substantive commit

### Stage 5 — CI Baseline
- [ ] Add GitHub Actions workflow: lint, typecheck, build on push/PR
- [ ] Verify workflow passes on initial commit

### Stage 6 — Tracking
- [ ] Create GitHub Issues for all planned tasks and research items
- [ ] Create GitHub Project board with columns: Backlog, In Progress, Blocked, Done
- [ ] Add labels: `task`, `research`, `blocked`, `security`, `infra`, `bug`, `enhancement`

## Artifacts Generated
- Scaffolded Next.js app
- `.env.example` with all required variable names (no values)
- `.github/` AI instruction and prompt files
- GitHub Actions CI workflow
- GitHub Issues and Project board

## Verification Checklist
- [ ] `npm run lint` passes
- [ ] `npm run build` passes
- [ ] No secrets in git history (`git log --all -p | Select-String "ghp_|sk_|secret"`)
- [ ] Vercel auto-deploy triggers on push to main

## Failure Handling
- If `create-next-app` fails midway, delete the directory and retry with `--yes` flag
- If Vercel deploy fails, check environment variables match `.env.example` names exactly
- If Supabase connection fails, verify `NEXT_PUBLIC_SUPABASE_URL` does not have a trailing slash
