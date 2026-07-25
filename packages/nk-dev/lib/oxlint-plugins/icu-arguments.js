// Shared helper for the `t-*` oxlint rules: extract the ICU MessageFormat
// argument list from a message.
//
// Only depth-0 braces are argument positions. Braces nested inside a
// plural/select sub-message are ordinary text and must not be read as
// arguments -- `{count, plural, one {# item} other {# items}}` has exactly one
// argument, `count`, not three. A brace-depth scan gets this exactly right,
// which is why this lives in the linter rather than in the package's types:
// TypeScript template-literal types cannot match brace pairs, so the same check
// expressed as a type would report `# item` as an argument.
//
// A depth-0 brace whose contents do not open with an identifier or a number is
// not an argument at all -- it is literal text the author wrote. `{"a": 1}`,
// `{}`, and `body { color: red }` all fall out here and are skipped silently.
// That bias matters: in this i18n scheme the English source string *is* the
// catalog key, so an author cannot ICU-escape a stray brace without changing
// the key and every translation of it. Staying quiet on ambiguous braces is the
// only behaviour that leaves those messages usable.

// ICU argNameOrNumber, anchored at a brace: an identifier or a number, followed
// by the argument's `,` separator or its closing `}`.
const ARGUMENT_HEAD = /^\{\s*([A-Za-z_$][\w$]*|\d+)\s*[,}]/;

/**
 * The ICU arguments of `message`, in source order.
 *
 * Under-reports rather than over-reports. A message using ICU's apostrophe
 * escaping for a literal brace (`Use '{' here`) leaves the scan's depth
 * unbalanced, so later arguments go unseen -- a missed lint, never a false one.
 *
 * @param {string} message
 * @returns {{ name: string, positional: boolean }[]}
 */
export function icuArguments(message) {
	const args = [];
	let depth = 0;
	for (let index = 0; index < message.length; index++) {
		const char = message[index];
		if (char === "}") {
			if (depth > 0) depth--;
			continue;
		}
		if (char !== "{") continue;
		if (depth === 0) {
			const match = ARGUMENT_HEAD.exec(message.slice(index));
			if (match) {
				args.push({ name: match[1], positional: /^\d+$/.test(match[1]) });
			}
		}
		depth++;
	}
	return args;
}

/**
 * Whether `node` is a call to a translator: `t(...)`, by convention throughout
 * the fleet (`const t = createT(locale, scope)` / `const t = useT({ fr, nl })`).
 * Gating on the callee name keeps the rules inert everywhere else without
 * needing to resolve the binding back to `createT`/`useT`.
 *
 * @param {{ callee: { type: string, name?: string } }} node
 */
export function isTranslatorCall(node) {
	return node.callee.type === "Identifier" && node.callee.name === "t";
}

/**
 * The message literal of a translator call, or `null` when the first argument
 * is not a plain string literal (a runtime key -- nothing to check statically).
 *
 * @param {{ arguments: { type: string, value?: unknown }[] }} node
 */
export function messageLiteral(node) {
	const first = node.arguments[0];
	if (!first || first.type !== "Literal" || typeof first.value !== "string") {
		return null;
	}
	return first;
}
