---
name: code-review
description: Use when reviewing code for bugs, security risks, and missing tests. Invoke with: /code-review
---

# Code Review

## Review Scope
Specify what to review:
- PR/branch name or specific files
- Context: what does this change do?
- Known risks to watch for (optional)

## Severity Rubric

| Severity | Meaning |
|----------|---------|
| Critical | Security vulnerability, data loss, auth bypass — must fix before merge |
| High | Functional bug, missing auth check, no regression test for bug fix |
| Medium | Performance issue, poor error handling, confusing logic |
| Low | Style, naming, minor improvements — fix or note as follow-up |

## Required Evidence
For each finding, provide:
- File and line reference
- Severity level
- Description of the problem
- Suggested fix or direction

## Focus Areas (always check)
- [ ] Auth and permission checks on every protected route/action
- [ ] Input validation at API boundaries
- [ ] No secrets or credentials in code
- [ ] Error states handled — no silent failures
- [ ] Tests present for new/changed logic
- [ ] No N+1 queries introduced
- [ ] File upload validation (extension + MIME + size) if applicable
- [ ] RLS policies correct if schema changed

## Output Format
```
### [SEVERITY] Short title
File: path/to/file.ts, line N
Problem: description
Fix: suggested approach
```

## Summary
End with:
- Count of findings by severity
- Merge recommendation: approve / approve with non-critical fixes / block on critical fixes
