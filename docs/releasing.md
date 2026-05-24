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

**Fallback:** if you'd rather not manage per-package trust, add an npm
**granular access token** as an `NPM_TOKEN` repo secret and set
`NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}` on the release step — `changeset
publish` will use it instead of OIDC. Less secure (long-lived secret), but one
config for all packages.

- **Provenance**: `NPM_CONFIG_PROVENANCE=true` + `id-token: write` attaches
  provenance once trusted publishing succeeds — verify the green badge on npm.

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
