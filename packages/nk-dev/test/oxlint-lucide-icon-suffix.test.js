import { describe, expect, it } from "vitest";
import { fix as fixRule, lint as lintRule, ruleIds } from "./oxlint-harness.js";

const RULE = "nextkit/lucide-icon-suffix";
const options = { filename: "fixture.tsx" };
const lint = (source) => lintRule("lucide-icon-suffix", source, options);
const fix = (source) => fixRule("lucide-icon-suffix", source, options);

describe("lucide-icon-suffix", () => {
	it("flags a bare icon import and fixes the import plus its references", () => {
		const src = `import { Home } from "lucide-react";\nexport const A = () => <Home />;`;
		expect(ruleIds(lint(src))).toEqual([RULE]);
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
		expect(lint(`import { ArrowRightIcon } from "lucide-react";`)).toEqual([]);
	});

	it("does not flag non-icon exports of the package", () => {
		expect(
			lint(
				`import { LucideProps, icons, dynamicIconImports } from "lucide-react";`,
			),
		).toEqual([]);
	});

	it("ignores identically-named imports from other packages", () => {
		expect(lint(`import { Home } from "./local";`)).toEqual([]);
	});
});
