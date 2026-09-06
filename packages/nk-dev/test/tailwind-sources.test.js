import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { tailwindSourceFindings } from "../lib/tailwind-sources.js";

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
