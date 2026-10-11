import { describe, expect, it } from "vitest";
import { lint as lintRule, ruleIds } from "./oxlint-harness.js";

const RULE = "nextkit/base-ui-native-button";

const lint = (source, { baseUi = true } = {}) =>
	lintRule("base-ui-native-button", source, {
		filename: "fixture.tsx",
		packageJson: {
			name: "fixture",
			dependencies: baseUi
				? { "@base-ui/react": "^1.8.0" }
				: { "@radix-ui/react-dialog": "^1.0.0" },
		},
	});

/**
 * Base UI's useButton defaults `nativeButton` to true, so rendering an anchor
 * through `render` without setting it false strips the button semantics and
 * logs at runtime. Types stay silent, hence the rule.
 */
describe("nextkit/base-ui-native-button", () => {
	it("flags a link render with no nativeButton and names host and element", () => {
		const out = lint('const x = <Button render={<Link href="/a" />} />;');
		expect(ruleIds(out)).toEqual([RULE]);
		expect(out[0].message).toContain("`Button`");
		expect(out[0].message).toContain("<Link>");
	});

	it("flags nativeButton={true}, which is the default spelled out", () => {
		const out = lint(
			'const x = <Button nativeButton={true} render={<a href="/a" />} />;',
		);
		expect(ruleIds(out)).toEqual([RULE]);
	});

	it("flags the namespace form of a host, Popover.Trigger", () => {
		const out = lint('const x = <Popover.Trigger render={<a href="/a" />} />;');
		expect(ruleIds(out)).toEqual([RULE]);
		expect(out[0].message).toContain("`Popover.Trigger`");
	});

	it("leaves menu items alone: their nativeButton defaults to false", () => {
		// Base UI's Menu.Item extends NonNativeButtonProps and renders a <div>,
		// so rendering a link through it is already correct.
		expect(lint("const x = <DropdownMenuItem render={<Link />} />;")).toEqual([]);
		expect(lint('const x = <Menu.Item render={<a href="/a" />} />;')).toEqual([]);
	});

	it("does not yet cover the other default-true triggers", () => {
		// Intentional tripwire: Menu.Trigger does take `nativeButton` (default
		// true) in Base UI 1.8.0, but the host list is exact and does not name
		// it yet. This fails on purpose the day the list is widened; flip it to
		// expect a report then.
		expect(lint("const x = <Menu.Trigger render={<Link />} />;")).toEqual([]);
	});

	it("flags a spread, which is not an explicit nativeButton={false}", () => {
		const out = lint("const x = <Button {...props} render={<Link />} />;");
		expect(ruleIds(out)).toEqual([RULE]);
	});

	it("allows nativeButton={false}", () => {
		expect(
			lint("const x = <Button nativeButton={false} render={<Link />} />;"),
		).toEqual([]);
	});

	it("allows the intrinsic button element", () => {
		expect(lint('const x = <Button render={<button type="submit" />} />;')).toEqual(
			[],
		);
	});

	it("allows a host rendering a component that is itself a button", () => {
		// A `*Button` component renders a native <button>, so nativeButton must
		// stay true. Both hosts are in the set, so only the exemption keeps them
		// quiet.
		expect(lint("const x = <PopoverTrigger render={<Button />} />;")).toEqual([]);
		expect(lint("const x = <Button render={<SidebarMenuButton />} />;")).toEqual(
			[],
		);
	});

	it("still reports a non-button render on a component that takes the prop", () => {
		expect(ruleIds(lint("const x = <Button render={<span />} />;"))).toEqual([
			RULE,
		]);
		expect(
			ruleIds(lint("const x = <PopoverTrigger render={<Badge />} />;")),
		).toEqual([RULE]);
	});

	it("does not follow a render value that is not an element literal", () => {
		expect(lint("const x = <Button render={element} />;")).toEqual([]);
		expect(lint("const x = <Button render={renderLink()} />;")).toEqual([]);
	});

	it("leaves components that are not button-like alone", () => {
		expect(lint("const x = <Popover render={<Link />} />;")).toEqual([]);
	});

	it("is inert on projects that do not depend on @base-ui/react", () => {
		expect(
			lint("const x = <Button render={<Link />} />;", { baseUi: false }),
		).toEqual([]);
	});
});
