import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { authNextFindings } from "./auth-next.js";
import { authShadowFindings } from "./auth-shadow.js";
import { SUPERSEDED_DEPS } from "./drift.js";
import {
	SEAL_FILE,
	migrationsFolder,
	readChain,
	readSeal,
	summarizeKinds,
	unmodelledDdl,
	writeSeal,
} from "./migrations.js";

// The canonical script → command mapping for a site on the nk-dev toolchain.
// The key is matched loosely (`type-check` and `typecheck` are both accepted);
// the value is what the script should run.
const CANONICAL_SCRIPTS = {
	lint: "nk lint",
	format: "nk format",
	check: "nk check",
	"type-check": "nk type-check",
};

const GUIDE_IMPORT = "@./node_modules/@ingram-tech/nk-dev/guide.md";
const OXLINTRC_FILE = "node_modules/@ingram-tech/nk-dev/oxlintrc.json";
/** Matches any `extends` entry that reaches nk-dev's oxlintrc, whatever the prefix. */
const OXLINTRC_EXTENDS_RE = /(^|\/)node_modules\/@ingram-tech\/nk-dev\/oxlintrc\.json$/;
const TSCONFIG_EXTENDS = "@ingram-tech/nk-dev/tsconfig/nextjs.json";

/**
 * The `extends` entry that reaches nk-dev's oxlintrc from `cwd`. oxlint resolves
 * `extends` relative to the config file, not through node resolution, so a
 * hoisted-workspace member (whose node_modules sits at the repo root) needs
 * `../node_modules/…`, not `./node_modules/…`. Walk up until the file exists;
 * fall back to the standalone-site form.
 */
function oxlintrcExtendsFor(cwd) {
	for (const prefix of ["./", "../", "../../", "../../../"]) {
		const entry = `${prefix}${OXLINTRC_FILE}`;
		if (existsSync(resolve(cwd, entry))) return entry;
	}
	return `./${OXLINTRC_FILE}`;
}

/** Read + parse a JSON file, or null if absent/unparseable. */
function readJson(file) {
	try {
		return JSON.parse(readFileSync(file, "utf8"));
	} catch {
		return null;
	}
}

/** Write JSON in the house style (tabs, trailing newline). */
function writeJson(file, value) {
	writeFileSync(file, `${JSON.stringify(value, null, "\t")}\n`);
}

/**
 * Collect drift findings for the repo at `cwd`. Each finding is
 * `{ id, level, message, fix }`, where `fix(cwd)` applies the correction and
 * returns a short past-tense note. `level` is "error" (breaks the model) or
 * "warn" (cosmetic / cleanup).
 */
