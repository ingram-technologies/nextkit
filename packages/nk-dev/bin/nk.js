#!/usr/bin/env node
import { astGrep } from "../lib/ast-grep.js";
import { dev } from "../lib/dev.js";
import { doctor } from "../lib/doctor.js";
import { format } from "../lib/format.js";
import { init } from "../lib/init.js";
import { knip } from "../lib/knip.js";
import { migrations } from "../lib/migrations.js";
import { build, check, clean, lint, test, typeCheck } from "../lib/passthrough.js";

const USAGE = `nk — the nextkit CLI

Usage: nk <command> [options]

Commands:
  init                Scaffold this project to use nextkit: writes the oxlint /
                      oxfmt / TypeScript / Vitest config, the format-on-commit
                      hook, and the agent-guide import. Skips files that exist.
  doctor [--fix]      Report drift from the canonical nk-dev toolchain (scripts,
                      superseded deps, config extends, guide import, auth pages
                      shadowing Better Auth endpoints); --fix applies.
  dev                 Start the Next dev server (Turbopack). Boots local PGlite
                      first when @ingram-tech/nk-db is installed (no Docker).
  format [--check]    Format code with oxfmt. --check verifies without writing.
  lint [...]          Lint with oxlint (extra args passed through, e.g. --fix).
  knip                Find unused dependencies / exports / files with knip.
  migrations [...]    Guard the drizzle migration chain: verify that no applied
                      migration's bytes changed, and seal newly generated ones.
                      --check verifies without writing (CI); --reseal rewrites
                      every hash (a deliberate squash); --ddl lists the DDL
                      drizzle's snapshot cannot model.
  ast-grep [...]      Structural search & rewrite of TS/TSX by AST pattern
                      (vendored ast-grep; args passed through). For large
                      mechanical refactors — see the codemod skill.
  check               The CI gate: lint + format verify + knip (when configured)
                      + the agent-guide import gate + the migration seal.
  type-check          next typegen && tsc --noEmit. Recovers automatically when
                      generated types are damaged (e.g. a killed dev server).
  clean               Remove regenerable build artifacts: Next's generated
                      types and TypeScript incremental caches.
  test [...]          vitest run (extra args passed through).
  build [...]         next build (extra args passed through).

Code formats with oxfmt and lints with oxlint. SQL is not formatted (it's
generated); nk-dev carries no Prettier.`;

const [cmd, ...rest] = process.argv.slice(2);

switch (cmd) {
	case "init":
		init();
		break;
	case "doctor":
		doctor(rest);
		break;
	case "dev":
		dev(rest);
		break;
	case "format":
		format({ check: rest.includes("--check") });
		break;
	case "lint":
		lint(rest);
		break;
	case "knip":
		knip(rest);
		break;
	case "migrations":
		migrations(rest);
		break;
	case "ast-grep":
		astGrep(rest);
		break;
	case "check":
		check();
		break;
	case "type-check":
		typeCheck();
		break;
	case "clean":
		clean();
		break;
	case "test":
		test(rest);
		break;
	case "build":
		build(rest);
		break;
	case "help":
	case "--help":
	case "-h":
	case undefined:
		console.log(USAGE);
		break;
	default:
		console.error(`nk: unknown command "${cmd}"\n`);
		console.log(USAGE);
		process.exit(1);
}
