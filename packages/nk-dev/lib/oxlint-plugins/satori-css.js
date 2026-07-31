// nextkit oxlint JS plugin rule: validate inline styles in satori-rendered JSX.
//
// `next/og`'s `ImageResponse` types `style` as the full `React.CSSProperties`,
// but satori implements a finite subset and **silently drops** everything else.
// The image still renders, just wrong — which is why a render test can't catch
// it: the PNG is valid, the shadow is simply missing. That gap is the whole
// reason this rule exists (nk-seo README, "Open Graph image").
//
// Two classes of finding:
//
//   1. Style properties satori does not implement (`transition`, `cursor`,
//      `backdropFilter`, the grid family, `zIndex`, `calc()`, …) — silent drops.
//   2. The structural rules satori enforces at render time: a node with more
//      than one child must set `display: flex` (or `none`), and text must not
//      sit next to element siblings. These *do* throw at render; flagging them
//      in-editor just moves the failure earlier.
//
// Scope: only files that are satori-bound — they import `next/og` (or
// `@vercel/og`), or they are an `opengraph-image` / `twitter-image` file
// convention. Sites using nk-seo's `ogImageResponse` write no satori JSX at all
// and never trip this.
//
// The supported list is satori's documented one (https://github.com/vercel/satori#css)
// plus the box-model properties yoga handles that the README's table omits. It
// is deliberately generous: an over-wide allowlist only lowers the catch rate,
// while a too-narrow one puts false positives into a config the whole fleet
// inherits.

/** https://github.com/vercel/satori#css, plus the yoga box-model properties. */
const SUPPORTED = new Set([
	// Display & position
	"display",
	"position",
	"top",
	"right",
	"bottom",
	"left",
	"overflow",
	"opacity",
	"boxSizing",
	"boxShadow",
	"filter",
	"clipPath",
	"lineClamp",
	"color",
	// Box model
	"margin",
	"marginTop",
	"marginRight",
	"marginBottom",
	"marginLeft",
	"padding",
	"paddingTop",
	"paddingRight",
	"paddingBottom",
	"paddingLeft",
	"width",
	"height",
	"minWidth",
	"minHeight",
	"maxWidth",
	"maxHeight",
	// Border
	"border",
	"borderTop",
	"borderRight",
	"borderBottom",
	"borderLeft",
	"borderWidth",
	"borderTopWidth",
	"borderRightWidth",
	"borderBottomWidth",
	"borderLeftWidth",
	"borderStyle",
	"borderTopStyle",
	"borderRightStyle",
	"borderBottomStyle",
	"borderLeftStyle",
	"borderColor",
	"borderTopColor",
	"borderRightColor",
	"borderBottomColor",
	"borderLeftColor",
	"borderRadius",
	"borderTopLeftRadius",
	"borderTopRightRadius",
	"borderBottomLeftRadius",
	"borderBottomRightRadius",
	// Flex
	"flex",
	"flexDirection",
	"flexWrap",
	"flexFlow",
	"flexGrow",
	"flexShrink",
	"flexBasis",
	"alignItems",
	"alignContent",
	"alignSelf",
	"justifyContent",
	"gap",
	"rowGap",
	"columnGap",
	"order",
	"aspectRatio",
	// Font & text
	"fontFamily",
	"fontSize",
	"fontWeight",
	"fontStyle",
	"tabSize",
	"textAlign",
	"textIndent",
	"textTransform",
	"textOverflow",
	"textDecoration",
	"textDecorationColor",
	"textDecorationLine",
	"textDecorationStyle",
	"textShadow",
	"textWrap",
	"lineHeight",
	"letterSpacing",
	"whiteSpace",
	"wordBreak",
	// Background
	"background",
	"backgroundColor",
	"backgroundImage",
	"backgroundPosition",
	"backgroundSize",
	"backgroundClip",
	"backgroundRepeat",
	// Transform
	"transform",
	"transformOrigin",
	// Image
	"objectFit",
	"objectPosition",
	// Mask
	"maskImage",
	"maskPosition",
	"maskSize",
	"maskRepeat",
	// Text stroke
	"WebkitTextStroke",
	"WebkitTextStrokeWidth",
	"WebkitTextStrokeColor",
	"WebkitBackgroundClip",
	"WebkitTextFillColor",
]);

const OG_MODULES = new Set(["next/og", "@vercel/og"]);
const IMAGE_CONVENTION = /\/(opengraph-image|twitter-image)(\.[^/]+)?\.[jt]sx$/;

/** kebab-case is legal in a style object via string keys; normalize to camel. */
const toCamelCase = (name) =>
	name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());

