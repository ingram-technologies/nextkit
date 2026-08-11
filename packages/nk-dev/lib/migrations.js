import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// Two guards over a `drizzle/` migration chain, both of which exist because
// `drizzle-kit generate` diffs `schema.ts` against `meta/*_snapshot.json` and
// NEVER against the `.sql` files:
//
//   1. THE SEAL. Once a migration has been applied anywhere, its bytes are
//      history — the runner records `sha256(file)` in the journal table, so
//      editing the file (a formatter sweep, a "quick fix" to a generated
//      migration) permanently drifts every database that already ran it. There
//      is nothing in drizzle that notices. {@link verifySeal} pins each file's
//      hash in a committed `_seal.json`, so the edit shows up as a failed check
//      in the PR that made it instead of as a confusing `already exists` on the
//      next deploy.
//
//   2. THE UNMODELLED-DDL INVENTORY. Functions, triggers, `DEFERRABLE`
//      constraints, grants and roles are not in drizzle's snapshot model. Once
//      a migration carries them, the snapshot is a permanently partial view of
//      the schema: `db:generate` reports "nothing to migrate" no matter how far
//      the chain has drifted from the database, and anything regenerated from
//      `schema.ts` (notably a squash) silently drops them.
//      {@link unmodelledDdl} turns that from tribal knowledge into a list.
//
// Both are deliberately database-free: they run in CI, in a pre-commit hook and
// on a laptop with no `DATABASE_URL`. Proving the chain actually reproduces the
// live schema needs a catalog diff against a real database, which is a
// different (and much larger) tool.

/** Name of the seal file, written inside the migrations folder. */
export const SEAL_FILE = "_seal.json";

const SEAL_COMMENT =
	"sha256 of each migration file at the time it was sealed. Applied migrations are immutable: if a hash here stops matching, the file was edited after it ran and every database that already applied it has drifted. Regenerate with `nk migrations --reseal` ONLY as part of a deliberate squash.";

/**
 * The migrations folder for a repo. Honours `out:` in a drizzle config when one
 * is present (matched textually — we are not loading the site's TS config just
 * to read one string), else drizzle's `drizzle` default.
 */
