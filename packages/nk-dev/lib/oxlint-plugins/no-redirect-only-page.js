// nextkit oxlint JS plugin rule: flag App Router `page.tsx` files whose only
// job is to call `redirect(...)`.
//
// A page that renders nothing and immediately redirects still costs a route
// match, a server component render, and a `redirect()` throw on every request.
// The same hop belongs in `next.config`'s `redirects()` array, where it is
// handled at the routing layer before any rendering — cheaper and cacheable.
//
// This is a heuristic suggestion, not a correctness rule: it fires only when the
// page body is a bare `redirect(...)` (optionally with a leading variable or
// return) AND the destination is a statically extractable string / simple
// template, so the equivalent config entry can be shown. Anything with real
// logic is left alone. Scope is limited to `**/page.tsx`.
//
// Ported from the upstream Ingram ESLint rule, de-noised: that version emitted
// two diagnostics per hit (the finding and a separate example); this emits one
// with the config snippet inlined.

const noRedirectOnlyPage = {
	meta: {
		type: "suggestion",
		docs: {
			description:
				"Prefer next.config redirects over pages that only call redirect()",
		},
		messages: {
			useConfigRedirect:
				'This page only performs a redirect. Prefer a next.config redirect: add `{ source: "{{source}}", destination: "{{destination}}", permanent: false }` to `redirects()` — it bounces at the routing layer instead of rendering a page to do it.',
		},
	},
	create(context) {
		const filename = context.physicalFilename || context.filename || "";
		if (!filename.endsWith("/page.tsx")) return {};

		let hasRedirectCall = false;
		let redirectDestination = null;
		let isSimpleRedirect = true;
		let redirectNode = null;

		// Turn the file path into the route it serves: strip to the segment
		// after `src/app`, drop `(group)` folders, map `[param]` to `:param`.
		const getSourcePath = () => {
			const match = filename.match(/src\/app(.*)\/page\.tsx$/);
			if (!match) return null;
			let path = match[1].replace(/\/\([^)]+\)/g, "");
			if (!path) return "/";
			return path.replace(/\[([^\]]+)\]/g, ":$1");
		};

		// True when a function body is nothing but a `redirect(...)` call,
		// optionally preceded by a variable declaration or an early return.
		const isOnlyRedirect = (body) => {
			if (!body) return false;

			if (body.type === "BlockStatement") {
				const statements = body.body.filter(
					(stmt) => stmt.type !== "EmptyStatement",
				);
				if (statements.length === 0 || statements.length > 2) {
					return false;
				}
				for (const stmt of statements) {
					if (stmt.type === "ExpressionStatement") {
						const expr = stmt.expression;
						if (
							expr.type === "CallExpression" &&
							expr.callee.type === "Identifier" &&
							expr.callee.name === "redirect"
						) {
							continue;
						}
						return false;
					}
					if (
						stmt.type === "VariableDeclaration" ||
						stmt.type === "ReturnStatement"
					) {
						continue;
					}
					return false;
				}
				return true;
			}

			// Arrow function with a direct `redirect(...)` expression body.
			return (
				body.type === "CallExpression" &&
				body.callee.type === "Identifier" &&
				body.callee.name === "redirect"
			);
		};

		// Pull a static destination out of the first `redirect()` argument, or
		// null when it is dynamic in a way we cannot render as a config entry.
		const extractDestination = (node) => {
			if (!node.arguments || node.arguments.length === 0) return null;
			const firstArg = node.arguments[0];

			if (firstArg.type === "Literal" && typeof firstArg.value === "string") {
				return firstArg.value;
			}

			if (firstArg.type === "TemplateLiteral") {
				let result = "";
				for (let i = 0; i < firstArg.quasis.length; i++) {
					result += firstArg.quasis[i].value.raw;
					if (i < firstArg.expressions.length) {
						const expr = firstArg.expressions[i];
						if (expr.type === "Identifier") {
							result += `:${expr.name}`;
						} else if (
							expr.type === "AwaitExpression" &&
							expr.argument &&
							expr.argument.type === "CallExpression"
						) {
							result += ":id";
						} else {
							return null;
						}
					}
				}
				return result;
			}

			return null;
		};

		// Any component whose body is more than a bare redirect disqualifies the
		// page. Covers all page shapes — `const XxxPage = () => {}`,
		// `export default function Page() {}`, `export default () => {}` — so a
		// function-declaration page with real logic is not falsely flagged.
		const disqualifyIfComplex = (fn) => {
			if (
				fn &&
				(fn.type === "ArrowFunctionExpression" ||
					fn.type === "FunctionExpression" ||
					fn.type === "FunctionDeclaration") &&
				!isOnlyRedirect(fn.body)
			) {
				isSimpleRedirect = false;
			}
		};

		return {
			VariableDeclarator(node) {
				if (node.id.type === "Identifier" && node.id.name.endsWith("Page")) {
					disqualifyIfComplex(node.init);
				}
			},

			FunctionDeclaration(node) {
				if (node.id && node.id.name.endsWith("Page")) {
					disqualifyIfComplex(node);
				}
			},

			ExportDefaultDeclaration(node) {
				disqualifyIfComplex(node.declaration);
			},

			CallExpression(node) {
				if (
					node.callee.type === "Identifier" &&
					node.callee.name === "redirect"
				) {
					hasRedirectCall = true;
					redirectNode = node;
					redirectDestination = extractDestination(node);
				}
			},

			"Program:exit"() {
				if (
					!hasRedirectCall ||
					!isSimpleRedirect ||
					!redirectDestination ||
					!redirectNode
				) {
					return;
				}
				const source = getSourcePath();
				if (!source) return;
				context.report({
					node: redirectNode,
					messageId: "useConfigRedirect",
					data: { source, destination: redirectDestination },
				});
			},
		};
	},
};

export default {
	meta: { name: "nextkit" },
	rules: { "no-redirect-only-page": noRedirectOnlyPage },
};
