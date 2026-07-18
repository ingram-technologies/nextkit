# Skill: large-scale TS/TSX codemods with `nk ast-grep`

You're an AI agent working in a **nextkit** site. When a change is **mechanical
and repeats across many files** — rename an API, rewrite an import, add a prop,
swap a call shape — don't hand-edit file by file and don't sed. Reach for
`nk ast-grep`: the [ast-grep](https://ast-grep.github.io) binary vendored by
`@ingram-tech/nk-dev`, which matches and rewrites by **syntax tree**, so it
respects TS/TSX structure instead of guessing with regex.

`nk ast-grep` is a thin passthrough — every argument goes straight to `ast-grep`,
so its own `--help` / `run` / `scan` subcommands and docs all apply.

## When to use it (and when not to)

Use it for **syntactic, pattern-shaped** edits repeated at scale:

- rewrite every `import { x } from "old"` → `"@ingram-tech/new"`
- rename a function/method across the codebase (`foo(...)` → `bar(...)`)
- add/rename/remove a prop on a component or an option on a call
- change a call's argument shape (positional → options object, etc.)

Do **not** use it when the change needs **type information or semantics** —
"rename this symbol only where it refers to *this* declaration", "update every
caller whose argument is a `User`". ast-grep sees syntax, not types, so it can't
tell two identically-named things apart. For type-driven refactors use the TS
language service (editor rename), `tsc`, or a type-aware tool (`ts-morph`). For a
one-off edit in one file, just edit the file.

## The workflow — always search, preview, then apply

1. **Search first — never rewrite blind.** See what the pattern matches:

   ```bash
   nk ast-grep run -p 'useOldHook($$$ARGS)' -l tsx
   ```

   Read the hits. If it matches too much or too little, tighten the pattern
   before going further. A syntactic pattern over-matches easily.

2. **Preview the rewrite** (prints a diff, writes nothing without `-U`):

   ```bash
   nk ast-grep run -p 'useOldHook($$$ARGS)' -r 'useNewHook($$$ARGS)' -l tsx
   ```

3. **Apply** once the diff is exactly right (`-U` / `--update-all`):

   ```bash
   nk ast-grep run -p 'useOldHook($$$ARGS)' -r 'useNewHook($$$ARGS)' -l tsx -U
   ```

4. **Normalise, then verify.** ast-grep's output isn't house-formatted and the
   edit is unchecked. Always follow with:

   ```bash
   nk format        # oxfmt — reflow the rewritten code
   nk type-check    # tsc — did the rewrite actually type-check?
   nk check         # oxlint + format-verify + knip
   ```

   Then read the full diff yourself. Treat a codemod as unverified until the
   type-checker and your own eyes have passed over it.

## Pattern syntax you need

- **`$A`, `$FOO`** — a metavariable: matches one named node. Same name used twice
  must match the same code (`$A === $A`). Uppercase/underscore names.
- **`$$$ARGS`** — matches **zero or more** nodes (argument lists, statements,
  JSX children). This is what makes rewrites arity-agnostic.
- **`-l ts` / `-l tsx`** — the language. Use `tsx` for anything with JSX (most of
  a Next.js `app/`), `ts` for plain `.ts`. Getting this wrong makes patterns
  silently fail to parse.
- **`-p` pattern**, **`-r` rewrite**, **`-U`** apply, **`-i`** interactive
  (approve each edit). Scope by passing paths: `nk ast-grep run ... src/app`.

Example — positional arg → options object:

```bash
nk ast-grep run -l ts \
  -p 'createClient($URL, $KEY)' \
  -r 'createClient({ url: $URL, key: $KEY })'
```

## When a single pattern isn't enough — rule files

For matches that need context ("only inside a `useEffect`", "only calls that have
a `.then`"), one `-p` pattern won't express it. Write an ast-grep **YAML rule**
using relational clauses (`inside`, `has`, `follows`) and `constraints`, then:

```bash
nk ast-grep scan --rule ./rule.yml       # report
nk ast-grep scan --rule ./rule.yml -U    # apply
```

Keep that rule file **out of the committed tree** — write it to a scratch/temp
path and delete it after. nextkit sites don't carry codemod config as repo noise;
the rule is a throwaway for one migration, not a fixture. (An `sgconfig.yml` at
the repo root would make `nk ast-grep` pick up committed rules — deliberately not
part of the nextkit convention.)

Minimal rule shape:

```yaml
id: rename-hook-in-effect
language: tsx
rule:
  pattern: useOldHook($$$ARGS)
  inside: { pattern: useEffect($$$) }
fix: useNewHook($$$ARGS)
```

## Guardrails

- Syntactic, not semantic — **it can and will over-match.** Search before you
  rewrite, every time.
- Never apply (`-U`) straight to a dirty tree you can't diff. Commit or stash
  first so the codemod's change is the only thing in the diff.
- Always `nk format` + `nk type-check` after applying. A green type-check is the
  real proof the rewrite held; the diff being pretty is not.
- If ast-grep can't cleanly express the change in one or two rules, it's probably
  a semantic refactor — step up to a type-aware tool instead of forcing it.