export function migrationsFolder(cwd = process.cwd()) {
	for (const name of [
		"drizzle.config.ts",
		"drizzle.config.js",
		"drizzle.config.mjs",
	]) {
		const path = resolve(cwd, name);
		if (!existsSync(path)) continue;
		const match = /\bout\s*:\s*["'`]([^"'`]+)["'`]/.exec(
			readFileSync(path, "utf8"),
		);
		if (match?.[1]) return match[1];
	}
	return "drizzle";
}

const journalPathFor = (cwd, folder) => resolve(cwd, folder, "meta", "_journal.json");

/**
 * The migration chain as `{ tag, hash }`, in journal order. `hash` is
 * `sha256(rawFile)` — the exact value drizzle records in `__drizzle_migrations`,
 * so a mismatch here is a mismatch there.
 *
 * Returns null when the repo has no journal (not a drizzle site — nothing to
 * guard). Throws when the journal names a file that doesn't exist, which is
 * itself a broken chain.
 */
export function readChain(cwd = process.cwd(), folder = migrationsFolder(cwd)) {
	const journalPath = journalPathFor(cwd, folder);
	if (!existsSync(journalPath)) return null;
	const journal = JSON.parse(readFileSync(journalPath, "utf8"));
	const entries = Array.isArray(journal?.entries) ? journal.entries : [];
	return entries.map((entry) => {
		const sqlPath = resolve(cwd, folder, `${entry.tag}.sql`);
		if (!existsSync(sqlPath)) {
			throw new Error(
				`nk migrations: journal entry "${entry.tag}" has no ${folder}/${entry.tag}.sql`,
			);
		}
		const sql = readFileSync(sqlPath, "utf8");
		return {
			tag: entry.tag,
			hash: createHash("sha256").update(sql).digest("hex"),
			sql,
		};
	});
}

/** The committed seal, or an empty one when the repo hasn't sealed yet. */
export function readSeal(cwd = process.cwd(), folder = migrationsFolder(cwd)) {
	const path = resolve(cwd, folder, SEAL_FILE);
	if (!existsSync(path)) return null;
	const parsed = JSON.parse(readFileSync(path, "utf8"));
	return parsed?.migrations && typeof parsed.migrations === "object"
		? parsed.migrations
		: {};
}

/** Write the seal for `chain`, in journal order (stable diffs). */
export function writeSeal(cwd, folder, chain) {
	const migrations = {};
	for (const m of chain) migrations[m.tag] = m.hash;
	writeFileSync(
		resolve(cwd, folder, SEAL_FILE),
		`${JSON.stringify({ $comment: SEAL_COMMENT, migrations }, null, "\t")}\n`,
	);
}

/**
 * Compare the chain on disk to the committed seal.
 *
 * - `changed` — sealed migrations whose bytes moved. Always a defect: those
 *   files have already run somewhere.
 * - `dropped` — sealed migrations no longer in the journal. Normal during a
 *   squash, a defect at any other time.
 * - `unsealed` — migrations with no seal entry yet (newly generated).
 */
export function verifySeal(cwd = process.cwd(), folder = migrationsFolder(cwd)) {
	const chain = readChain(cwd, folder);
	if (chain === null) return null;
	const sealed = readSeal(cwd, folder);
	if (sealed === null) {
		return { chain, sealedYet: false, changed: [], dropped: [], unsealed: chain };
	}
	const changed = [];
	const unsealed = [];
	for (const m of chain) {
		const expected = sealed[m.tag];
		if (expected === undefined) unsealed.push(m);
		else if (expected !== m.hash) changed.push({ ...m, sealed: expected });
	}
	const tags = new Set(chain.map((m) => m.tag));
	const dropped = Object.keys(sealed).filter((tag) => !tags.has(tag));
	return { chain, sealedYet: true, changed, dropped, unsealed };
}

// DDL that drizzle's snapshot model does not represent. Each entry is
// `[kind, pattern]`, matched against SQL with comments, string literals and
// dollar-quoted bodies stripped, so a mention inside a function body or a
// `-- create trigger` comment doesn't count.
const UNMODELLED = [
	["function", /\bcreate\s+(?:or\s+replace\s+)?(?:function|procedure)\b/i],
	["trigger", /\bcreate\s+(?:constraint\s+|event\s+)?trigger\b/i],
	["deferrable", /\bdeferrable\b/i],
	["grant", /\b(?:grant|revoke)\b/i],
	["role", /\b(?:create|alter|drop)\s+role\b/i],
	["extension", /\bcreate\s+extension\b/i],
	["materialized-view", /\bcreate\s+materialized\s+view\b/i],
	["rule", /\bcreate\s+(?:or\s+replace\s+)?rule\b/i],
	["do-block", /(?:^|;|\n)\s*do\s+\$/i],
];

/**
 * Blank out anything that isn't executable DDL text: dollar-quoted bodies (a
 * function body full of SQL keywords), block and line comments, single-quoted
 * literals and double-quoted identifiers. Replaced with spaces rather than
 * removed so nothing accidentally joins into a new keyword.
 */
function stripNonDdl(sql) {
	const blank = (m) => " ".repeat(m.length);
	return (
		sql
			// A dollar-quoted body collapses to a bare `$$` rather than to spaces:
			// the body's contents are not statements, but the opener still has to be
			// visible so `do $$ ... $$` is recognisable as an anonymous block.
			.replace(/\$([A-Za-z_]\w*)?\$[\s\S]*?\$\1?\$/g, " $$$$ ")
			.replace(/\/\*[\s\S]*?\*\//g, blank)
			.replace(/--[^\n]*/g, blank)
			.replace(/'(?:[^']|'')*'/g, blank)
			.replace(/"(?:[^"]|"")*"/g, blank)
	);
}

/** The unmodelled-DDL kinds present in one migration's SQL. */
export function unmodelledKinds(sql) {
	const stripped = stripNonDdl(sql);
	return UNMODELLED.filter(([, pattern]) => pattern.test(stripped)).map(
		([kind]) => kind,
	);
}

/**
 * Per-file inventory of DDL drizzle can't model: `[{ tag, kinds }]`, only for
 * files that carry some. Empty when the chain is purely generated output (the
 * only case in which `db:generate` reporting "no changes" actually means the
 * chain reproduces `schema.ts`).
 */
export function unmodelledDdl(cwd = process.cwd(), folder = migrationsFolder(cwd)) {
	const chain = readChain(cwd, folder);
	if (chain === null) return [];
	return chain
		.map((m) => ({ tag: m.tag, kinds: unmodelledKinds(m.sql) }))
		.filter((m) => m.kinds.length > 0);
}

/** Distinct kinds across a whole inventory, for a one-line summary. */
export function summarizeKinds(inventory) {
	return [...new Set(inventory.flatMap((m) => m.kinds))].sort();
}

const short = (hash) => hash.slice(0, 12);

/**
 * The `nk check` gate: `{ ok, reason }`, non-exiting. `ok` on a repo with no
 * journal (not every site has a database) and on a chain that matches its seal.
 */
export function checkSeal(cwd = process.cwd()) {
	const folder = migrationsFolder(cwd);
	let state;
	try {
		state = verifySeal(cwd, folder);
	} catch (err) {
		return { ok: false, reason: err.message };
	}
	if (state === null) return { ok: true };
	const problems = [
		...state.changed.map(
			(m) =>
				`${m.tag} changed after it was sealed (${short(m.sealed)} → ${short(m.hash)})`,
		),
		...state.dropped.map(
			(tag) => `${tag} was sealed but is no longer in the journal`,
		),
		...state.unsealed.map((m) => `${m.tag} is unsealed`),
	];
	if (problems.length === 0) return { ok: true };
	return {
		ok: false,
		reason: `migration chain does not match ${folder}/${SEAL_FILE} — ${problems.join("; ")}`,
	};
}

/**
 * `nk migrations [--check|--reseal|--ddl]` — guard the migration chain.
 *
 * Default: verify the seal, then seal anything newly generated and write the
 * file. `--check` verifies without writing (the CI shape: an unsealed migration
 * is a failure, because the seal must land in the same commit as the
 * migration). `--reseal` rewrites every hash — the deliberate squash escape
 * hatch, whose effect is visible in the diff. `--ddl` prints the
 * unmodelled-DDL inventory.
 */
export function migrations(args = []) {
	const cwd = process.cwd();
	const folder = migrationsFolder(cwd);
	const checkOnly = args.includes("--check");

	let state;
	try {
		state = verifySeal(cwd, folder);
	} catch (err) {
		console.error(`nk migrations: ${err.message}`);
		process.exit(1);
	}
	if (state === null) {
		if (!checkOnly) console.log(`nk migrations: no ${folder}/meta/_journal.json.`);
		process.exit(0);
	}

	if (args.includes("--ddl")) {
		printDdl(cwd, folder);
		process.exit(0);
	}

	if (args.includes("--reseal")) {
		writeSeal(cwd, folder, state.chain);
		console.log(
			`nk migrations: resealed ${state.chain.length} migration(s) in ${folder}/${SEAL_FILE}.`,
		);
		for (const m of state.changed) {
			console.log(`  ! ${m.tag}: ${short(m.sealed)} → ${short(m.hash)}`);
		}
		for (const tag of state.dropped) console.log(`  – ${tag} (dropped)`);
		console.log(
			"\n  Every database that already ran a changed or dropped migration must be reconciled (`nk-pg-migrate --baseline`) and verified against the new chain before this ships.",
		);
		process.exit(0);
	}

	const broken = state.changed.length > 0 || state.dropped.length > 0;
	for (const m of state.changed) {
		console.error(
			`nk migrations: ✗ ${m.tag} changed after it was sealed (${short(m.sealed)} → ${short(m.hash)})`,
		);
	}
	for (const tag of state.dropped) {
		console.error(
			`nk migrations: ✗ ${tag} was sealed but is no longer in the journal`,
		);
	}
	if (broken) {
		console.error(
			"\n  An applied migration's bytes are history: every database that ran it recorded that hash. Restore the file (`git checkout`) and express the change as a NEW migration.",
		);
		console.error(
			"  If this is a deliberate squash, run `nk migrations --reseal` and reconcile each database with `nk-pg-migrate --baseline`.",
		);
		process.exit(1);
	}

	if (checkOnly) {
		if (state.unsealed.length > 0) {
			console.error(
				`nk migrations: ✗ ${state.unsealed.length} unsealed migration(s): ${state.unsealed.map((m) => m.tag).join(", ")}`,
			);
			console.error(
				`  → run \`nk migrations\` and commit ${folder}/${SEAL_FILE} alongside the migration.`,
			);
			process.exit(1);
		}
		console.log(
			`nk migrations: ✓ ${state.chain.length} migration(s) match the seal.`,
		);
		process.exit(0);
	}

	if (state.unsealed.length === 0 && state.sealedYet) {
		console.log(
			`nk migrations: ✓ ${state.chain.length} migration(s) match the seal.`,
		);
		process.exit(0);
	}
	writeSeal(cwd, folder, state.chain);
	console.log(
		`nk migrations: sealed ${state.unsealed.length} new migration(s) — commit ${folder}/${SEAL_FILE}.`,
	);
	for (const m of state.unsealed) console.log(`  + ${m.tag}`);
	process.exit(0);
}

function printDdl(cwd, folder) {
	const inventory = unmodelledDdl(cwd, folder);
	if (inventory.length === 0) {
		console.log(
			"nk migrations: no DDL outside drizzle's snapshot model — `db:generate` sees the whole schema.",
		);
		return;
	}
	console.log(
		`nk migrations: ${inventory.length} migration(s) carry DDL drizzle's snapshot cannot model:\n`,
	);
	for (const m of inventory) console.log(`  ${m.tag}  ${m.kinds.join(", ")}`);
	console.log(
		"\n  drizzle diffs schema.ts against meta/*_snapshot.json, so none of this is in the diff basis:",
	);
	console.log(
		"  `db:generate` reporting no changes does NOT mean the chain reproduces the database, and anything",
	);
	console.log(
		"  regenerated from schema.ts (a squash above all) drops these clauses silently. Verify against a real",
	);
	console.log("  database before trusting a regenerated chain.");
}
