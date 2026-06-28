---
"@ingram-tech/nk-dev": patch
---

Remove the `@supabase/supabase-js` `no-restricted-imports` rule from the tier-b
oxlint config — the fleet no longer uses supabase-js, so the guardrail is moot.
The `pg` `Pool`/`Client` restriction (use `createPool` from nk-db) is unchanged.
