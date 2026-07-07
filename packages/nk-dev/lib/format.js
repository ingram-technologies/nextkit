import { FORMATTER } from "./formatter.js";
import { run } from "./run.js";

/**
 * `nk format` / `nk format --check`.
 *
 * Code (JS/TS/JSON/CSS) goes through oxfmt — the one formatter nk owns. SQL is
 * intentionally NOT formatted: it's almost entirely generated (drizzle
 * migrations, `pg_dump` baselines, pglite fixtures), so a SQL formatter only
 * churns generated files and chokes on psql directives (`\restrict`, …) for no
 * real gain. Hand-written SQL is rare and fine unformatted. This is why nk-dev
 * carries no `prettier` dependency.
 */
export function format({ check }) {
	const op = check ? FORMATTER.checkFormat : FORMATTER.write;
	process.exit(run(op[0], op[1]));
}
