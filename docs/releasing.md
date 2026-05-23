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

## One-time setup (Trusted Publishing)

For each `@ingram-tech/*` package, on npmjs.com → the package → **Settings →
Trusted Publisher**, add:

- Provider: **GitHub Actions**
- Repository: `ingram-technologies/nextkit`
- Workflow filename: `release.yml`

(A package must already exist to attach a trusted publisher. The initial `0.1.0`
versions were bootstrapped with a one-time local `npm publish`, so all five are
ready to wire up now.)

## Status / things to validate on first CI release

- **OIDC publish path**: `bun run release` runs `changeset publish`. Confirm the
  publish leg performs the OIDC exchange (needs npm ≥ 11.5.1, which the workflow
  installs). If Changesets publishes via `bun` rather than `npm` and bun does
  not yet perform the npm OIDC handshake, switch the publish step to npm (the
  manifests already convert `workspace:*` correctly — verified via `bun pm pack`).
- **Provenance**: `NPM_CONFIG_PROVENANCE=true` plus `id-token: write` attaches
  provenance. Verify the green "provenance" badge appears on npmjs.com after the
  first CI publish.

## Manual bootstrap (reference)

The initial publish was done locally because trusted publishers need an existing
package. The reproducible local publish (converts `workspace:*`, then publishes
the tarball with an authenticated npm):

```bash
bun run build
cd packages/<name>
bun pm pack            # rewrites workspace:* → real versions in the manifest
npm publish *.tgz --access public
```
