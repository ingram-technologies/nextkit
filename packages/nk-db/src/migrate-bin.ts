#!/usr/bin/env node
// The `nk-pg-migrate` bin — a drop-in replacement for `drizzle-kit migrate` in a
// site's `db:migrate` script. Unlike drizzle-kit it surfaces the real Postgres
// error on failure (not an opaque exit 1), refuses to run against a drifted
// journal with an actionable message, and can reconcile a drifted-but-correct
// journal with `--baseline`.
//
// Connection comes from the env contract (DATABASE_URL [+ DATABASE_CA_CERT], or
// the nk-db `dbEnv()` vars). Run it via `bun run db:migrate` so the runner loads
// your `.env` / `.env.local` into the environment first.
//
//   nk-pg-migrate                 apply pending migrations
//   nk-pg-migrate --status        print journal status, apply nothing
//   nk-pg-migrate --baseline      record the current file chain as applied,
//                                 WITHOUT running DDL (push-built / regenerated
//                                 baseline whose schema already matches)
//   nk-pg-migrate --migrations <folder>   (default: drizzle)
//   nk-pg-migrate --table <name>          journal table (default:
//                                         __drizzle_migrations); a dependency
//                                         chain such as nk-auth's keeps its own
//
// Any other argument is refused, so a misspelt or unsupported flag cannot
// silently run against the wrong journal.
//
// Run directly by Node, so the relative import carries a `.js` extension.
import {
	baselineMigrations,
	inspectMigrations,
	MigrationDriftError,
	MigrationOrderError,
	runMigrations,
} from "./migrate.js";

const argv = process.argv.slice(2);
const flag = (name: string): boolean => argv.includes(name);
const value = (name: string): string | undefined => {
	const i = argv.indexOf(name);
	const next = i >= 0 ? argv[i + 1] : undefined;
	// `--migrations --status` must not eat the flag as its value (or silently
	// fall back to the default on a trailing `--migrations`).
	if (i >= 0 && (next === undefined || next.startsWith("--"))) {
		console.error(`nk-pg-migrate: ${name} requires a value`);
		process.exit(1);
	}
	return next;
};

const FLAGS = new Set(["--status", "--baseline"]);
const VALUES = new Set(["--migrations", "--migrations-folder", "--table"]);
for (let i = 0; i < argv.length; i++) {
	const arg = argv[i];
	if (arg !== undefined && VALUES.has(arg)) i++;
	else if (arg === undefined || !FLAGS.has(arg)) {
		console.error(`nk-pg-migrate: unknown argument ${arg}`);
		process.exit(1);
	}
}

const migrationsFolder =
	value("--migrations") ?? value("--migrations-folder") ?? "drizzle";
const migrationsTable = value("--table");
const config = { migrationsFolder, migrationsTable };

const main = async (): Promise<void> => {
	if (flag("--status")) {
		const s = await inspectMigrations(config);
		console.log(
			`nk-pg-migrate: ${s.files.length} file(s), ${s.recorded.length} recorded, ${s.pending.length} pending${s.drifted ? " — DRIFTED" : ""}`,
		);
		if (s.drift) console.log(`  drift: ${s.drift.reason}`);
		if (s.pending.length)
			console.log(`  pending: ${s.pending.map((m) => m.tag).join(", ")}`);
		if (s.unreachable.length) {
			console.log(
				`  UNREACHABLE (the migrator would skip these silently): ${s.unreachable.map((m) => m.tag).join(", ")}`,
			);
		}
		if (s.journalIssues.length)
			console.log(`  journal: ${s.journalIssues.join("; ")}`);
		return;
	}

	if (flag("--baseline")) {
		const { recorded } = await baselineMigrations(config);
		console.log(
			`nk-pg-migrate: baselined journal to ${recorded.length} migration(s) — recorded as applied, no DDL run.`,
		);
		return;
	}

	const { applied } = await runMigrations(config);
	console.log(
		applied.length
			? `nk-pg-migrate: applied ${applied.length} migration(s) — ${applied.join(", ")}`
			: "nk-pg-migrate: up to date, nothing to apply.",
	);
};

main().catch((error: unknown) => {
	if (error instanceof MigrationDriftError || error instanceof MigrationOrderError) {
		console.error(`nk-pg-migrate: ${error.message}`);
		process.exit(2);
	}
	console.error("nk-pg-migrate: migration failed —", error);
	process.exit(1);
});