export function findings(cwd) {
	const out = [];
	const pkgPath = resolve(cwd, "package.json");
	const pkg = readJson(pkgPath);
	if (!pkg) return out; // not a package — nothing to reconcile

	// 1. Scripts point at `nk`. Accept either `type-check` or `typecheck` key.
	const scripts = pkg.scripts ?? {};
	for (const [name, wanted] of Object.entries(CANONICAL_SCRIPTS)) {
		const key =
			name === "type-check" &&
			scripts["typecheck"] !== undefined &&
			scripts["type-check"] === undefined
				? "typecheck"
				: name;
		const current = scripts[key];
		if (current === wanted) continue;
		// Only flag `check` as missing if the repo has scripts at all; a repo
		// truly without a check script still wants one on the nk model.
		out.push({
			id: `script:${key}`,
			level: "error",
			message:
				current === undefined
					? `missing \`${key}\` script (want "${wanted}")`
					: `\`${key}\` script is "${current}" (want "${wanted}")`,
			fix: (dir) => {
				const p = resolve(dir, "package.json");
				const j = readJson(p);
				j.scripts ??= {};
				j.scripts[key] = wanted;
				writeJson(p, j);
				return `set \`${key}\` → "${wanted}"`;
			},
		});
	}

	// 2. Superseded deps still declared.
	const deps = { ...pkg.dependencies, ...pkg.devDependencies };
	if (deps["@ingram-tech/nk-dev"]) {
		const superseded = SUPERSEDED_DEPS.filter((d) => d in deps);
		for (const dep of superseded) {
			out.push({
				id: `dep:${dep}`,
				level: "error",
				message: `depends on \`${dep}\` — superseded by @ingram-tech/nk-dev`,
				fix: (dir) => {
					const p = resolve(dir, "package.json");
					const j = readJson(p);
					delete j.dependencies?.[dep];
					delete j.devDependencies?.[dep];
					writeJson(p, j);
					return `removed \`${dep}\``;
				},
			});
		}
	} else {
		out.push({
			id: "dep:nk-dev-missing",
			level: "warn",
			message:
				"does not depend on @ingram-tech/nk-dev (run `nk init` to adopt the toolchain)",
		});
	}

	// 3. .oxlintrc.json extends nk-dev (not the retired oxlint-config).
	const oxPath = resolve(cwd, ".oxlintrc.json");
	const ox = readJson(oxPath);
	if (ox) {
		const ext = [].concat(ox.extends ?? []);
		if (!ext.some((e) => OXLINTRC_EXTENDS_RE.test(String(e)))) {
			out.push({
				id: "oxlintrc:extends",
				level: "error",
				message: `.oxlintrc.json does not extend nk-dev's config (extends: ${JSON.stringify(ox.extends ?? null)})`,
				fix: (dir) => {
					const p = resolve(dir, ".oxlintrc.json");
					const j = readJson(p);
					// Keep any non-superseded extends (e.g. a local tier-b tweak
					// living outside oxlint-config), drop oxlint-config, ensure ours.
					const kept = []
						.concat(j.extends ?? [])
						.filter(
							(e) =>
								!String(e).includes("oxlint-config") &&
								!OXLINTRC_EXTENDS_RE.test(String(e)),
						);
					j.extends = [oxlintrcExtendsFor(dir), ...kept];
					j.$schema ??= "./node_modules/oxlint/configuration_schema.json";
					writeJson(p, j);
					return "repointed .oxlintrc.json extends → nk-dev";
				},
			});
		}
	}

	// 4. tsconfig.json extends nk-dev's tsconfig (not the retired typescript-config).
	const tsPath = resolve(cwd, "tsconfig.json");
	const ts = readJson(tsPath);
	if (ts && String(ts.extends ?? "").includes("typescript-config")) {
		out.push({
			id: "tsconfig:extends",
			level: "error",
			message: `tsconfig.json extends "${ts.extends}" — use nk-dev's tsconfig`,
			fix: (dir) => {
				const p = resolve(dir, "tsconfig.json");
				const j = readJson(p);
				j.extends = TSCONFIG_EXTENDS;
				writeJson(p, j);
				return `repointed tsconfig.json extends → ${TSCONFIG_EXTENDS}`;
			},
		});
	}

	// 5. CLAUDE.md imports the shared guide.
	const claudePath = resolve(cwd, "CLAUDE.md");
	if (deps["@ingram-tech/nk-dev"]) {
		const claude = existsSync(claudePath) ? readFileSync(claudePath, "utf8") : null;
		if (claude === null || !/@\S*nk-dev\/guide\.md/.test(claude)) {
			out.push({
				id: "claude:guide-import",
				level: "error",
				message:
					claude === null
						? "no CLAUDE.md importing the nk-dev guide"
						: "CLAUDE.md does not @import the nk-dev guide",
				fix: (dir) => {
					const p = resolve(dir, "CLAUDE.md");
					const body = existsSync(p)
						? readFileSync(p, "utf8")
						: "# Project\n";
					writeFileSync(
						p,
						`${body.replace(/\n*$/, "")}\n\n${GUIDE_IMPORT}\n`,
					);
					return "added the guide import to CLAUDE.md";
				},
			});
		}
	}

	// 6. knip.json ignoreDependencies referencing superseded packages (stale).
	const knipPath = resolve(cwd, "knip.json");
	const knip = readJson(knipPath);
	if (knip && Array.isArray(knip.ignoreDependencies)) {
		const stale = knip.ignoreDependencies.filter((d) =>
			SUPERSEDED_DEPS.includes(d),
		);
		if (stale.length) {
			out.push({
				id: "knip:stale-ignores",
				level: "warn",
				message: `knip.json ignoreDependencies references removed packages: ${stale.join(", ")}`,
				fix: (dir) => {
					const p = resolve(dir, "knip.json");
					const j = readJson(p);
					j.ignoreDependencies = j.ignoreDependencies.filter(
						(d) => !SUPERSEDED_DEPS.includes(d),
					);
					writeJson(p, j);
					return `pruned stale knip ignoreDependencies: ${stale.join(", ")}`;
				},
			});
		}
	}

	// 7. drizzle-kit is GENERATE-ONLY — it must never apply schema.
	//    `drizzle-kit push` diffs the live DB and applies straight to it with no
	//    migration file and no journal entry: the schema-drift source (it has
	//    already drifted one production database in this fleet, and on sites
	//    whose dev DB is shared it rewrites everyone's).
	//    `drizzle-kit migrate` is opaque — it exits non-zero with no message
	//    (even on a clean no-op) and hides journal drift.
	//    `nk-pg-migrate` (@ingram-tech/nk-db) is the one runner that applies:
	//    it surfaces the real Postgres error and pre-flights drift.
	for (const [name, cmd] of Object.entries(scripts)) {
		if (typeof cmd !== "string") continue;
		if (/\bdrizzle-kit\s+push\b/.test(cmd)) {
			out.push({
				id: `script:drizzle-push:${name}`,
				level: "error",
				message: `\`${name}\` runs \`drizzle-kit push\` — it applies schema to the live DB with no migration (drift). Generate a migration and apply it with \`nk-pg-migrate\`.`,
				fix: (dir) => {
					const p = resolve(dir, "package.json");
					const j = readJson(p);
					delete j.scripts?.[name];
					writeJson(p, j);
					return `removed \`${name}\` (drizzle-kit push)`;
				},
			});
		} else if (/\bdrizzle-kit\s+migrate\b/.test(cmd)) {
			out.push({
				id: `script:drizzle-migrate:${name}`,
				level: "error",
				message: `\`${name}\` runs \`drizzle-kit migrate\` — apply with \`nk-pg-migrate\` instead (it surfaces the real error and pre-flights journal drift).`,
				fix: (dir) => {
					const p = resolve(dir, "package.json");
					const j = readJson(p);
					j.scripts[name] = "nk-pg-migrate";
					writeJson(p, j);
					return `set \`${name}\` → "nk-pg-migrate"`;
				},
			});
		}
	}

	// 8. Prettier leftovers are dead weight (nk no longer runs Prettier):
	//    .prettierignore, any .prettierrc*, and a "prettier" key in package.json.
	for (const file of prettierFiles(cwd)) {
		out.push({
			id: `prettier:${file}`,
			level: "warn",
			message: `${file} is unused (nk no longer runs Prettier) — remove it`,
			fix: (dir) => {
				rmSync(resolve(dir, file));
				return `removed ${file}`;
			},
		});
	}
	if (pkg.prettier !== undefined) {
		out.push({
			id: "prettier:package.json",
			level: "warn",
			message:
				'package.json has a "prettier" key (nk no longer runs Prettier) — remove it',
			fix: (dir) => {
				const p = resolve(dir, "package.json");
				const j = readJson(p);
				delete j.prettier;
				writeJson(p, j);
				return 'removed "prettier" from package.json';
			},
		});
	}

	// 9. A `ci` script exists and runs the house gate. Its full contents are
	//    the site's call (migrations, i18n, email catalogs, build…), so this only
	//    warns and never writes — but the dep-upgrade flow and pre-push both
	//    assume `bun run ci` is the one command that proves a change.
	const ci = scripts["ci"];
	if (ci === undefined) {
		out.push({
			id: "script:ci",
			level: "warn",
			message:
				'missing `ci` script — the one command that proves a change (e.g. "nk check && nk type-check && nk test")',
		});
	} else {
		const missing = ["nk check", "nk type-check"].filter(
			(cmd) => !ci.includes(cmd) && !ci.includes(`bun run ${cmd.slice(3)}`),
		);
		if (missing.length > 0) {
			out.push({
				id: "script:ci",
				level: "warn",
				message: `\`ci\` script does not run ${missing.map((c) => `\`${c}\``).join(" or ")} — the gate should run both`,
			});
		}
	}

	// 10. The migration chain is sealed, and its unmodelled DDL is declared.
	out.push(...migrationFindings(cwd));

	// 11. No page/route under app/auth/ shadows a Better Auth endpoint.
	out.push(...authShadowFindings(cwd));

	// 12. If nk-auth's server guards are bound, something sets the header they
	//     need to preserve `next`.
	out.push(...authNextFindings(cwd));

	return out;
}

/** Prettier config files present in `cwd` (relative names). */
function prettierFiles(cwd) {
	let names;
	try {
		names = readdirSync(cwd);
	} catch {
		return [];
	}
	return names.filter(
		(name) => name === ".prettierignore" || name.startsWith(".prettierrc"),
	);
}

/**
 * Findings over a `drizzle/` chain. Silent on repos without one.
 *
 * The seal finding is the cheap half of migration safety: applied migrations
 * are immutable, and nothing in drizzle notices when one is edited.
 *
 * The unmodelled-DDL finding is the honest half. `drizzle-kit generate` diffs
 * `schema.ts` against `meta/*_snapshot.json`, so any DDL the snapshot can't
 * model — functions, triggers, `DEFERRABLE` constraints, grants, roles — is
 * outside the diff basis entirely. A chain carrying it can drift arbitrarily
 * far from the database while `db:generate` still reports no changes, and
 * anything regenerated from `schema.ts` drops it. That is a real property of
 * the repo, so `nk doctor` states it rather than leaving it to be rediscovered.
 */
function migrationFindings(cwd) {
	const out = [];
	const folder = migrationsFolder(cwd);
	let chain;
	try {
		chain = readChain(cwd, folder);
	} catch (err) {
		return [
			{ id: "migrations:broken-chain", level: "error", message: err.message },
		];
	}
	if (chain === null || chain.length === 0) return out;

	if (readSeal(cwd, folder) === null) {
		out.push({
			id: "migrations:unsealed",
			level: "warn",
			message: `${chain.length} migration(s) with no ${folder}/${SEAL_FILE} — an edit to an already-applied migration would go unnoticed`,
			fix: (dir) => {
				const f = migrationsFolder(dir);
				writeSeal(dir, f, readChain(dir, f));
				return `sealed ${chain.length} migration(s) in ${f}/${SEAL_FILE}`;
			},
		});
	}

	const inventory = unmodelledDdl(cwd, folder);
	if (inventory.length > 0) {
		const kinds = summarizeKinds(inventory);
		out.push({
			id: "migrations:unmodelled-ddl",
			level: "warn",
			message: `${inventory.length} of ${chain.length} migration(s) carry DDL drizzle's snapshot cannot model (${kinds.join(", ")}) — \`db:generate\` reporting "no changes" does not mean the chain reproduces the database, and regenerating from schema.ts drops it. Run \`nk migrations --ddl\` for the per-file list.`,
		});
	}

	return out;
}

/**
 * `nk doctor [--fix]` — report drift from the canonical nk-dev model (scripts,
 * dependencies, oxlint/tsconfig extends, the CLAUDE.md guide import, stale knip
 * ignores, forbidden schema-applying drizzle-kit scripts, Prettier leftovers,
 * a missing or thin `ci` script, an unsealed or unmodelled-DDL-carrying migration chain, a
 * page under app/auth/ shadowing a Better Auth endpoint, nk-auth guards bound
 * without the proxy header that preserves `next`).
 * With `--fix`, apply every auto-fixable finding, then remind
 * to reinstall.
 */
export function doctor(args = []) {
	const fix = args.includes("--fix");
	const cwd = process.cwd();
	const results = findings(cwd);

	if (results.length === 0) {
		console.log("nk doctor: ✓ on the canonical nk-dev toolchain — no drift.");
		process.exit(0);
	}

	if (!fix) {
		const errors = results.filter((r) => r.level === "error").length;
		console.log(`nk doctor: ${results.length} finding(s):\n`);
		for (const r of results) {
			const mark = r.level === "error" ? "✗" : "•";
			console.log(`  ${mark} ${r.message}`);
		}
		console.log(
			`\n  Run \`nk doctor --fix\` to apply the ${results.filter((r) => r.fix).length} auto-fixable one(s).`,
		);
		// Exit non-zero only when there are model-breaking findings, so `nk
		// doctor` can gate CI while cosmetic warnings don't.
		process.exit(errors > 0 ? 1 : 0);
	}

	let applied = 0;
	let touchedDeps = false;
	for (const r of results) {
		if (!r.fix) {
			console.log(`  – ${r.message} (manual)`);
			continue;
		}
		const note = r.fix(cwd);
		console.log(`  ✓ ${note}`);
		applied++;
		if (r.id.startsWith("dep:")) touchedDeps = true;
	}
	console.log(`\nnk doctor: applied ${applied} fix(es).`);
	if (touchedDeps) console.log("  → run `bun install` to sync the lockfile.");
	process.exit(0);
}
