import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	tailwindCoverageFindings,
	tailwindSourceFindings,
} from "../lib/tailwind-sources.js";

/**
 * Tailwind resolves `@source` against the stylesheet and treats a path that
 * matches nothing as an empty scan, so the classes those files use vanish from
 * the build with no error anywhere. `nk check` resolves the paths instead.
 */
describe("nk check: tailwind @source paths", () => {
	let dir;
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), "nk-tailwind-"));
	});
	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	const write = (rel, content = "") => {
		const full = join(dir, rel);
		mkdirSync(dirname(full), { recursive: true });
		writeFileSync(full, content);
	};

	it("passes when every source resolves", () => {
		write("packages/ui/src/button.tsx");
		write(
			"apps/web/src/styles/tailwind.css",
			'@import "tailwindcss";\n@source "../../../../packages/ui/src";\n',
		);
		expect(tailwindSourceFindings(dir)).toEqual([]);
	});

	it("flags a path that resolves to nothing", () => {
		write("packages/ui/src/button.tsx");
		// One `../` short: resolves to apps/packages/ui/src, which does not exist.
		write(
			"apps/web/src/styles/tailwind.css",
			'@import "tailwindcss";\n@source "../../../packages/ui/src";\n',
		);
		const findings = tailwindSourceFindings(dir);
		expect(findings).toHaveLength(1);
		expect(findings[0]).toMatchObject({
			file: "apps/web/src/styles/tailwind.css",
			source: "../../../packages/ui/src",
		});
	});

	it("checks the literal prefix of a globbed source", () => {
		write("app/globals.css", '@source "../packages/*/src/**/*.tsx";\n');
		expect(tailwindSourceFindings(dir)).toHaveLength(1);
		write("packages/ui/src/button.tsx");
		expect(tailwindSourceFindings(dir)).toEqual([]);
	});

	it("ignores inline sources and vendored trees", () => {
		write("app/globals.css", '@source inline("underline");\n');
		write("node_modules/pkg/dist/x.css", '@source "./nowhere";\n');
		expect(tailwindSourceFindings(dir)).toEqual([]);
	});

	it("is a no-op on a site with no tailwind sources", () => {
		write("app/globals.css", "body { margin: 0 }\n");
		expect(tailwindSourceFindings(dir)).toEqual([]);
	});
});

/**
 * The other half: tailwind's automatic detection scans the site, never a
 * sibling workspace package, so a component library nobody names in an
 * `@source` contributes no classes at all. Resolution alone cannot see that.
 */
describe("nk check: workspace packages a stylesheet scans", () => {
	let dir;
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), "nk-tailwind-cov-"));
	});
	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	const write = (rel, content = "") => {
		const full = join(dir, rel);
		mkdirSync(dirname(full), { recursive: true });
		writeFileSync(full, content);
	};

	// A workspace member as the package managers leave it: real source in
	// packages/, symlinked into the root node_modules the site resolves from.
	const link = (name, target) => {
		const path = join(dir, "node_modules", name);
		mkdirSync(dirname(path), { recursive: true });
		symlinkSync(join(dir, target), path, "dir");
	};

	const site = (deps, css) => {
		write(
			"apps/web/package.json",
			JSON.stringify({ name: "web", dependencies: deps }),
		);
		write("apps/web/src/styles/tailwind.css", css);
		return join(dir, "apps/web");
	};

	it("flags a linked package whose classes nothing scans", () => {
		write(
			"packages/ui/src/button.tsx",
			'export const B = () => <b className="p-1" />;',
		);
		link("@acme/ui", "packages/ui");
		const cwd = site({ "@acme/ui": "workspace:*" }, '@import "tailwindcss";\n');
		expect(tailwindCoverageFindings(cwd)).toEqual([
			{ name: "@acme/ui", dir: "../../packages/ui" },
		]);
	});

	it("passes once a source names it", () => {
		write(
			"packages/ui/src/button.tsx",
			'export const B = () => <b className="p-1" />;',
		);
		link("@acme/ui", "packages/ui");
		const cwd = site(
			{ "@acme/ui": "workspace:*" },
			'@import "tailwindcss";\n@source "../../../../packages/ui/src";\n',
		);
		expect(tailwindCoverageFindings(cwd)).toEqual([]);
	});

	it("ignores a workspace package that writes no class names", () => {
		write("packages/db/src/schema.ts", "export const schema = {};");
		link("@acme/db", "packages/db");
		const cwd = site({ "@acme/db": "workspace:*" }, '@import "tailwindcss";\n');
		expect(tailwindCoverageFindings(cwd)).toEqual([]);
	});

	it("ignores published dependencies", () => {
		write(
			"node_modules/lib/index.tsx",
			'export const B = () => <b className="p-1" />;',
		);
		const cwd = site({ lib: "^1.0.0" }, '@import "tailwindcss";\n');
		expect(tailwindCoverageFindings(cwd)).toEqual([]);
	});

	it("is a no-op on a site with no tailwind entry", () => {
		write(
			"packages/ui/src/button.tsx",
			'export const B = () => <b className="p-1" />;',
		);
		link("@acme/ui", "packages/ui");
		const cwd = site({ "@acme/ui": "workspace:*" }, "body { margin: 0 }\n");
		expect(tailwindCoverageFindings(cwd)).toEqual([]);
	});
});
