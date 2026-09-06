---
"@ingram-tech/nk-dev": minor
---

New oxlint rule `nextkit/no-sql-array-cast` (error): no `${value}::type[]` in a
drizzle `sql` template. A template interpolation is one bound parameter and
drizzle expands a JS array into several, so the cast lands on a record and
Postgres fails at run time with "cannot cast type record to uuid[]". Types,
lint and build are all happy until the query reaches the server. Build the
array with `array[...]` and `sql.join` instead. Casting a column to an array
type is legitimate and syntactically identical, so that case takes a justified
disable comment.
