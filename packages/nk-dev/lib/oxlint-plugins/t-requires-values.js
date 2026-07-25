// nextkit oxlint JS plugin rule: a `t()` message with ICU placeholders must be
// passed the values those placeholders need.
//
// `@ingram-tech/nk-i18n`'s translator returns the message unformatted when no
// values argument is given -- it never reaches IntlMessageFormat, so nothing
// throws and nothing warns. `t("Results for {query}")` therefore ships the
// literal text `Results for {query}` to users with no runtime signal at all.
// Every other failure in that package degrades loudly; this one is silent,
// which makes it the one worth catching at author time.
//
// Two reports:
//   - the values argument is missing entirely, while the message has arguments;
//   - the values argument is an object literal that omits a required key, which
//     is what a misspelling looks like (`t("… {query}", { qeury })`).
//
// When the values argument is anything other than a plain object literal (a
// variable, a call, a spread), only the first check applies -- the keys are not
// statically known and guessing would produce false reports.

import { icuArguments, isTranslatorCall, messageLiteral } from "./icu-arguments.js";

const tRequiresValues = {
	meta: {
		type: "problem",
		docs: {
			description: "Require values for the ICU placeholders in a t() message",
		},
		messages: {
			missingValues:
				"`t()` message uses the placeholder{{plural}} {{names}} but no values argument was passed. The placeholder text is rendered to users verbatim.",
			missingValue:
				"`t()` values object is missing `{{name}}`, required by the message's `{{{name}}}` placeholder.",
		},
	},
	create(context) {
		return {
			CallExpression(node) {
				if (!isTranslatorCall(node)) return;
				const message = messageLiteral(node);
				if (!message) return;

				const args = icuArguments(message.value);
				if (args.length === 0) return;

				const names = args.map((arg) => arg.name);
				const values = node.arguments[1];
				if (!values) {
					context.report({
						node,
						messageId: "missingValues",
						data: {
							plural: names.length === 1 ? "" : "s",
							names: names.map((name) => `\`${name}\``).join(", "),
						},
					});
					return;
				}

				if (values.type !== "ObjectExpression") return;
				// A spread can supply anything; the key set is no longer known.
				if (
					values.properties.some((property) => property.type !== "Property")
				) {
					return;
				}
				const provided = new Set();
				for (const property of values.properties) {
					if (property.computed) return;
					if (property.key.type === "Identifier")
						provided.add(property.key.name);
					else if (property.key.type === "Literal") {
						provided.add(String(property.key.value));
					} else return;
				}

				for (const name of names) {
					if (provided.has(name)) continue;
					context.report({
						node: values,
						messageId: "missingValue",
						data: { name },
					});
				}
			},
		};
	},
};

export default {
	meta: { name: "nextkit" },
	rules: { "t-requires-values": tRequiresValues },
};
