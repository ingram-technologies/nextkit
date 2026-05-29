---
"@ingram-tech/newsletter": minor
---

Validate Supabase rows with Zod at the boundary instead of `as`-casting them, per
the house "validate external input with Zod" rule. Row types are now inferred
from the schemas (single source of truth), the subscribe path now checks the
previously-dropped lookup error, and `zod` is a new runtime dependency. Malformed
rows now throw a clear validation error rather than flowing through as a bad type.
