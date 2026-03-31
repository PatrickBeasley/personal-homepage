# Phase 3 — DNS and OAuth Ownership Verification

**Status**: Operational checklist for Phase 3 completion  
**Target**: Confirm you control `patrickbeasley.com` DNS and Google OAuth credentials before production cutover  
**Timeline**: Complete this before Phase 4 or Phase 5 deployment  

---

## Why This Matters

Before configuring the production domain and OAuth callbacks, you must verify you have **actual access** to:
- **DNS management** for patrickbeasley.com (at your registrar)
- **Google Cloud Project** where the OAuth credentials live

Without this verification, production deployment will fail or become blocked.

---

## Part 1: DNS Ownership Verification

### Step 1.1 — Identify Your Registrar

Your domain `patrickbeasley.com` is registered at a domain registrar (e.g., GoDaddy, Namecheap, Route 53, Google Domains, etc.).

- [ ] **Action**: Confirm which registrar you use for patrickbeasley.com
  - Check email confirmation of domain purchase
  - Or search your domain at https://lookup.icann.org/
- [ ] **Evidence**: Write down the registrar name and login URL
  - Registrar: ___________________
  - Date of verification: ___________

### Step 1.2 — Test DNS Access

Verify you can log in to the registrar dashboard and **view/modify DNS records**.

- [ ] **Action**: Log in to your registrar account
  - Navigate to the DNS management panel for patrickbeasley.com
  - You should see a list of DNS records (A, CNAME, MX, TXT, etc.)
- [ ] **Evidence**: Screenshot of DNS records page (name, TTL, type, value visible)
  - If you don't see DNS records, check:
    - That DNS is managed at the registrar (vs. delegated to another service)
    - Your account permissions (may need admin/owner access, not just domain viewer)
    - Whether 2FA or IP whitelisting is blocking login

### Step 1.3 — Verify DNS Points to Vercel (If Already Deployed)

If you've already deployed to Vercel with a temporary domain, check that DNS is set up correctly.

- [ ] **Action**: Verify the A or CNAME record for patrickbeasley.com points to Vercel
  - Expected for Vercel: CNAME to `cname.vercel-dns.com` or A record to Vercel's IP
  - Or query directly:
    ```bash
    nslookup patrickbeasley.com
    ```
  - Should resolve to Vercel's nameservers or IP
- [ ] **Evidence**: Output of `nslookup` or registrar DNS panel showing Vercel configuration

### Step 1.4 — Document DNS Contact

Ensure the registrar account email is accessible and the account has recovery options.

- [ ] **Action**: Confirm registrar account contact email matches your fallback recovery email
- [ ] **Action**: Verify account has a recovery phone number or backup email set (for 2FA reset if needed)
- [ ] **Evidence**: Registrar account settings page showing verified recovery method

---

## Part 2: Google OAuth Ownership Verification

### Step 2.1 — Identify Your Google Cloud Project

The OAuth credentials for Supabase Auth come from a **Google Cloud Project** you created and control.

- [ ] **Action**: Confirm which Google Cloud Project contains the OAuth client
  - Check your `.env.local` or Vercel environment for `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - Log in to Google Cloud Console: https://console.cloud.google.com
  - You should see the project in your project list (e.g., "personal-homepage", "patrickbeasley", etc.)
- [ ] **Evidence**: Screenshot of Google Cloud Project selection showing the project name
  - Project Name: ___________________
  - Project ID: ___________________
  - Date of verification: ___________

### Step 2.2 — Verify OAuth Consent Screen & Credentials

Verify you can access and modify the OAuth 2.0 credentials.

- [ ] **Action**: In the Google Cloud Project, navigate to:
  ```
  APIs & Services > OAuth consent screen
  ```
  - Confirm the app name, support email, and developer contact match your identity
- [ ] **Action**: Navigate to:
  ```
  APIs & Services > Credentials
  ```
  - Look for the OAuth 2.0 Client ID for your app
  - Confirm the **Authorized redirect URIs** include:
    ```
    https://[supabase-project-ref].supabase.co/auth/v1/callback
    ```
  - Current Supabase callback URL: ___________________
- [ ] **Evidence**: Screenshot of OAuth 2.0 Client credentials page showing:
  - Client ID visible
  - Client Secret field (can be copied)
  - Authorized redirect URIs list

### Step 2.3 — Test OAuth Credentials Access

Verify you can retrieve and manage the OAuth secrets.

- [ ] **Action**: In the Credentials page, click your OAuth 2.0 Client ID entry
  - You should see options to:
    - View the Client ID
    - Reset/regenerate the Client Secret
    - Add/modify Authorized redirect URIs
    - Delete the credentials (don't do this!)
- [ ] **Action**: Confirm you understand how to update **Authorized redirect URIs** if the domain changes
  - Production URI will be: `https://patrickbeasley.com/auth/callback`
  - You should be able to add this after DNS is live
