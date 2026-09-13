#!/usr/bin/env node
// The `nk-pg-fingerprint` bin: the squash / baseline equivalence gate.
//
//   nk-pg-fingerprint chain out.json [--migrations drizzle] [--dep <folder>]... [--id758]
//                     [--ext <module>[:<export>]]... [--pre "<sql>"]...
//   nk-pg-fingerprint db out.json              connection from the env contract (DATABASE_URL [+ DATABASE_CA_CERT])
//   nk-pg-fingerprint <postgres://…> out.json  an explicit URL
//   nk-pg-fingerprint diff a.json b.json       set-wise per key; exit 2 on any difference
//
// Both fingerprint modes take --schemas a,b and --roles r1,r2. Run it from the
// workspace that depends on @electric-sql/pglite (chain mode imports it), via
// `bun run` so your .env is loaded.
//
// Run directly by Node, so the relative import carries a `.js` extension.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import {
	diffFingerprints,
	fingerprintChain,
	fingerprintDatabase,
	formatFingerprintDiff,
} from "./fingerprint.js";

const argv = process.argv.slice(2);
const VALUE_FLAGS = new Set([
	"--migrations",
	"--dep",
	"--ext",
	"--pre",
	"--schemas",
	"--roles",
]);
const flag = (name: string): boolean => argv.includes(name);
const values = (name: string): string[] =>
	argv.flatMap((a, i) => (argv[i - 1] === name && !a.startsWith("--") ? [a] : []));
const value = (name: string): string | undefined => values(name)[0];
const words = argv.filter(
	(a, i) =>
		!a.startsWith("--") &&
		!(argv[i - 1] !== undefined && VALUE_FLAGS.has(argv[i - 1] ?? "")),
);
const scope = {
	schemas: value("--schemas")?.split(","),
	roles: value("--roles")?.split(","),
};

const usage = (): never => {
	console.error(
		"usage: nk-pg-fingerprint <chain|db|URL> <out.json> [--migrations drizzle] [--dep folder] [--id758] [--ext module[:export]] [--pre sql] [--schemas a,b] [--roles r1,r2]\n       nk-pg-fingerprint diff a.json b.json",
	);
	return process.exit(1);
};

const main = async (): Promise<void> => {
	const [mode, a, b] = words;
	if (mode === "diff") {
		if (a === undefined || b === undefined) return usage();
		const read = (p: string) =>
			JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown[]>;
		const differences = diffFingerprints(read(a), read(b));
		console.log(formatFingerprintDiff(differences, [a, b]));
		process.exit(differences.length === 0 ? 0 : 2);
	}
	if (mode === undefined || a === undefined) return usage();
	let fingerprint;
	if (mode === "chain") {
		const req = createRequire(join(process.cwd(), "package.json"));
		const extensions: Record<string, unknown> = {};
		for (const spec of values("--ext")) {
			const [mod = "", name = "vector"] = spec.split(":");
			const loaded = (await import(req.resolve(mod))) as Record<string, unknown>;
			extensions[name] = loaded[name] ?? loaded.default;
		}
		fingerprint = await fingerprintChain({
			...scope,
			migrationsFolder: value("--migrations") ?? "drizzle",
			dependencyMigrations: values("--dep"),
			id758: flag("--id758"),
			extensions,
			pre: values("--pre"),
			resolveFrom: process.cwd(),
		});
	} else {
		fingerprint = await fingerprintDatabase({
			...scope,
			...(mode === "db" ? {} : { connectionString: mode }),
		});
	}
	mkdirSync(dirname(a), { recursive: true });
	writeFileSync(a, `${JSON.stringify(fingerprint, null, "\t")}\n`);
	console.log(`nk-pg-fingerprint: written to ${a}`);
};

main().catch((error: unknown) => {
	console.error(
		`nk-pg-fingerprint: ${error instanceof Error ? error.message : String(error)}`,
	);
	process.exit(1);
});
