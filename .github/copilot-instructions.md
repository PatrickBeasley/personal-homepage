# Copilot Instructions — personal-homepage

## Purpose and Scope
This workspace is the personal homepage for patrickbeasley.com, built with Next.js (App Router, TypeScript), Tailwind CSS, Supabase (Postgres + Auth + Storage), and deployed on Vercel. These instructions apply to all AI-assisted work in this repository.

## Non-Negotiables
- Never commit secrets, tokens, or credentials. All secrets go in `.env.local` (git-ignored) or Vercel environment variables.
- All auth-protected routes and API handlers must verify the session before acting.
- Admin-only behavior must key off the `ADMIN_EMAIL` allowlist on the server side; client-side gating alone is never sufficient.
- File uploads must be validated server-side: allowed extensions (`.pdf`, `.docx`, `.txt`, `.md`, `.sql`, `.py`) and max 10MB per file.
- Contact submissions are private operational data and must not be exposed to public queries or logs.
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
- Remove credentials from git remotes immediately after any temporary token-auth workaround.
- Treat uploaded files as private by default and generate signed URLs for non-public downloads.
- Add a baseline rate limit to contact and upload endpoints even when they are admin-only.

## Verification Expectations
- Run `npm run lint` and `npm run build` after any non-trivial change.
- For schema changes, include migration SQL and RLS policy updates.
- For auth changes, verify both authenticated and unauthenticated paths.
- For web page changes, use Playwright MCP automation to test rendering, navigation, and console errors.

## Browser Testing with Playwright MCP
- **Enabled**: Playwright MCP is the standard tool for web page validation during development.
- **When to use**: After creating or modifying any page, route, or layout component.
- **Quick reference**:
  ```
  // Start browser
  action=start, browser=chrome, headless=true
  
  // Navigate and test
  action=navigate, url=http://localhost:3000/resume
  
  // Check console messages
  action=console_messages, level=error
  
  // Take screenshot (if problems found)
  action=screenshot
  
  // Close when done
  action=close
  ```
- **Test steps**:
  1. Start Playwright: `action=start, browser=chrome, headless=true`
  2. Navigate to each modified page on localhost:3000 or deployed URL
  3. Validate: page title, metadata tags (og:, twitter:), responsive design, navigation links
  4. Check console for errors/warnings using `console_messages` action
  5. Screenshot if validation reveals issues
  6. Close browser when complete: `action=close`
- **Pages to test**: Homepage, all public pages, auth routes, error pages
- **Focus areas**: Hydration issues, broken links, missing metadata, dark mode support, layout shifts

## Output Formatting
- Keep explanations brief. Lead with what changed and why, not a summary of what was read.
- Use inline code for file paths and symbol names.
- Provide a bulleted list of follow-up tasks if any dependencies remain unresolved.

## Knowledge Capture and Documentation
- **Automatic documentation**: Whenever a bug, issue, or problem is identified and fixed, automatically document the lesson in `docs/ai/lessons-learned.md` with root cause and reusable rule.
- **Promotion to instructions**: If a lesson is actionable and should prevent future mistakes, also update the relevant `.instructions.md` file (e.g., `backend.instructions.md`, `frontend.instructions.md`).
- **When to document**: Immediately after fixing issues, not only when explicitly prompted. Problems that have a root cause worth encoding should be captured.
- **Update decision-records**: If a decision is made during implementation that affects future work, document it in `docs/ai/decision-records.md`.

## Escalation Rules
- If a change would affect the production database schema, pause and confirm before executing.
- If a change modifies auth or RLS policies, flag it explicitly for review before merging.
- If a production credential, OAuth secret, or signed URL handling flow changes, flag it explicitly for review before merging.
