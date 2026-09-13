import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// Better Auth moves only with nk-auth: a version that changes a table ships as
// a delta in nk-auth's migration chain, proven against that version's
// `getAuthTables()` by nk-auth's own test. A site that bumps `better-auth` on
// its own reopens the gap (1.7.0 added a column the chain lacked; 1.7.3 then
// rejected the constraint the chain had added), so the site must declare the
// exact version nk-auth's peerDependencies names — not a range, which
// `bun update` would silently walk past the next time.
const AUTH_PACKAGES = ["better-auth", "@better-auth/passkey"];

const readJson = (file) => {
	try {
		return JSON.parse(readFileSync(file, "utf8"));
	} catch {
		return null;
	}
};

/** The exact version nk-auth was released against, or null when not installed. */
function nkAuthPeer(cwd, pkg) {
	const candidates = [
		resolve(cwd, "node_modules/@ingram-tech/nk-auth/package.json"),
		resolve(cwd, "../../node_modules/@ingram-tech/nk-auth/package.json"),
	];
	const file = candidates.find((c) => existsSync(c));
	const manifest = file ? readJson(file) : null;
	const range = manifest?.peerDependencies?.[pkg];
	return typeof range === "string" ? range : null;
}

const isExact = (range) => /^\d+\.\d+\.\d+(-[\w.]+)?$/.test(range);

/**
 * Findings for a site that depends on both nk-auth and a Better Auth package:
 * the site's declared version must be exactly what nk-auth pins. A caret or
 * tilde range is flagged even when it currently resolves to the right version.
 */
export function authVersionFindings(cwd) {
	const out = [];
	const pkg = readJson(resolve(cwd, "package.json"));
	if (!pkg) return out;
	const deps = { ...pkg.dependencies, ...pkg.devDependencies };
	if (!deps["@ingram-tech/nk-auth"]) return out;

	for (const name of AUTH_PACKAGES) {
		const declared = deps[name];
		if (typeof declared !== "string") continue;
		const wanted = nkAuthPeer(cwd, name);
		if (wanted === null || !isExact(wanted)) continue;
		if (declared === wanted) continue;
		const why = isExact(declared)
			? `\`${name}\` is pinned to ${declared} but the installed nk-auth is released against ${wanted}`
			: `\`${name}\` is declared as "${declared}" — a range; nk-auth is released against exactly ${wanted}`;
		out.push({
			id: `auth:version:${name}`,
			level: "error",
			message: `${why}. Better Auth moves only with nk-auth (its chain carries the schema each version needs): pin "${wanted}", run db:migrate against the target database, then deploy.`,
			fix: (dir) => {
				const file = resolve(dir, "package.json");
				const j = readJson(file);
				for (const field of ["dependencies", "devDependencies"]) {
					if (j[field]?.[name] !== undefined) j[field][name] = wanted;
				}
				writeFileSync(file, `${JSON.stringify(j, null, "\t")}\n`);
				return `pinned \`${name}\` → "${wanted}"`;
			},
		});
	}
	return out;
}
