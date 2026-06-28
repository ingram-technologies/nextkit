# Code style & quality rules

The house rules for every Ingram Next.js codebase. Most formatting is enforced
mechanically by the oxlint + oxfmt config in
[`@ingram-tech/nk-dev`](../packages/nk-dev); the rules below are the
judgment-level conventions that humans and agents must follow.

> **Enforce what you can, document what you can't.** Where a rule below can
> become an oxlint rule or a local oxlint plugin, make it one. This list is the
> fallback, not the goal.

## Formatting (mechanical — oxfmt)

- **Tabs**, indent width 4, line width 88.
- Run `bun run format` (or rely on the pre-commit hook). Never hand-format.

## TypeScript

- **Validate external input with Zod. Never `as SomeType`** to cast form data,
  URL params, or API responses. Parse with a schema.
- **No `as unknown as T`** double casts. If types genuinely don't overlap,
  document why in a comment.
- **No non-null assertions (`!`)** in app code. Use guard clauses, optional
  chaining, or nullish coalescing. (oxlint enforces this via
  `typescript/no-non-null-assertion` as an `error`, alongside
  `typescript/no-explicit-any` — both fail `bun run check`.)
- `noUncheckedIndexedAccess` is on — handle the `undefined` from index access.

## Data access

- **Always handle database errors.** Never fire-and-forget a mutation — let
  failures throw (or check and surface them), don't swallow them. On the nk-db
  raw-SQL helpers, pass a Zod row schema so the result is validated, not cast
  (see [`db-package.md`](./db-package.md)).
- **Type mutation payloads** from the schema — use Drizzle's inferred
  insert/update types, never `Record<string, unknown>`.

## Error handling

- Use a shared `toErrorMessage(error)` helper in catch blocks, not
  `(error as Error).message`.
- Use a shared `assertResponseOk(res, msg)` for fetch responses, not inline
  `.json().catch(() => ({}))`.

## React

- **Small components, one per file.**
- Write prop types **inline** unless they must be exported:
  ```tsx
  export const UserCard: React.FC<{ user: User }> = ({ user }) => <div>…</div>;
  ```
- For `react/exhaustive-deps`, wrap functions in `useCallback` rather than
  suppressing the rule.

## Suppressions

- **No `oxlint-disable` without a justification comment** explaining why (use
  the `oxlint-disable-next-line <rule> -- reason` form). This is a hard rule —
  an unjustified suppression should fail review.

## Don't duplicate utilities

Before writing a helper, check the shared modules (`lib/utils.ts`,
`lib/number-input.ts`, etc.) and the nextkit packages. If a helper would be
useful to more than one site, it belongs in nextkit, not copied locally — see
the positive feedback loop in [`philosophy.md`](./philosophy.md).

## Internationalization

When a site is multilingual:

- All user-facing strings go through `t()`. **Never** hardcode a user-facing
  string without it.
- **English is the inline string** — never create an `en.json`.
- Use ICU MessageFormat for plurals/select; named params (`{name}`), not
  positional. One `t()` call per complete phrase — never concatenate translated
  fragments.
- Co-locate `i18n.{locale}.json` next to the component it translates.

## Commits

- Small, topical commits. Each should pass `bun run ci`
  (`check` + `type-check` + `test`) before you push.
