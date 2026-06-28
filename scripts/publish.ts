#!/usr/bin/env bun
/**
 * Publish every public `packages/*` whose current version is not yet on npm.
 *
 * Why this exists instead of `changeset publish`:
 *   - `changeset publish` shells out to `npm publish`, which does not understand
 *     bun's `workspace:` protocol, so a package with a *runtime* workspace
 *     dependency (e.g. nk-marketing -> nk-email) ships a literal `workspace:^`
 *     range that no consumer can install.
 *   - `bun publish` / `bun pm pack` *do* resolve `workspace:`, but they read the
 *     version from `bun.lock`, which silently goes stale (a plain `bun install`
 *     does not refresh a workspace package's recorded version), so they can emit
 *     a *wrong* range.
 *
 * So we resolve `workspace:` ranges ourselves from each package's package.json
 * version — the one source of truth — write them into a temporary manifest,
 * publish with `npm` (token auth via ~/.npmrc is the most portable), then
 * restore the original manifest. A guard refuses to publish anything that still
 * carries an unresolved `workspace:` range.
 *
 *   bun run scripts/publish.ts            # publish whatever is new
 *   bun run scripts/publish.ts --dry-run  # print resolved ranges, publish nothing
 */
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DRY_RUN = process.argv.includes("--dry-run");
const DEP_FIELDS = [
	"dependencies",
	"devDependencies",
	"peerDependencies",
	"optionalDependencies",
];

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkgsDir = join(root, "packages");
const log = (msg) => console.log(`[publish] ${msg}`);

/** Read every `packages/*` manifest once; keep the raw text for a faithful restore. */
function readWorkspace() {
	const out = [];
	for (const dir of readdirSync(pkgsDir)) {
		const path = join(pkgsDir, dir, "package.json");
		let raw;
		try {
			raw = readFileSync(path, "utf8");
		} catch {
			continue; // directory without a package.json — skip
		}
		out.push({ dir, path, raw, manifest: JSON.parse(raw) });
	}
	return out;
}

const workspace = readWorkspace();
const versions = new Map(
	workspace.map((pkg) => [pkg.manifest.name, pkg.manifest.version]),
);

/** Turn a `workspace:` spec into a real semver range using the version map. */
function resolveSpec(depName, spec) {
	const version = versions.get(depName);
	if (!version) {
		throw new Error(`${depName}: workspace dependency is not in packages/*`);
	}
	const suffix = spec.slice("workspace:".length);
	if (suffix === "" || suffix === "*") return version; // pin to the exact version
	if (suffix === "^" || suffix === "~") return `${suffix}${version}`;
	return suffix; // already an explicit range, e.g. workspace:^1.2.3
}

/** A deep copy of `manifest` with every `workspace:` range resolved. */
function resolveManifest(manifest) {
	const next = JSON.parse(JSON.stringify(manifest));
	for (const field of DEP_FIELDS) {
		const deps = next[field];
		if (!deps) continue;
		for (const name of Object.keys(deps)) {
			if (deps[name].startsWith("workspace:")) {
				deps[name] = resolveSpec(name, deps[name]);
			}
		}
	}
	return next;
}

/** Whether `name@version` already exists on the registry. */
function isPublished(name, version) {
	const res = spawnSync("npm", ["view", `${name}@${version}`, "version"], {
		encoding: "utf8",
	});
	return res.status === 0 && res.stdout.trim() === version;
}

let published = 0;
for (const pkg of workspace) {
	const { name, version, private: isPrivate } = pkg.manifest;
	if (isPrivate) continue;

	const resolved = resolveManifest(pkg.manifest);

	// Guard: nothing with an unresolved workspace: range may reach the registry.
	if (JSON.stringify(resolved).includes("workspace:")) {
		throw new Error(`${name}: unresolved workspace: range — refusing to publish`);
	}

	if (DRY_RUN) {
		const internal = {};
		for (const field of DEP_FIELDS) {
			for (const [dep, spec] of Object.entries(resolved[field] ?? {})) {
				if (versions.has(dep)) internal[dep] = spec;
			}
		}
		log(`${name}@${version} workspace deps → ${JSON.stringify(internal)}`);
		continue;
	}

	if (isPublished(name, version)) {
		log(`= ${name}@${version} already on npm`);
		continue;
	}

	log(`+ publishing ${name}@${version}`);
	writeFileSync(pkg.path, `${JSON.stringify(resolved, null, "\t")}\n`);
	try {
		const res = spawnSync("npm", ["publish", "--access", "public"], {
			cwd: join(pkgsDir, pkg.dir),
			stdio: "inherit",
		});
		if (res.status !== 0) throw new Error(`npm publish failed for ${name}`);
		published += 1;
	} finally {
		writeFileSync(pkg.path, pkg.raw); // restore the source manifest (workspace: ranges)
	}
}

if (!DRY_RUN && published === 0) {
	log("nothing to publish — every version is already on npm");
}
