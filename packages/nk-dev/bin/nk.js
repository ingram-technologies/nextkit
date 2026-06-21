#!/usr/bin/env node
import { dev } from "../lib/dev.js";
import { format } from "../lib/format.js";
import { init } from "../lib/init.js";
import { knip } from "../lib/knip.js";
import { build, check, lint, typeCheck } from "../lib/passthrough.js";

const USAGE = `nk — the nextkit CLI

Usage: nk <command> [options]

Commands:
  init                Scaffold this project to use nextkit: writes the oxlint /
                      oxfmt / TypeScript / Vitest config, the format-on-commit
                      hook, and the agent-guide import. Skips files that exist.
  dev                 Start the Next dev server. Boots local PGlite first when
                      @ingram-tech/nk-db is installed (no Docker); else plain dev.
  format [--check]    Format code with oxfmt and SQL with Prettier. --check
                      verifies without writing (for CI).
  lint                Lint with oxlint.
  knip                Find unused dependencies / exports / files with knip.
  check               The CI gate: lint + format verify + SQL + knip (when
                      configured) + the agent-guide import gate.
  type-check          next typegen && tsc --noEmit.
  build [...]         next build (extra args passed through).

Code formats with oxfmt and lints with oxlint; SQL formats with Prettier.`;

const [cmd, ...rest] = process.argv.slice(2);

switch (cmd) {
	case "init":
		init();
		break;
	case "dev":
		dev(rest);
		break;
	case "format":
		await format({ check: rest.includes("--check") });
		break;
	case "lint":
		lint();
		break;
	case "knip":
		knip(rest);
		break;
	case "check":
		await check();
		break;
	case "type-check":
		typeCheck();
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
