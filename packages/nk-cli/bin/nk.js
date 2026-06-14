#!/usr/bin/env node
import { dev } from "../lib/dev.js";
import { format } from "../lib/format.js";
import { build, check, lint, typeCheck } from "../lib/passthrough.js";

const USAGE = `nk — the nextkit CLI

Usage: nk <command> [options]

Commands:
  dev                 Start the Next dev server. Boots local PGlite first when
                      @ingram-tech/nk-db is installed (no Docker); else plain dev.
  format [--check]    Format code with the configured formatter (oxfmt) and SQL
                      with Prettier. --check verifies without writing (for CI).
  lint                Lint with the configured formatter.
  check               Lint + format verification, plus the agent-guide import
                      gate (the CI gate).
  type-check          next typegen && tsc --noEmit.
  build [...]         next build (extra args passed through).

The formatter is oxc (oxlint + oxfmt) by default. Switch it per-site with
{ "nk": { "formatter": "biome" } } in package.json.`;

const [cmd, ...rest] = process.argv.slice(2);

switch (cmd) {
	case "dev":
		dev(rest);
		break;
	case "format":
		await format({ check: rest.includes("--check") });
		break;
	case "lint":
		lint();
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
