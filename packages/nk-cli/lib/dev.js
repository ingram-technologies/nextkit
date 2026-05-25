import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { capture, fail, run } from "./run.js";

const SUPABASE_CONFIG = "supabase/config.toml";

// The house mapping from Supabase's local status output to the env var names our
// apps actually read (the publishable/secret-key naming @supabase/ssr expects).
// Undocumented `supabase status` override keys — see peppost's old dev.sh.
const STATUS_OVERRIDES = [
	"--override-name",
	"api.url=SUPABASE_URL",
	"--override-name",
	"auth.publishable_key=NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
	"--override-name",
	"auth.secret_key=SUPABASE_SECRET_KEY",
];

/**
 * `nk dev` — start the Next dev server. If the site has a local Supabase
 * (`supabase/config.toml`), boot it first and inject its connection env so the
 * app talks to the local stack. The standard, correct way to run a Supabase +
 * Next site locally, so no per-site dev.sh to maintain.
 */
export function dev(extraArgs = []) {
	const env = { ...process.env };

	if (existsSync(resolve(process.cwd(), SUPABASE_CONFIG))) {
		console.log("nk: supabase/config.toml found — starting local Supabase…");
		if (run("supabase", ["start"]) !== 0) fail("`supabase start` failed.");
		const statusEnv = capture("supabase", [
			"status",
			"-o",
			"env",
			...STATUS_OVERRIDES,
		]);
		Object.assign(env, parseEnv(statusEnv));
	}

	// Hand off to Next. spawnSync inherits stdio and blocks until exit, so
	// Ctrl-C reaches the dev server.
	const res = spawnSync("bunx", ["next", "dev", "--turbopack", ...extraArgs], {
		stdio: "inherit",
		env,
	});
	process.exit(res.status ?? 0);
}

/** Parse `KEY=value` / `KEY="value"` lines from `supabase status -o env`. */
function parseEnv(text) {
	const out = {};
	for (const line of text.split("\n")) {
		const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
		if (!match) continue;
		let value = match[2].trim();
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}
		out[match[1]] = value;
	}
	return out;
}
