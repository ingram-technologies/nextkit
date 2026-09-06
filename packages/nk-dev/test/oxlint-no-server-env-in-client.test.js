import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const pluginPath = join(
	dirname(fileURLToPath(import.meta.url)),
	"../lib/oxlint-plugins/index.js",
);

const dirs = [];
afterEach(() => {
	for (const dir of dirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

const lint = (source, filename = "fixture.tsx") => {
	const dir = mkdtempSync(join(tmpdir(), "nk-oxlint-client-env-"));
	dirs.push(dir);
	writeFileSync(
		join(dir, ".oxlintrc.json"),
		JSON.stringify({
			jsPlugins: [pluginPath],
			rules: { "nextkit/no-server-env-in-client": "error" },
		}),
	);
	writeFileSync(join(dir, filename), source);
	try {
		execFileSync("oxlint", ["-c", ".oxlintrc.json", filename], {
			cwd: dir,
			encoding: "utf8",
		});
		return "";
	} catch (error) {
		return String(error.stdout ?? "");
	}
};

/**
 * Next only inlines `NEXT_PUBLIC_*` into client bundles, so any other env var
 * read from a `"use client"` file is `undefined` in the browser while working
 * everywhere else. The failure is silent: the feature just never happens.
 */
describe("nextkit/no-server-env-in-client", () => {
	it("flags a secret read from a client file", () => {
		const out = lint(
			['"use client";', "export const key = process.env.STRIPE_SECRET_KEY;"].join(
				"\n",
			),
		);
		expect(out).toContain("no-server-env-in-client");
		expect(out).toContain("STRIPE_SECRET_KEY");
	});

	it("flags a computed read too", () => {
		const out = lint(
			['"use client";', 'export const k = process.env["API_TOKEN"];'].join("\n"),
		);
		expect(out).toContain("no-server-env-in-client");
	});

	it("allows NEXT_PUBLIC_ and NODE_ENV", () => {
		const out = lint(
			[
				'"use client";',
				"export const url = process.env.NEXT_PUBLIC_SITE_URL;",
				'export const dev = process.env.NODE_ENV === "development";',
			].join("\n"),
		);
		expect(out).toBe("");
	});

	it("leaves server files alone", () => {
		const out = lint("export const key = process.env.STRIPE_SECRET_KEY;");
		expect(out).toBe("");
	});

	it("reads the directive, not the string", () => {
		// "use client" further down the file is a value, not a directive.
		const out = lint(
			[
				'export const mode = "use client";',
				"export const key = process.env.STRIPE_SECRET_KEY;",
			].join("\n"),
		);
		expect(out).toBe("");
	});
});
