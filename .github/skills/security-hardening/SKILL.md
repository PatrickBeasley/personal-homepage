---
name: security-hardening
description: Use when performing a security review pass on auth, permissions, file handling, secrets, or API endpoints. Trigger phrases: security review, security pass, security audit, harden, check permissions.
---

# Security Hardening Skill

## Use When
- Before merging any auth, file upload/download, or API change
- After adding a new route or admin feature
- As part of Phase 4 (Admin + File Upload/Download) close gate
- On demand for a focused security review

## Threat Checklist (check all before marking done)

### Authentication and Authorization
- [ ] All protected routes verify session before any logic executes
- [ ] Admin routes check email against allowlist after session check
- [ ] No route relies solely on client-supplied user ID — always verify from session
- [ ] Auth callbacks use state parameter to prevent CSRF on OAuth flow

### File Upload Controls
- [ ] Extension whitelist enforced: `.pdf`, `.docx`, `.txt`, `.md`, `.sql`, `.py`
- [ ] MIME type verified server-side (do not trust `Content-Type` header alone)
- [ ] File size enforced: max 10MB per upload
- [ ] Filenames sanitized: no path traversal characters, no null bytes
- [ ] Files stored in Supabase Storage, not served from the app server

### File Download Controls
- [ ] Private files served via signed URLs with short TTL (≤1 hour)
- [ ] Public files explicitly flagged — private by default
- [ ] Download endpoint verifies user has access before generating signed URL

### Secrets and Configuration
- [ ] No secrets in source code or git history
- [ ] `SUPABASE_SERVICE_ROLE_KEY` only used in server-side code
- [ ] `NEXT_PUBLIC_` prefix only on values safe for browser exposure
- [ ] `.env.local` is in `.gitignore`

### API and Input Validation
- [ ] All user input validated and sanitized at the API boundary
- [ ] SQL queries use parameterized values — no string concatenation with user input
- [ ] Rate limiting applied to contact form and file upload endpoints
- [ ] Error responses do not expose stack traces or internal details

### Supabase RLS
- [ ] RLS enabled on all tables
- [ ] Default deny confirmed: test unauthenticated SELECT/INSERT on each table
- [ ] Storage bucket policies match file visibility settings (private by default)

### HTTP Security Headers
- [ ] `Content-Security-Policy` configured in `next.config.ts`
- [ ] `X-Frame-Options: DENY` set
- [ ] `X-Content-Type-Options: nosniff` set
- [ ] `Referrer-Policy: strict-origin-when-cross-origin` set

## Verification Steps
1. Run `npm run build` — no type errors
2. Test unauthenticated access to each protected route — expect 401/403
3. Test upload with disallowed extension — expect rejection with clear error
4. Test upload exceeding 10MB — expect rejection
5. Confirm signed download URL expires after TTL

## Lessons Learned Integration
After each security pass, update `docs/ai/lessons-learned.md` with any new patterns or gaps found.
