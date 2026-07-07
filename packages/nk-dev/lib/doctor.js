import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { SUPERSEDED_DEPS } from "./drift.js";

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
const OXLINTRC_EXTENDS = "./node_modules/@ingram-tech/nk-dev/oxlintrc.json";
const TSCONFIG_EXTENDS = "@ingram-tech/nk-dev/tsconfig/nextjs.json";

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
function findings(cwd) {
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
		if (!ext.includes(OXLINTRC_EXTENDS)) {
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
								e !== OXLINTRC_EXTENDS,
						);
					j.extends = [OXLINTRC_EXTENDS, ...kept];
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

	// 7. .prettierignore is now dead weight (nk no longer formats SQL).
	const prettierIgnore = resolve(cwd, ".prettierignore");
	if (existsSync(prettierIgnore)) {
		out.push({
			id: "prettierignore",
			level: "warn",
			message:
				".prettierignore is unused (nk no longer runs Prettier) — remove it",
			fix: (dir) => {
				rmSync(resolve(dir, ".prettierignore"));
				return "removed .prettierignore";
			},
		});
	}

	return out;
}

/**
 * `nk doctor [--fix]` — report drift from the canonical nk-dev model (scripts,
 * dependencies, oxlint/tsconfig extends, the CLAUDE.md guide import, stale knip
 * ignores, a dead .prettierignore). With `--fix`, apply every auto-fixable
 * finding, then remind to reinstall.
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
