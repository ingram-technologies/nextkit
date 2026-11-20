import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pkg: unknown = JSON.parse(
	readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
const optionalPeers = Object.keys(
	typeof pkg === "object" &&
		pkg !== null &&
		"peerDependenciesMeta" in pkg &&
		typeof pkg.peerDependenciesMeta === "object" &&
		pkg.peerDependenciesMeta !== null
		? pkg.peerDependenciesMeta
		: {},
).filter((name) => name.startsWith("@better-auth/"));

const SPECIFIER = /^\s*(?:import|export)\b[^"']*?from\s+["']([^"']+)["']/gm;

/** Every module specifier `./client` reaches through its relative imports. */
const reachable = (file: string, seen = new Set<string>()): Set<string> => {
	const specifiers = new Set<string>();
	if (seen.has(file)) return specifiers;
	seen.add(file);
	const source = readFileSync(new URL(file, import.meta.url), "utf8");
	for (const [, spec] of source.matchAll(SPECIFIER)) {
		if (spec === undefined) continue;
		specifiers.add(spec);
		if (spec.startsWith("./")) {
			for (const s of reachable(spec.replace(/\.js$/, ".ts"), seen))
				specifiers.add(s);
		}
	}
	return specifiers;
};

describe("./client", () => {
	it("imports no optional Better Auth peer", () => {
		expect(optionalPeers).toContain("@better-auth/passkey");
		const specifiers = [...reachable("./client.ts")];
		expect(specifiers).toContain("better-auth/react");
		const optional = specifiers.filter((spec) =>
			optionalPeers.some((peer) => spec === peer || spec.startsWith(`${peer}/`)),
		);
		expect(optional).toEqual([]);
	});
});