- [ ] **Evidence**: Screenshot showing the OAuth 2.0 Client ID details panel with edit/delete options visible

### Step 2.4 — Verify Google Cloud Project Permissions

Ensure your account has the required permissions to manage OAuth credentials.

- [ ] **Action**: In the Google Cloud Project, navigate to:
  ```
  IAM & Admin > IAM
  ```
  - Confirm your email is listed as a **Project Owner** or **Editor**
  - A **Viewer** role would NOT allow you to modify OAuth credentials
- [ ] **Evidence**: Screenshot of IAM page showing your account with sufficient role
  - Your role: ___________________

### Step 2.5 — Document Google Cloud Contact

Ensure the project owner account is secure and recoverable.

- [ ] **Action**: Confirm your Google account has:
  - A recovery email set (to unlock account if 2FA fails)
  - A recovery phone number (for passwordless sign-in or account recovery)
  - 2FA or passkey enabled (recommended for security)
- [ ] **Evidence**: Screenshot of Google Account security settings showing recovery methods

---

## Part 3: Production Cutover Readiness Checklist

Once both Part 1 (DNS) and Part 2 (OAuth) are verified, you're ready to configure production.

### Pre-Cutover Setup (Do NOT do this yet, save for Phase 5)

- [ ] Add `patrickbeasley.com` custom domain to Vercel project
  - Vercel will provide DNS instructions
  - Update DNS registrar with the provided A/CNAME record
  - Wait for DNS propagation (5-15 minutes)
  - Vercel will auto-provision SSL certificate

- [ ] Update Google OAuth credentials
  - Add `https://patrickbeasley.com/auth/callback` to Authorized redirect URIs
  - Keep the Supabase callback URI as well (for staging/fallback)

- [ ] Update Vercel environment variables
  - Keep `NEXT_PUBLIC_SUPABASE_URL` pointing to production Supabase
  - Update any domain-specific configs if needed

---

## Sign-Off

**Verification Summary**

| Item | Status | Notes |
|------|--------|-------|
| DNS Registrar Access | [ ] | _________________ |
| DNS Records Readable | [ ] | _________________ |
| Google Cloud Project Access | [ ] | _________________ |
| OAuth 2.0 Credentials Visible | [ ] | _________________ |
| Can Modify OAuth URIs | [ ] | _________________ |
| Google Cloud IAM Sufficient | [ ] | _________________ |

**Completed By**: _____________________  
**Date**: _____________________  
**Next Phase**: Ready for Phase 4 / Phase 5 production deployment

---

## Troubleshooting

### Cannot Access DNS Registrar
- Check that your registrar account email is correct (may have changed)
- Use "Forgot Password" or account recovery if locked out
- Contact registrar support if you've lost access
- If domain was registered under different email, request ownership transfer

### Cannot Find Google Cloud Project
- Confirm you're logged in with the correct Google account
- Check https://console.cloud.google.com/cloud-resource-manager
- If the project was created by someone else, ask for Owner/Editor IAM access
- If lost, you can create a new Google Cloud Project and set up new OAuth credentials

### OAuth Credentials Look Different
- Google Cloud occasionally reorganizes the console UI
- Current path is: **APIs & Services > Credentials**, then look for "OAuth 2.0 Client IDs"
- If you can't find them, check under **APIs & Services > Library** to ensure OAuth2 API is enabled
- Or create a new OAuth 2.0 Client ID from scratch

---

## Related

- [Release Readiness Skill](../.github/skills/release-readiness/SKILL.md) — Production deployment checklist (includes DNS/OAuth validation)
- [Decision Records](./ai/decision-records.md) — "Domain and OAuth Ownership Assumption" (Section 2026-03-30)
- Initial OAuth setup: [Project Bootstrap SKILL](../.github/skills/project-bootstrap/SKILL.md) Stage 3, Item 9