const satoriCss = {
	meta: {
		type: "problem",
		docs: {
			description:
				"Restrict inline styles in satori-rendered JSX to what satori implements",
		},
		messages: {
			unsupportedProperty:
				"satori does not implement `{{property}}` — it is silently dropped from the rendered image (the PNG still comes out, just wrong, so no render test catches it). See https://github.com/vercel/satori#css for the supported subset.",
			calc: "satori does not support `calc()` in `{{property}}` — the declaration is dropped. Compute the number in JS instead.",
			missingFlex:
				'This element has {{count}} children but no `display`. satori defaults every node to `display: flex`, and a node with more than one child must set it explicitly — add `display: "flex"` (or `"none"`) to make the intent survive.',
			textWithElementSiblings:
				"satori cannot lay out a text node next to element siblings — it throws at render. Wrap the text in its own element.",
		},
	},
	create(context) {
		const filename = context.physicalFilename || context.filename || "";
		const isConventionFile = IMAGE_CONVENTION.test(filename.replace(/\\/g, "/"));
		let importsOg = false;
		/** Findings held until the whole file has been seen — the `next/og`
		 * import is what proves the JSX is satori-bound, and a re-export or a
		 * type-only file can carry JSX with no import at all. */
		const findings = [];
		const report = (descriptor) => findings.push(descriptor);

		const checkStyleObject = (object) => {
			for (const property of object.properties) {
				if (property.type !== "Property") continue;
				let name;
				if (property.key.type === "Identifier" && !property.computed) {
					name = property.key.name;
				} else if (property.key.type === "Literal") {
					name = String(property.key.value);
				} else {
					// A computed key is unknowable statically; a spread may carry
					// anything. Silence beats guessing.
					continue;
				}
				// CSS custom properties are supported (with var() and fallbacks).
				if (name.startsWith("--")) continue;
				const camel = toCamelCase(name);
				if (!SUPPORTED.has(camel)) {
					report({
						node: property.key,
						messageId: "unsupportedProperty",
						data: { property: name },
					});
					continue;
				}
				if (
					property.value.type === "Literal" &&
					typeof property.value.value === "string" &&
					property.value.value.includes("calc(")
				) {
					report({
						node: property.value,
						messageId: "calc",
						data: { property: name },
					});
				}
			}
		};

		// Both structural checks only count children that are *certainly*
		// rendered. A `{cond ? <a/> : null}` child may collapse to nothing, and
		// counting it would flag templates that lay out fine — a false positive in
		// a rule the whole fleet inherits costs more than the miss.
		const isCertainElement = (child) =>
			child.type === "JSXElement" ||
			child.type === "JSXFragment" ||
			(child.type === "JSXExpressionContainer" &&
				(child.expression.type === "JSXElement" ||
					child.expression.type === "JSXFragment"));

		/** Raw text, or an interpolation that can only be a string/number. */
		const isCertainText = (child) => {
			if (child.type === "JSXText") return child.value.trim() !== "";
			if (child.type !== "JSXExpressionContainer") return false;
			const expression = child.expression;
			return (
				(expression.type === "Literal" &&
					typeof expression.value !== "boolean") ||
				expression.type === "TemplateLiteral"
			);
		};

		return {
			ImportDeclaration(node) {
				if (OG_MODULES.has(node.source.value)) importsOg = true;
			},
			JSXAttribute(node) {
				if (node.name.type !== "JSXIdentifier" || node.name.name !== "style") {
					return;
				}
				const value = node.value;
				if (value?.type !== "JSXExpressionContainer") return;
				if (value.expression.type !== "ObjectExpression") return;
				checkStyleObject(value.expression);
			},
			JSXElement(node) {
				const texts = node.children.filter(isCertainText);
				const elements = node.children.filter(isCertainElement);
				if (texts.length > 0 && elements.length > 0) {
					report({ node, messageId: "textWithElementSiblings" });
				}

				const children = texts.length + elements.length;
				if (children < 2) return;

				// A component's own JSX is that component's business; only the
				// intrinsic elements satori lays out carry the flex rule.
				if (node.openingElement.name.type !== "JSXIdentifier") return;
				if (!/^[a-z]/.test(node.openingElement.name.name)) return;

				let styleObject;
				let hasUnknownStyle = false;
				for (const attribute of node.openingElement.attributes) {
					if (attribute.type === "JSXSpreadAttribute") {
						hasUnknownStyle = true;
						continue;
					}
					if (attribute.name.name !== "style") continue;
					if (attribute.value?.type !== "JSXExpressionContainer") {
						hasUnknownStyle = true;
					} else if (attribute.value.expression.type === "ObjectExpression") {
						styleObject = attribute.value.expression;
					} else {
						hasUnknownStyle = true;
					}
				}
				if (hasUnknownStyle) return;
				const declaresDisplay = styleObject?.properties.some(
					(property) =>
						property.type === "Property" &&
						!property.computed &&
						(property.key.name === "display" ||
							property.key.value === "display"),
				);
				if (declaresDisplay) return;
				report({
					node: node.openingElement,
					messageId: "missingFlex",
					data: { count: String(children) },
				});
			},
			"Program:exit"() {
				if (!importsOg && !isConventionFile) return;
				for (const descriptor of findings) context.report(descriptor);
			},
		};
	},
};

export default {
	meta: { name: "nextkit" },
	rules: { "satori-css": satoriCss },
};
