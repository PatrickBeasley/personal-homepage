---
name: migration
description: Use when planning or executing a database schema migration or data migration. Invoke with: /migration
---

# Database Migration

## Migration Intent
Describe:
- What schema or data is changing
- Why this change is needed
- Which tables/columns/indexes are affected

## Backward Compatibility Plan
- Will the old code still work during/after migration? If not, what is the deploy order?
- Is a multi-step migration needed (add column → backfill → drop old column)?
- Are there dependent RLS policies, functions, or triggers to update?

## Rollout Steps
1. Write migration SQL in `supabase/migrations/<timestamp>_<name>.sql`
2. Test locally with `supabase db push`
3. Review generated migration in Supabase dashboard
4. Run pre-migration data validation queries
5. Apply to production
6. Run post-migration validation queries
7. Confirm application behavior

## Rollback Steps
- Document the exact SQL to reverse this migration
- Identify the safe rollback window (before/after data is modified)
- Note if rollback requires a code rollback as well

## Risk Assessment (required)
- Estimated runtime on expected data volume
- Locking risks (table locks, row locks, index builds)
- Impact on running application during migration
- Mitigation for each risk

## Validation Queries
Pre-migration:
```sql
-- Add COUNT and sample checks here
```

Post-migration:
```sql
-- Add integrity checks here
```

## Incident Triggers
Define conditions that should trigger rollback:
- Migration running longer than N minutes
- Error rate exceeding threshold post-deploy
- Data validation query returns unexpected results
