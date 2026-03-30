---
name: new-feature
description: Use when implementing a new feature end-to-end from requirements through verification. Invoke with: /new-feature
---

# New Feature Implementation

## Required Inputs
Before starting, confirm:
- **Feature goal**: what does this feature do for the user?
- **Acceptance criteria**: how will we know it is done?
- **Constraints**: performance, security, compatibility limits
- **Non-goals**: what is explicitly out of scope?
- **Affected paths**: which directories/files will change?

## Discovery Checklist
- [ ] Read relevant existing code before writing anything new
- [ ] Identify all files that need to change
- [ ] Check for existing utilities or patterns to reuse
- [ ] Note any dependencies on Phase 0 decisions or open research items

## Risk List (required before implementing)
- List security risks and mitigations
- List data loss or corruption risks
- List regression risks to existing features
- Flag any schema or auth changes that need review

## Implementation Steps
1. Implement backend changes (schema, API, RLS) first
2. Implement server-side data access and validation
3. Implement UI components and interactions
4. Wire data fetching from server to UI
5. Add error states and loading states
6. Write tests per `testing.instructions.md`

## Validation Commands
```bash
npm run lint
npm run build
npm test
```

## Output Contract
Report back:
- What changed (files modified/created)
- What was verified (commands run and results)
- What remains (follow-up tasks or open decisions)
- Any assumptions made
