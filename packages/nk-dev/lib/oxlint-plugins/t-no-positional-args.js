// nextkit oxlint JS plugin rule: forbid positional ICU arguments (`{0}`, `{1}`)
// in `t()` messages.
//
// ICU MessageFormat permits numbered arguments, but they are wrong for this
// i18n scheme in two ways. The English source string is the catalog key and is
// what a translator reads, so `{0}` gives them no clue what the value is, and
// reordering it for another language's word order becomes guesswork. Named
// arguments carry that context in the key itself.
//
// Banning them also lets the runtime stay conservative about what counts as a
// placeholder: `@ingram-tech/nk-i18n` only treats identifier-headed braces as
// arguments, so prose and embedded JSON (`t('This is JSON: {"a": 1}')`) are
// passed through untouched. That heuristic would have to admit digits -- and
// with them `{2: "x"}` -- if positional arguments were allowed anywhere.

import { icuArguments, isTranslatorCall, messageLiteral } from "./icu-arguments.js";

const tNoPositionalArgs = {
	meta: {
		type: "problem",
		docs: {
			description: "Forbid positional ICU arguments in t() messages",
		},
		messages: {
			positionalArgument:
				"`t()` message uses the positional placeholder `{{{name}}}`. Name it instead -- the English source is the catalog key, so translators read the placeholder and may need to reorder it.",
		},
	},
	create(context) {
		return {
			CallExpression(node) {
				if (!isTranslatorCall(node)) return;
				const message = messageLiteral(node);
				if (!message) return;

				for (const arg of icuArguments(message.value)) {
					if (!arg.positional) continue;
					context.report({
						node: message,
						messageId: "positionalArgument",
						data: { name: arg.name },
					});
				}
			},
		};
	},
};

export default {
	meta: { name: "nextkit" },
	rules: { "t-no-positional-args": tNoPositionalArgs },
};
