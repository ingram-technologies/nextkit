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
//
// Run directly by Node, so the relative import carries a `.js` extension.
import {
	baselineMigrations,
	inspectMigrations,
	MigrationDriftError,
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

const migrationsFolder =
	value("--migrations") ?? value("--migrations-folder") ?? "drizzle";

const main = async (): Promise<void> => {
	if (flag("--status")) {
		const s = await inspectMigrations({ migrationsFolder });
		console.log(
			`nk-pg-migrate: ${s.files.length} file(s), ${s.recorded.length} recorded, ${s.pending.length} pending${s.drifted ? " — DRIFTED" : ""}`,
		);
		if (s.drift) console.log(`  drift: ${s.drift.reason}`);
		if (s.pending.length)
			console.log(`  pending: ${s.pending.map((m) => m.tag).join(", ")}`);
		return;
	}

	if (flag("--baseline")) {
		const { recorded } = await baselineMigrations({ migrationsFolder });
		console.log(
			`nk-pg-migrate: baselined journal to ${recorded.length} migration(s) — recorded as applied, no DDL run.`,
		);
		return;
	}

	const { applied } = await runMigrations({ migrationsFolder });
	console.log(
		applied.length
			? `nk-pg-migrate: applied ${applied.length} migration(s) — ${applied.join(", ")}`
			: "nk-pg-migrate: up to date, nothing to apply.",
	);
};

main().catch((error: unknown) => {
	if (error instanceof MigrationDriftError) {
		console.error(`nk-pg-migrate: ${error.message}`);
		process.exit(2);
	}
	console.error("nk-pg-migrate: migration failed —", error);
	process.exit(1);
});
