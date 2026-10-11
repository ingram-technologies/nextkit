import { describe, expect, it } from "vitest";
import { lint as lintRule, ruleIds } from "./oxlint-harness.js";

const RULE = "nextkit/no-radix-props-on-base-ui";
const BASE_UI = { dependencies: { "@base-ui/react": "^1.6.0" } };

const lint = (source, { packageJson = BASE_UI, filename = "fixture.tsx" } = {}) =>
	lintRule("no-radix-props-on-base-ui", source, { filename, packageJson });

describe("no-radix-props-on-base-ui", () => {
	it("flags onSelect on a Base UI menu item and names the replacement", () => {
		const out = lint("const x = <DropdownMenuItem onSelect={go} />;");
		expect(ruleIds(out)).toEqual([RULE]);
		expect(out[0].message).toContain("`onClick`");
	});

	it("covers the checkbox/radio and menubar/context variants", () => {
		for (const component of [
			"DropdownMenuCheckboxItem",
			"MenubarItem",
			"ContextMenuRadioItem",
		]) {
			expect(ruleIds(lint(`const x = <${component} onSelect={go} />;`))).toEqual([
				RULE,
			]);
		}
	});

	it("does not flag the already-correct onClick", () => {
		expect(lint("const x = <DropdownMenuItem onClick={go} />;")).toEqual([]);
	});

	it("does not flag onSelect on cmdk CommandItem (a legitimate API)", () => {
		expect(lint("const x = <CommandItem onSelect={go} />;")).toEqual([]);
	});

	it("is inert on projects that do not depend on @base-ui/react (Radix)", () => {
		expect(
			lint("const x = <DropdownMenuItem onSelect={go} />;", {
				packageJson: {
					dependencies: { "@radix-ui/react-dropdown-menu": "^2.0.0" },
				},
			}),
		).toEqual([]);
	});

	it("finds the project's package.json from a nested file", () => {
		// The gate walks up from the file's directory to the nearest manifest.
		const out = lint("const x = <DropdownMenuItem onSelect={go} />;", {
			filename: "src/components/ui/menu.tsx",
		});
		expect(ruleIds(out)).toEqual([RULE]);
	});
});
