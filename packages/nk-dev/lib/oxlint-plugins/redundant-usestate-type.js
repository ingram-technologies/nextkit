// nextkit oxlint JS plugin rule: strip redundant `useState<T>` type arguments
// that TypeScript already infers from the initial value.
//
// `useState<boolean>(false)`, `useState<string>("")`, `useState<number>(0)`
// each annotate exactly the type React infers from the literal — pure noise.
// `useState<number | undefined>(undefined)` is the same story spelled with a
// union: `useState<number>()` (no argument) yields the identical
// `[number | undefined, ...]` tuple with the identical `undefined` initial
// value, so the union + explicit `undefined` argument are redundant too.
//
// Deliberately NARROWER than the upstream Ingram ESLint rule this is ported
// from, on the two cases where that rule changed behavior instead of removing
// redundancy:
//   - No `null` handling. `useState<string | null>(null)` -> `useState<string>()`
//     is a runtime change (the initial value becomes `undefined`); an autofix
//     must never do that. Whether to prefer `undefined` over `null` is a style
//     call this rule does not make.
//   - No array handling. `useState<string[]>([])` is NOT redundant: `useState([])`
//     infers `never[]`, not `string[]`, so the annotation is load-bearing. The
//     upstream rule stripped it and silently broadened the state to `never[]`.
//
// tsc does not flag redundant annotations, so this is a lint-only cleanup; every
// reported case is autofixable and behavior-preserving.

const noRedundantUseStateType = {
	meta: {
		type: "suggestion",
		docs: {
			description:
				"Disallow redundant useState type arguments that are inferable from the initial value",
		},
		fixable: "code",
		messages: {
			redundantSimpleType:
				"Redundant `useState` type argument: `{{type}}` is already inferred from the initial value.",
			redundantUndefinedUnion:
				"Redundant `| undefined` in `useState` type: use `useState<{{baseType}}>()` instead of `useState<{{baseType}} | undefined>(undefined)`.",
		},
	},
	create(context) {
		const sourceCode = context.sourceCode;

		// Remove the whole `<...>` type-argument list, brackets included, by
		// deleting the span between the callee token and the opening `(`.
		const removeTypeArguments = (fixer, typeArguments) => {
			const before = sourceCode.getTokenBefore(typeArguments);
			const after = sourceCode.getTokenAfter(typeArguments);
			return fixer.removeRange([before.range[1], after.range[0]]);
		};

		return {
			CallExpression(node) {
				if (
					node.callee.type !== "Identifier" ||
					node.callee.name !== "useState"
				) {
					return;
				}

				const typeArguments = node.typeArguments;
				if (!typeArguments || typeArguments.params.length === 0) return;

				const typeParam = typeArguments.params[0];
				const argument = node.arguments[0];

				// Case 1: a scalar keyword type whose literal initial value
				// infers exactly that type. Arrays are excluded on purpose (see
				// the header): `useState<string[]>([])` is not redundant.
				if (argument) {
					const typeText = sourceCode.getText(typeParam);
					const redundant =
						(typeText === "boolean" &&
							argument.type === "Literal" &&
							typeof argument.value === "boolean") ||
						(typeText === "string" &&
							argument.type === "Literal" &&
							typeof argument.value === "string") ||
						(typeText === "number" &&
							argument.type === "Literal" &&
							typeof argument.value === "number") ||
						(typeText === "undefined" &&
							argument.type === "Identifier" &&
							argument.name === "undefined");

					if (redundant) {
						context.report({
							node: typeArguments,
							messageId: "redundantSimpleType",
							data: { type: typeText },
							fix: (fixer) => removeTypeArguments(fixer, typeArguments),
						});
						return;
					}
				}

				// Case 2: `T | undefined` with an explicit `undefined` initial
				// value collapses to `useState<T>()`.
				if (
					typeParam.type === "TSUnionType" &&
					argument &&
					argument.type === "Identifier" &&
					argument.name === "undefined"
				) {
					const rest = typeParam.types.filter(
						(t) => t.type !== "TSUndefinedKeyword",
					);
					const undefined_ = typeParam.types.filter(
						(t) => t.type === "TSUndefinedKeyword",
					);
					if (rest.length === 1 && undefined_.length === 1) {
						const baseText = sourceCode.getText(rest[0]);
						context.report({
							node,
							messageId: "redundantUndefinedUnion",
							data: { baseType: baseText },
							fix(fixer) {
								const fixes = [fixer.replaceText(typeParam, baseText)];
								if (node.arguments.length === 1) {
									const openParen =
										sourceCode.getTokenAfter(typeArguments);
									const closeParen =
										sourceCode.getTokenAfter(argument);
									fixes.push(
										fixer.replaceTextRange(
											[openParen.range[0], closeParen.range[1]],
											"()",
										),
									);
								}
								return fixes;
							},
						});
						return;
					}
				}

				// Case 3: bare `useState<undefined>()` with no initial value.
				if (
					typeParam.type === "TSUndefinedKeyword" &&
					node.arguments.length === 0
				) {
					context.report({
						node: typeArguments,
						messageId: "redundantSimpleType",
						data: { type: "undefined" },
						fix: (fixer) => removeTypeArguments(fixer, typeArguments),
					});
				}
			},
		};
	},
};

export default {
	meta: { name: "nextkit" },
	rules: { "no-redundant-usestate-type": noRedundantUseStateType },
};
