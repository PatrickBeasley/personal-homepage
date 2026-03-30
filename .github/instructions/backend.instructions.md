---
applyTo: "app/api/**,lib/**,supabase/**"
---

# Backend Instructions — personal-homepage

## API Design Conventions
- All API routes live under `app/api/` and are route handlers (`route.ts`).
- Return consistent JSON shapes: `{ data, error }` where `error` is null on success.
- Use HTTP status codes correctly: 200 OK, 201 Created, 400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found, 500 Internal Server Error.
- Never expose internal error details to the client — log server-side, return generic messages.

## Auth and Authorization Rules
- Every non-public API route must verify the Supabase session at the top of the handler.
- Use the server-side Supabase client (`createServerClient`) — never the browser client in server code.
- Admin-only routes must check the authenticated user's email against the admin allowlist before proceeding.
- Return 401 for missing session, 403 for insufficient permissions.

## File Upload Rules
- Allowed extensions: `.pdf`, `.docx`, `.txt`, `.md`, `.sql`, `.py`
- Max file size: 10MB per file
- Validate both file extension AND MIME type server-side — do not trust client-supplied content-type alone.
- Sanitize filenames: strip path separators, null bytes, and non-ASCII characters before storing.
- Store binaries in Supabase Storage; store metadata (name, size, mime_type, owner_id, visibility, created_at) in Postgres.

## Database Migration Standards
- All schema changes go in `supabase/migrations/` as timestamped SQL files.
- Every migration must include a rollback comment or down-migration SQL block.
- Run `supabase db push` locally to verify before committing.
- Never modify migration files that have already been applied to production — create a new migration instead.

## Row Level Security
- RLS must be enabled on every table.
- Default deny: if no policy matches, the operation must fail.
- Public tables (projects, blog_posts, profile) get `SELECT` policies for anon role.
- Write operations (INSERT, UPDATE, DELETE) require authenticated admin role.

## Error Handling and Logging
- Catch all async errors with try/catch in route handlers.
- Log errors server-side with sufficient context (route, user id if available, error message).
- Do not `console.log` in production — use a structured logger or Vercel logs.

## Performance and Caching
- Use `unstable_cache` or `next/cache` for Supabase reads that do not change per-request.
- Set appropriate `revalidate` values on static or semi-static pages.
- Avoid N+1 queries — join or batch-fetch related data.
