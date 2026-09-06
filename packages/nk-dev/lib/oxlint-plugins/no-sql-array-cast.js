// nextkit oxlint JS plugin rule: no `${jsArray}::type[]` in a drizzle `sql`
// template.
//
// A template interpolation is one bound parameter, and drizzle expands a JS
// array into a comma-separated list of them. So `sql`${ids}::uuid[]`` sends
// `($1, $2, $3)::uuid[]` — Postgres parses that as a record and fails at run
// time with "cannot cast type record to uuid[]". Nothing catches it earlier:
// the types are happy, and the query is a string until it reaches the server.
//
// Build the array explicitly instead:
//
//   sql`array[${sql.join(ids.map((id) => sql`${id}`), sql`, `)}]::uuid[]`
//
// Casting a *column* to an array type is legitimate and indistinguishable
// syntactically, so that case takes a justified disable comment.

const ARRAY_CAST = /^::\s*"?[A-Za-z_][\w."]*"?\s*\[\s*\]/;

const noSqlArrayCast = {
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow casting an interpolated value to an array type in a drizzle sql template",
		},
		messages: {
			sqlArrayCast:
				'An interpolated array is expanded into separate bound parameters, so `::{{type}}` casts a record and fails at run time ("cannot cast type record to {{type}}"). Build the array with `array[...]` and `sql.join`. If this interpolation is a column rather than a JS array, add `// oxlint-disable-next-line nextkit/no-sql-array-cast -- <reason>`.',
		},
	},
	create(context) {
		return {
			TaggedTemplateExpression(node) {
				if (node.tag.type !== "Identifier" || node.tag.name !== "sql") return;
				const quasis = node.quasi.quasis;
				// quasis[i] for i > 0 is the text right after expressions[i - 1].
				for (let i = 1; i < quasis.length; i++) {
					const text = quasis[i].value.raw;
					const match = ARRAY_CAST.exec(text);
					if (match === null) continue;
					context.report({
						node: node.quasi.expressions[i - 1] ?? node,
						messageId: "sqlArrayCast",
						data: { type: match[0].slice(2).trim() },
					});
				}
			},
		};
	},
};

export default {
	meta: { name: "nextkit" },
	rules: { "no-sql-array-cast": noSqlArrayCast },
};
