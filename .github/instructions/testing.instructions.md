---
applyTo: "**/*.test.ts,**/*.test.tsx,**/*.spec.ts,**/*.spec.tsx,app/**,lib/**"
---

# Testing Instructions — personal-homepage

## Test Strategy by Change Type

| Change Type | Required Tests |
|-------------|---------------|
| New API route | Unit test for handler logic + auth guard |
| New UI component | Render test + keyboard interaction |
| Bug fix | Regression test that fails before fix, passes after |
| Schema/migration | SQL validation queries pre/post |
| Auth change | Authenticated + unauthenticated path coverage |
| File upload/download | Extension whitelist, size limit, and bad input rejection |

## Test Pyramid
- **Unit tests**: pure functions in `lib/`, validation logic, utility helpers.
- **Integration tests**: API route handlers with mocked Supabase client.
- **E2E tests**: critical user journeys (homepage load, contact form, admin login, file upload/download).

## Mocking and Stubbing Rules
- Mock the Supabase client at the module boundary — do not hit real DB in unit/integration tests.
- Do not mock the module under test.
- Use realistic test data — avoid single-character strings or magic numbers without context.

## Regression Test Requirements
- Every bug fix must include a test that reproduces the bug (fails without the fix) and passes with it.
- The test description must reference the bug or issue number if one exists.

## Flake Prevention
- Tests must not depend on execution order.
- Tests must not depend on external network calls — mock or intercept all HTTP.
- If a test is flaky, quarantine it immediately with a `// TODO: fix flake — owner, date` comment and open a tracking issue.

## Coverage and Quality
- Aim for meaningful coverage of business logic, not line-count targets.
- Do not write tests that only verify mocks call each other — test observable behavior.
- Keep test files next to the code they test where practical, or in a `__tests__/` sibling directory.
