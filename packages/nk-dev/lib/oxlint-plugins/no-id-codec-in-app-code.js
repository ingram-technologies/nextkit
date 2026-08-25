// nextkit oxlint JS plugin rule: keep the id codec out of application code.
//
// An id is a raw `uuid` in Postgres and a prefixed base58 string (`inv_…`)
// everywhere else. The conversion between the two happens in exactly two
// places — the Drizzle column (`idColumn` decodes on the way in and encodes on
// the way out) and the database itself (`id758_encode` / `id758_decode`) — so
// application code only ever handles the public form. A `ids.invoice.decode(x)`
// before a query, or an `ids.invoice.encode(row.id)` after one, is converting
// at the wrong layer: at best a no-op, at worst the source of a value that is
// in the other form from what its neighbour expects, which is exactly the class
// of bug the column layer exists to remove.
//
// Flagged:
//   - the bare codec functions imported from `id758` or `@ingram-tech/nk-db/id`
//     (`encodeId`, `decodeId`, `decodeAnyId`, and the deprecated
//     `toPrefixedId` / `fromPrefixedId`), anywhere;
//   - `.encode(…)`, `.decode(…)` and `.decodeOrNull(…)` called on a member of
//     a binding imported as `ids` — the registry a site exports from `ids.ts`
//     (`ids.invoice.decode(param)`).
//
// Not flagged: `.is()` (validating untrusted input is the app's job), `.mint()`,
// `.prefix`, and anything in `ids.ts` / `id.ts` / `schema.ts` / tests, where
// the boundary itself is built. A raw-SQL binding wants `sqlUuid(id)` or
// `id758_decode(…)` in the query, and a raw-SQL read wants `encodedId(…)` or
// `id758_encode(…)`; both keep the conversion at the boundary.

const CODEC_MODULES = new Set(["id758", "@ingram-tech/nk-db/id"]);
const CODEC_FUNCTIONS = new Set([
	"encodeId",
	"decodeId",
	"decodeAnyId",
	"toPrefixedId",
	"fromPrefixedId",
]);
const HELPER_METHODS = new Set(["encode", "decode", "decodeOrNull"]);
const BOUNDARY_FILES = /(^|[\\/])(ids?|schema)\.[cm]?[jt]sx?$/;

const noIdCodecInAppCode = {
	meta: {
		type: "suggestion",
		docs: {
			description:
				"Disallow converting between public ids and uuids in application code; the column and the database do it",
		},
		messages: {
			codecImport:
				"`{{name}}` converts between a public id and a uuid in application code. A column declared with `idColumn` takes public ids and returns them, and raw SQL has `id758_encode` / `id758_decode` (or `sqlUuid` / `encodedId` from `createIdColumns`). Keep the codec in `ids.ts`.",
			helperCall:
				"`{{callee}}()` converts between a public id and a uuid in application code. Pass the public id straight to the query (an `idColumn` decodes it) and read it back as-is (the column encodes it); validate untrusted input with `.is()`. In raw SQL use `id758_decode(…)` / `id758_encode(…)`.",
		},
	},
	create(context) {
		if (BOUNDARY_FILES.test(context.filename ?? "")) return {};
		// Local names bound to `ids` (the site's registry) by an import.
		const registryNames = new Set();
		return {
			ImportDeclaration(node) {
				for (const specifier of node.specifiers) {
					if (specifier.type !== "ImportSpecifier") continue;
					if (specifier.imported.type !== "Identifier") continue;
					const name = specifier.imported.name;
					if (
						CODEC_MODULES.has(node.source.value) &&
						CODEC_FUNCTIONS.has(name)
					) {
						context.report({
							node: specifier,
							messageId: "codecImport",
							data: { name },
						});
					}
					if (name === "ids") registryNames.add(specifier.local.name);
				}
			},
			CallExpression(node) {
				const callee = node.callee;
				if (callee.type !== "MemberExpression" || callee.computed) return;
				if (callee.property.type !== "Identifier") return;
				if (!HELPER_METHODS.has(callee.property.name)) return;
				const helper = callee.object;
				if (helper.type !== "MemberExpression" || helper.computed) return;
				if (helper.property.type !== "Identifier") return;
				if (helper.object.type !== "Identifier") return;
				if (!registryNames.has(helper.object.name)) return;
				context.report({
					node,
					messageId: "helperCall",
					data: {
						callee: `${helper.object.name}.${helper.property.name}.${callee.property.name}`,
					},
				});
			},
		};
	},
};

export default {
	meta: { name: "nextkit" },
	rules: { "no-id-codec-in-app-code": noIdCodecInAppCode },
};
