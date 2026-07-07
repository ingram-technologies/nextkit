import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import plugin from "../lib/oxlint-plugins/base-ui.js";

const rule = plugin.rules["no-radix-props-on-base-ui"];

// Minimal stand-ins for the oxlint JSXAttribute node the visitor reads.
const attr = (component, prop) => ({
	type: "JSXAttribute",
	name: { type: "JSXIdentifier", name: prop },
	parent: {
		type: "JSXOpeningElement",
		name: { type: "JSXIdentifier", name: component },
	},
});

const runOn = (dir, node) => {
	const reports = [];
	const context = {
		physicalFilename: join(dir, "Component.tsx"),
		report: (diagnostic) => reports.push(diagnostic),
	};
	const visitor = rule.create(context);
	visitor.JSXAttribute?.(node);
	return reports;
};

describe("no-radix-props-on-base-ui", () => {
	let dir;
	afterEach(() => {
		if (dir) rmSync(dir, { recursive: true, force: true });
	});

	const projectWith = (deps) => {
		dir = mkdtempSync(join(tmpdir(), "nk-oxlint-"));
		writeFileSync(join(dir, "package.json"), JSON.stringify(deps));
		return dir;
	};

	it("flags onSelect on a Base UI menu item and names the replacement", () => {
		const d = projectWith({ dependencies: { "@base-ui/react": "^1.6.0" } });
		const reports = runOn(d, attr("DropdownMenuItem", "onSelect"));
		expect(reports).toHaveLength(1);
		expect(reports[0].message).toContain("onClick");
	});

	it("covers the checkbox/radio and menubar/context variants", () => {
		const d = projectWith({ dependencies: { "@base-ui/react": "^1.6.0" } });
		for (const component of [
			"DropdownMenuCheckboxItem",
			"MenubarItem",
			"ContextMenuRadioItem",
		]) {
			expect(runOn(d, attr(component, "onSelect"))).toHaveLength(1);
		}
	});

	it("does not flag the already-correct onClick", () => {
		const d = projectWith({ dependencies: { "@base-ui/react": "^1.6.0" } });
		expect(runOn(d, attr("DropdownMenuItem", "onClick"))).toHaveLength(0);
	});

	it("does not flag onSelect on cmdk CommandItem (a legitimate API)", () => {
		const d = projectWith({ dependencies: { "@base-ui/react": "^1.6.0" } });
		expect(runOn(d, attr("CommandItem", "onSelect"))).toHaveLength(0);
	});

	it("is inert on projects that do not depend on @base-ui/react (Radix)", () => {
		const d = projectWith({
			dependencies: { "@radix-ui/react-dropdown-menu": "^2.0.0" },
		});
		expect(runOn(d, attr("DropdownMenuItem", "onSelect"))).toHaveLength(0);
	});
});
