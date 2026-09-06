---
"@ingram-tech/nk-dev": minor
---

New oxlint rule `nextkit/no-unvalidated-request-body` (error), enforcing the
guide's hard rule in the place it binds hardest: a route handler
(`app/**/route.ts`) may not assert a type on the body it just parsed.
`Request.json()` is typed `Promise<any>`, so both `(await req.json()) as Body`
and `const body: Body = await req.json()` type-check while claiming something
about a payload the caller controls, and the first symptom is a 500 or a row
written from a body nobody checked. Parse it with a schema instead;
`as unknown` on the way into the parser is still fine. Casting a response you
fetched is a different claim and the rule says nothing about it.
