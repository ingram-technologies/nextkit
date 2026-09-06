// nextkit oxlint JS plugin rule: a Base UI (@base-ui/react) button-like
// component that renders something other than a <button> must say so with
// `nativeButton={false}`.
//
// Base UI builds every button-like part on `useButton`, whose `nativeButton`
// prop defaults to true. Render a non-<button> element through `render` and
// leave the default in place and Base UI logs at runtime:
//
//   Base UI: A component that acts as a button expected a native <button>
//   because the `nativeButton` prop is true. Rendering a non-<button> removes
//   native button semantics, which can impact forms and accessibility.
//
// It is not only console noise: Base UI skips the keyboard, role and
// form-participation shims the non-native element needs, so the control is
// reachable but not operable the way a button is. The type-checker cannot see
// it (`nativeButton` is optional and the render element is just a ReactElement),
// so it needs a rule.
//
// Scope is structural and deliberately narrow:
//
//   * Only a JSX element literal in `render` is inspected, which is the
//     convention on these sites (`render={<Link href={...} />}`). A variable,
//     call or conditional is not followed: the unusual cases fall out for free
//     instead of needing an allowlist of innocents.
//   * `render={<button />}` is correct as-is, and so is a component named
//     `*Button`: that is Base UI's own button primitive or a wrapper on it,
//     which renders a native <button>.
//   * `nativeButton={false}` anywhere on the element clears it. Any other
//     value, or a spread that might carry one, still reports: a spread is not
//     an explicit `nativeButton={false}`.
//
// Which components count: only the ones that actually accept `nativeButton`.
// In @base-ui/react 1.8.0 that is Button, PopoverTrigger, Switch and the menu
// items; every other *Trigger builds on useButton internally but does not
// expose the prop, so demanding it there produces code that does not compile.
// An earlier revision keyed on the `Button`/`Trigger` name suffixes and was
// wrong on both counts: it reported design-system Buttons (which render a
// native <button>) and Triggers that have no such prop.
//
// The host must also be Base UI's own component. A locally defined
// `SidebarMenuButton` shares the name and takes no such prop, so the name list
// below is deliberately short and exact rather than suffix-matched.

import { fileUsesBaseUi } from "./base-ui-project.js";

const NATIVE_BUTTON_PROP_COMPONENTS = new Set([
	"Button",
	"PopoverTrigger",
	"Switch",
	"MenuItem",
]);

/** `<Foo>` -> "Foo", `<Menu.Trigger>` -> "Trigger", otherwise null. */
const componentNameOf = (opening) => {
	const name = opening.name;
	if (name.type === "JSXIdentifier") return name.name;
	if (name.type === "JSXMemberExpression" && name.property.type === "JSXIdentifier") {
		return name.property.name;
	}
	return null;
};

/**
 * A render target that is itself a button. The lowercase intrinsic is the
 * obvious one; a component named `*Button` is Base UI's own primitive or a
 * wrapper around it, and renders a native <button> too, so requiring
 * `nativeButton={false}` there would be wrong twice over: the element is
 * native, and Base UI logs the inverse warning when the prop lies about it.
 *
 * The known gap is a `*Button` wrapper that renders an anchor (a LinkButton).
 * Those set `nativeButton={false}` on their own inner button, so the mistake
 * is contained in the wrapper rather than at every call site.
 */
const rendersNativeButton = (name) =>
	name === "button" || (/^[A-Z]/.test(name) && name.endsWith("Button"));

const isButtonLike = (name) => name !== null && NATIVE_BUTTON_PROP_COMPONENTS.has(name);

/** The JSX element literal passed to `render`, or null. */
const renderedElement = (attribute) => {
	const value = attribute.value;
	if (!value || value.type !== "JSXExpressionContainer") return null;
	const expression = value.expression;
	return expression.type === "JSXElement" ? expression : null;
};

const isNativeButtonFalse = (attribute) => {
	const value = attribute.value;
	if (!value || value.type !== "JSXExpressionContainer") return false;
	const expression = value.expression;
	return expression.type === "Literal" && expression.value === false;
};

const baseUiNativeButton = {
	meta: {
		type: "problem",
		docs: {
			description:
				"Require nativeButton={false} on a Base UI button-like component rendered as a non-<button>",
		},
		messages: {
			missingNativeButtonFalse:
				"`{{component}}` renders <{{rendered}}> but leaves `nativeButton` at its default of true, so Base UI drops the native button semantics it would otherwise shim and logs an error at runtime. Add `nativeButton={false}`, or render a real <button>.",
		},
	},
	create(context) {
		if (!fileUsesBaseUi(context)) return {};
		return {
			JSXOpeningElement(node) {
				const component = componentNameOf(node);
				if (!isButtonLike(component)) return;

				let render = null;
				for (const attribute of node.attributes) {
					if (attribute.type !== "JSXAttribute") continue;
					if (attribute.name.type !== "JSXIdentifier") continue;
					if (attribute.name.name === "nativeButton") {
						if (isNativeButtonFalse(attribute)) return;
					} else if (attribute.name.name === "render") {
						render = renderedElement(attribute);
					}
				}
				if (render === null) return;

				const rendered = componentNameOf(render.openingElement);
				if (rendered === null || rendersNativeButton(rendered)) return;

				context.report({
					node: render,
					messageId: "missingNativeButtonFalse",
					data: { component, rendered },
				});
			},
		};
	},
};

export default {
	meta: { name: "nextkit" },
	rules: { "base-ui-native-button": baseUiNativeButton },
};
