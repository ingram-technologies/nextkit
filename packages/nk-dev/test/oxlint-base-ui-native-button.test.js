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

const lint = (source, { baseUi = true } = {}) => {
	const dir = mkdtempSync(join(tmpdir(), "nk-oxlint-native-button-"));
	dirs.push(dir);
	writeFileSync(
		join(dir, "package.json"),
		JSON.stringify({
			name: "fixture",
			dependencies: baseUi
				? { "@base-ui/react": "^1.8.0" }
				: { "@radix-ui/react-dialog": "^1.0.0" },
		}),
	);
	writeFileSync(
		join(dir, ".oxlintrc.json"),
		JSON.stringify({
			jsPlugins: [pluginPath],
			rules: { "nextkit/base-ui-native-button": "error" },
		}),
	);
	writeFileSync(join(dir, "fixture.tsx"), source);
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

/**
 * Base UI's useButton defaults `nativeButton` to true, so rendering an anchor
 * through `render` without setting it false strips the button semantics and
 * logs at runtime. Types stay silent, hence the rule.
 */
describe("nextkit/base-ui-native-button", () => {
	it("flags a link render with no nativeButton", () => {
		const out = lint('const x = <Button render={<Link href="/a" />} />;');
		expect(out).toContain("base-ui-native-button");
		expect(out).toContain("nativeButton={false}");
	});

	it("flags nativeButton={true}, which is the default spelled out", () => {
		const out = lint(
			'const x = <Button nativeButton={true} render={<a href="/a" />} />;',
		);
		expect(out).toContain("base-ui-native-button");
	});

	it("flags a namespaced Trigger, which Base UI also builds on useButton", () => {
		const out = lint("const x = <Menu.Trigger render={<Link />} />;");
		expect(out).toContain("base-ui-native-button");
	});

	it("flags a spread, which is not an explicit nativeButton={false}", () => {
		const out = lint("const x = <Button {...props} render={<Link />} />;");
		expect(out).toContain("base-ui-native-button");
	});

	it("allows nativeButton={false}", () => {
		expect(
			lint("const x = <Button nativeButton={false} render={<Link />} />;"),
		).toBe("");
	});

	it("allows the intrinsic button element", () => {
		expect(lint('const x = <Button render={<button type="submit" />} />;')).toBe(
			"",
		);
	});

	it("allows a component that is itself a button", () => {
		// The design-system Button is Base UI's own primitive: it renders a
		// native <button>, so nativeButton must stay true.
		expect(lint("const x = <DropdownMenuTrigger render={<Button />} />;")).toBe("");
		expect(
			lint("const x = <SidebarMenuButton render={<SidebarMenuButton />} />;"),
		).toBe("");
	});

	it("still reports a non-button component render", () => {
		expect(lint("const x = <TooltipTrigger render={<span />} />;")).toContain(
			"base-ui-native-button",
		);
		expect(lint("const x = <DialogTrigger render={<Badge />} />;")).toContain(
			"base-ui-native-button",
		);
	});

	it("does not follow a render value that is not an element literal", () => {
		expect(lint("const x = <Button render={element} />;")).toBe("");
		expect(lint("const x = <Button render={renderLink()} />;")).toBe("");
	});

	it("leaves components that are not button-like alone", () => {
		expect(lint("const x = <Popover render={<Link />} />;")).toBe("");
	});

	it("is inert on projects that do not depend on @base-ui/react", () => {
		expect(lint("const x = <Button render={<Link />} />;", { baseUi: false })).toBe(
			"",
		);
	});
});
