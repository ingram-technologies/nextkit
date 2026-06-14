# Migrating from Biome to oxc (oxlint + oxfmt)

How a consuming site moves from `@ingram-tech/biome-config` (Biome) to
`@ingram-tech/oxlint-config` (oxlint + oxfmt). There's a codemod that does the
mechanical parts; this doc explains what it does and the few things to check by
hand.

## Why

The fleet standardises on the [oxc](https://oxc.rs) toolchain: **oxlint** for
linting and **oxfmt** for formatting. It's the same house style (tabs / width 4
/ line 88) and the same rule intent, on a much faster Rust toolchain with a
broader lint surface. SQL still formats through Prettier inside `nk` — oxfmt
doesn't do SQL — so the "no Prettier for code" rule is unchanged. See the
[vendor stance](./philosophy.md#the-vendor-stance-eu-first-self-hostable-no-per-seat-us-saas).

## Run the codemod

From the site root:

```bash
bunx --bun https://raw.githubusercontent.com/ingram-technologies/nextkit/main/scripts/codemods/biome-to-oxlint.mjs
bun install
bun run check
```

The codemod, all in the current directory:

1. **package.json** — removes `@ingram-tech/biome-config` + `@biomejs/biome`,
   adds `@ingram-tech/oxlint-config` + `oxlint` + `oxfmt`, and rewrites any
   direct `biome …` scripts (`biome lint .` → `oxlint`, `biome check .` →
   `oxlint && oxfmt --check .`, etc.). Sites that drive everything through `nk`
   have no `biome` scripts to rewrite.
2. Writes **`.oxlintrc.json`** extending the shared config.
3. Writes **`.oxfmtrc.json`** (the house format config).
4. Deletes **`biome.json`**.

It won't clobber an existing `.oxlintrc.json` / `.oxfmtrc.json` — it warns and
leaves them for you to reconcile.

## Two gotchas the codemod handles (but you should know)

- **oxlint `extends` takes a *relative path*, not a package specifier.** Biome
  let you write `"extends": ["@ingram-tech/biome-config/biome.json"]`; oxlint
  resolves paths relative to the config file, so it must be
  `"extends": ["./node_modules/@ingram-tech/oxlint-config/oxlintrc.json"]`.
- **oxfmt has no `extends`.** The house format config is *copied* into a local
  `.oxfmtrc.json` rather than referenced. It's tiny and stable, so it rarely
  drifts; if you'd rather always track the package, run
  `oxfmt -c ./node_modules/@ingram-tech/oxlint-config/oxfmtrc.json` instead.

## By hand: suppression comments

Any inline `// biome-ignore lint/<rule>: reason` must become an oxlint directive:

```ts
// biome-ignore lint/suspicious/noThenProperty: deliberate thenable
// →
// oxlint-disable-next-line unicorn/no-thenable -- deliberate thenable
```

The rule id changes (oxlint uses ESLint-style `<plugin>/<rule>` names) and the
reason follows a `--` separator. `bun run check` will tell you which lines still
need it — and an unjustified `oxlint-disable` should fail review, same hard rule
as before (see [`code-style.md`](./code-style.md)).

## Expect a small one-time format diff

oxfmt is Prettier-compatible, which differs cosmetically from Biome in a couple
of places — most visibly, it doesn't double-indent binary-expression
continuations, and it collapses short multi-line `import`/`export` lists that
fit on one line. The first `oxfmt --write` will reformat those. It's mechanical
and safe; commit it on its own if you want a clean diff.

## `nk` users

If the site uses `@ingram-tech/nk-cli`, the default formatter is now **oxc** —
`nk format` / `nk lint` / `nk check` invoke oxfmt + oxlint automatically. A site
not ready to move can pin Biome for now:

```jsonc
{ "nk": { "formatter": "biome" } }
```

(Keep `@ingram-tech/biome-config` + `@biomejs/biome` installed in that case.)

## Verify

```bash
bun run check     # oxlint clean + oxfmt reports all files formatted
bun run ci        # the full gate, if the site has one
```
