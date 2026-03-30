# Copilot Instructions — personal-homepage

## Purpose and Scope
This workspace is the personal homepage for patrickbeasley.com, built with Next.js (App Router, TypeScript), Tailwind CSS, Supabase (Postgres + Auth + Storage), and deployed on Vercel. These instructions apply to all AI-assisted work in this repository.

## Non-Negotiables
- Never commit secrets, tokens, or credentials. All secrets go in `.env.local` (git-ignored) or Vercel environment variables.
- All auth-protected routes and API handlers must verify the session before acting.
- File uploads must be validated server-side: allowed extensions (`.pdf`, `.docx`, `.txt`, `.md`, `.sql`, `.py`) and max 10MB per file.
- Every bug fix must include a regression test.
- Do not skip lint, typecheck, or build verification after changes.

## Code Quality Defaults
- TypeScript strict mode is enabled — no `any` unless justified with a comment.
- Prefer server components and server-side data fetching over client-side where possible.
- Keep components small and focused. Extract reusable logic into `lib/` utilities.
- Follow existing naming conventions: `kebab-case` for files, `PascalCase` for components, `camelCase` for functions/variables.
- Remove dead code and unused imports before committing.

## Planning vs Implementation Behavior
- When asked to plan: identify risks, list open decisions, and propose an approach before writing code.
- When asked to implement: write the minimal diff needed, verify it, and report what was changed and tested.
- When requirements are ambiguous: state the assumption, implement it, and flag it for review.

## Security and Secrets Handling
- Use `NEXT_PUBLIC_` prefix only for values that are safe to expose to browsers.
- Service-role Supabase keys must only be used in server-side code (`app/api/`, server components, route handlers).
- Validate and sanitize all user-supplied input at the API boundary.

## Verification Expectations
- Run `npm run lint` and `npm run build` after any non-trivial change.
- For schema changes, include migration SQL and RLS policy updates.
- For auth changes, verify both authenticated and unauthenticated paths.

## Output Formatting
- Keep explanations brief. Lead with what changed and why, not a summary of what was read.
- Use inline code for file paths and symbol names.
- Provide a bulleted list of follow-up tasks if any dependencies remain unresolved.

## Escalation Rules
- If a change would affect the production database schema, pause and confirm before executing.
- If a change modifies auth or RLS policies, flag it explicitly for review before merging.
