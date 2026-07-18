import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

const setup = (source) => {
	const dir = mkdtempSync(join(tmpdir(), "nk-oxlint-lucide-"));
	dirs.push(dir);
	writeFileSync(
		join(dir, ".oxlintrc.json"),
		JSON.stringify({
			jsPlugins: [pluginPath],
			rules: { "nextkit/lucide-icon-suffix": "error" },
		}),
	);
	const file = join(dir, "fixture.tsx");
	writeFileSync(file, source);
	return { dir, file };
};

const lint = (source) => {
	const { dir } = setup(source);
	try {
		execFileSync("oxlint", ["-c", ".oxlintrc.json", "fixture.tsx"], {
			cwd: dir,
			encoding: "utf8",
		});
		return "";
	} catch (error) {
		return String(error.stdout ?? "");
	}
};

const fix = (source) => {
	const { dir, file } = setup(source);
	try {
		execFileSync("oxlint", ["-c", ".oxlintrc.json", "--fix", "fixture.tsx"], {
			cwd: dir,
			encoding: "utf8",
		});
	} catch {
		// file is written with applied fixes even on a non-zero exit.
	}
	return readFileSync(file, "utf8");
};

describe("lucide-icon-suffix", () => {
	it("flags a bare icon import and fixes the import plus its references", () => {
		const src = `import { Home } from "lucide-react";\nexport const A = () => <Home />;`;
		expect(lint(src)).toContain("lucide-icon-suffix");
		expect(fix(src)).toBe(
			`import { HomeIcon } from "lucide-react";\nexport const A = () => <HomeIcon />;`,
		);
	});

	it("only renames the import when the local name is aliased", () => {
		const src = `import { Home as HomeGlyph } from "lucide-react";\nexport const A = () => <HomeGlyph />;`;
		expect(fix(src)).toBe(
			`import { HomeIcon as HomeGlyph } from "lucide-react";\nexport const A = () => <HomeGlyph />;`,
		);
	});

	it("does not flag already-suffixed imports", () => {
		expect(lint(`import { ArrowRightIcon } from "lucide-react";`)).toBe("");
	});

	it("does not flag non-icon exports of the package", () => {
		expect(
			lint(
				`import { LucideProps, icons, dynamicIconImports } from "lucide-react";`,
			),
		).toBe("");
	});

	it("ignores identically-named imports from other packages", () => {
		expect(lint(`import { Home } from "./local";`)).toBe("");
	});
});
