// nextkit oxlint JS plugin rule: a route handler never `as`-casts the request
// body it just parsed.
//
// `Request.json()` is typed `Promise<any>`, so `(await req.json()) as Invoice`
// and `const body: Invoice = await req.json()` both type-check while asserting
// something about a payload the caller controls. The cast is a lie the type
// checker cannot catch: the handler then reads fields that may be absent, of
// the wrong type, or attacker-chosen, and the first symptom is a 500 or a row
// written from a body nobody validated.
//
// Parse it instead — `schema.parse(await req.json())` (or `safeParse` where the
// handler answers the failure itself), which produces the same static type
// from a run-time check. Casting to `unknown` is fine and is how you hand the
// value to a parser.
//
// Scoped to route handlers (`app/**/route.ts`), where the body is by
// definition external. Casting a *response* you fetched is a different (and
// weaker) claim, and this rule says nothing about it.

const ROUTE_FILE = /(^|[\\/])app[\\/].*[\\/]route\.[cm]?[jt]sx?$/;
const SAFE_TARGETS = new Set(["TSUnknownKeyword", "TSAnyKeyword"]);

/** Unwrap parentheses and `as`-chains down to the inner expression. */
const inner = (node) => {
	let current = node;
	while (
		current.type === "TSAsExpression" ||
		current.type === "TSNonNullExpression" ||
		current.type === "ParenthesizedExpression"
	) {
		current = current.expression;
	}
	return current;
};

/** Whether `node` is `await <something>.json()`. */
const isAwaitedJson = (node) => {
	if (node.type !== "AwaitExpression") return false;
	const call = inner(node.argument);
	if (call.type !== "CallExpression" || call.arguments.length > 0) return false;
	const callee = call.callee;
	return (
		callee.type === "MemberExpression" &&
		!callee.computed &&
		callee.property.type === "Identifier" &&
		callee.property.name === "json"
	);
};

const noUnvalidatedRequestBody = {
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow asserting a type on a request body instead of parsing it",
		},
		messages: {
			castBody:
				"`json()` returns `any`, so this asserts a shape the caller controls and nothing checks it. Parse the body with a schema instead — `schema.parse(await req.json())` — which gives the same static type from a run-time check. `as unknown` is fine on the way into a parser.",
		},
	},
	create(context) {
		if (!ROUTE_FILE.test(context.filename ?? "")) return {};
		return {
			// `(await req.json()) as Body`
			TSAsExpression(node) {
				if (SAFE_TARGETS.has(node.typeAnnotation?.type)) return;
				if (!isAwaitedJson(inner(node.expression))) return;
				context.report({ node, messageId: "castBody" });
			},
			// `const body: Body = await req.json()` — no cast, same assertion.
			VariableDeclarator(node) {
				const annotation = node.id.typeAnnotation?.typeAnnotation;
				if (!annotation || SAFE_TARGETS.has(annotation.type)) return;
				if (!node.init || !isAwaitedJson(inner(node.init))) return;
				context.report({ node, messageId: "castBody" });
			},
		};
	},
};

export default {
	meta: { name: "nextkit" },
	rules: { "no-unvalidated-request-body": noUnvalidatedRequestBody },
};
