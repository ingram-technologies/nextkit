# Releasing

nextkit publishes to npm under `@ingram-tech/*` using **Changesets** for
versioning and **npm Trusted Publishing (OIDC)** for credential-free CI
publishing with provenance.

## Day-to-day flow

1. Make your change in a package.
2. Add a changeset describing it and the semver bump:
   ```bash
   bun run changeset
   ```
3. Open a PR. Merge it to `main`.
4. The [release workflow](../.github/workflows/release.yml) opens (or updates) a
   **"Version Packages"** PR that consumes pending changesets into version bumps
   + CHANGELOG entries.
5. Merge the "Version Packages" PR. The workflow then **publishes** the bumped
   packages to npm via OIDC — no token, with provenance attestations.

## How publishing works (`scripts/publish.ts`)

`bun run release` builds, publishes every `packages/*` whose current version is
not yet on npm, then tags (`changeset tag`). Publishing does **not** use
`changeset publish`:

- `changeset publish` shells out to `npm publish`, which can't resolve bun's
  `workspace:` protocol — a package with a *runtime* workspace dep (e.g.
  nk-marketing → nk-email) would ship an uninstallable `workspace:^` range.
- `bun publish` / `bun pm pack` do resolve `workspace:`, but they read versions
  from `bun.lock`, which silently goes stale — they can emit a *wrong* range.

So [`scripts/publish.ts`](../scripts/publish.ts) resolves `workspace:` ranges
from each package's `package.json` version — the source of truth — publishes
with `npm`, and refuses to publish anything still carrying a `workspace:`
range. It treats npm's "cannot publish over previously published versions" 403
as already-published, so re-running a release is safe.

## One-time setup (Trusted Publishing)

For each `@ingram-tech/*` package, on npmjs.com → the package → **Settings →
Trusted Publisher**, add:

- Provider: **GitHub Actions**
- Repository: `ingram-technologies/nextkit`
- Workflow filename: `release.yml`

**Immutable OIDC subject claims are fine.** This repo opted in
(`use_immutable_subject`), so its Actions tokens carry
`repo:OWNER@OWNER-ID/REPO@REPO-ID:ref:…` instead of the name-only form. npm
accepts it for both halves of the token's job: trusted-publishing authorization,
and the provenance attestation — whose certificate records the immutable subject
verbatim in its Token Subject extension (`1.3.6.1.4.1.57264.1.24`). Confirmed on
the 2026-08-01 release. npm's docs still don't say which claims they match, but
they can't be matching `sub` alone: the workflow filename a trusted publisher is
configured with appears only in `job_workflow_ref`/`workflow_ref`, which are
name-based and unaffected. Other Ingram repos can opt in without ceremony; any
repo created after 2026-07-15 already sends the immutable form.

**New packages:** the OIDC release CAN first-publish a brand-new package — no
local bootstrap needed. Expect npm's new-package quarantine afterwards: for
~15 minutes the registry GETs 404 and a republish attempt 403s with "cannot
publish over previously published versions". That state means it worked — wait
for it to become visible, don't bump the version or publish locally. Then
attach the trusted publisher (above) for subsequent releases.

## Troubleshooting: `E404 ... PUT /@ingram-tech%2f<pkg>` on publish

If a CI release run logs `using npm trusted publishing` and then fails with:

```
npm error 404 ... PUT https://registry.npmjs.org/@ingram-tech%2f<pkg>
... could not be found or you do not have permission to access it.
```

…the workflow is **fine** — npm is rejecting the OIDC publish because **no
trusted publisher is configured for that package** (or the configured
repo/workflow doesn't match). This is the one-time web setup above. It is *not*
a bun-vs-npm or provenance problem: the run correctly detects OIDC, signs
provenance, and publishes via npm — it just needs the npm-side trust to exist.

Fix: add the Trusted Publisher for that exact package (steps above), making sure
the **workflow filename is `release.yml`** and any **environment** matches (the
workflow uses none). Then re-run the release. Until every published package has
its trusted publisher, releases that touch those packages will E404.

**Fallback:** the workflow also injects the `NPM_TOKEN` repo secret (a granular
access token) as `NODE_AUTH_TOKEN`; npm uses it for any package whose OIDC
trust is missing. Less secure (long-lived secret), but one config for all
packages.

- **Provenance**: `NPM_CONFIG_PROVENANCE=true` + `id-token: write` attaches
  provenance once trusted publishing succeeds — verify the green badge on npm.

## Manual local publish (reference)

When CI can't be used, publish locally with an authenticated npm (`npm login`)
through the same script the workflow runs — never `bun pm pack` (stale
`bun.lock` versions) or raw `npm publish` (unresolved `workspace:` ranges):

```bash
bun run build
bun scripts/publish.ts --dry-run   # inspect resolved ranges
bun scripts/publish.ts
```
