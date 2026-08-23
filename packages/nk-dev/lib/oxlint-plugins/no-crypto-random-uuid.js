// nextkit oxlint JS plugin rule: keep `crypto.randomUUID()` off the id write
// path.
//
// nextkit ids are UUIDv7: time-ordered, so inserts land at the right edge of the
// primary-key B-tree instead of scattering across it. `crypto.randomUUID()` is
// v4 — uniformly random — so a single call site minting a stored id fragments
// that index while every other row in the table stays ordered. The mismatch is
// invisible until the table is large, which is exactly when it is expensive to
// undo.
//
// The mint is `uuidv7()` from `id758` (re-exported by `@ingram-tech/nk-db/id`), already typed
// `Uuid`. Most rows need no mint at all: `uuid("id").primaryKey().default(sql`
// `uuidv7()`)` lets the database do it, and the app only mints when it needs the
// id *before* the insert (a client-chosen document PK it must also use as the
// storage object name).
//
// Deliberately not autofixable. The right replacement depends on what the value
// is, and one of the answers is "leave it alone":
//
//   - a stored id            -> uuidv7(), or drop it for the column default
//   - a bearer token / nonce -> keep crypto.randomUUID()
//
// v7 is the *wrong* choice for a secret. It spends 48 bits on a millisecond
// timestamp, leaving 74 random bits against v4's 122, and it leaks its own
// creation time to whoever holds it. Invitation tokens, OAuth `state`, password
// reset links and similar unguessable values must stay v4 — silence the rule at
// those call sites with a justified disable comment rather than "fixing" them:
//
//   // oxlint-disable-next-line nextkit/no-crypto-random-uuid -- CSRF nonce, wants v4 entropy
//
// Test files are exempt via an override in the shared oxlintrc: test rows are
// ephemeral, so index locality is meaningless there and `crypto.randomUUID()`
// stays the zero-import default that keeps fixtures readable.

const NODE_CRYPTO_MODULES = new Set(["crypto", "node:crypto"]);

/** `crypto.randomUUID` or `globalThis.crypto.randomUUID`, and not shadowed. */
const isGlobalCryptoRandomUuid = (callee, scope) => {
	if (callee.type !== "MemberExpression") return false;
	if (callee.computed) return false;
	if (callee.property.type !== "Identifier") return false;
	if (callee.property.name !== "randomUUID") return false;

	const object = callee.object;
	let root;
	if (object.type === "Identifier" && object.name === "crypto") {
		root = object;
	} else if (
		object.type === "MemberExpression" &&
		!object.computed &&
		object.object.type === "Identifier" &&
		object.object.name === "globalThis" &&
		object.property.type === "Identifier" &&
		object.property.name === "crypto"
	) {
		// `globalThis.crypto` can't be shadowed by a local binding.
		return true;
	} else {
		return false;
	}

	// A local `crypto` (a mock, an injected dependency) is not the global one.
	for (let current = scope; current; current = current.upper) {
		const variable = current.variables?.find((v) => v.name === root.name);
		if (!variable) continue;
		return variable.defs.length === 0;
	}
	return true;
};

const noCryptoRandomUuid = {
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow crypto.randomUUID() (UUIDv4) where nextkit ids are UUIDv7",
		},
		messages: {
			cryptoRandomUuid:
				"`crypto.randomUUID()` is UUIDv4; stored ids are UUIDv7. Mint with `uuidv7()` from `id758` (re-exported by `@ingram-tech/nk-db/id`), or omit the id and let the `uuidv7()` column default apply. If this is a bearer token or nonce, keep v4 and add `// oxlint-disable-next-line nextkit/no-crypto-random-uuid -- <reason>`.",
		},
	},
	create(context) {
		const sourceCode = context.sourceCode;
		// Local names bound to `randomUUID` imported from node:crypto.
		const importedNames = new Set();

		return {
			ImportDeclaration(node) {
				if (!NODE_CRYPTO_MODULES.has(node.source.value)) return;
				for (const specifier of node.specifiers) {
					if (specifier.type !== "ImportSpecifier") continue;
					if (specifier.imported.type !== "Identifier") continue;
					if (specifier.imported.name !== "randomUUID") continue;
					importedNames.add(specifier.local.name);
				}
			},
			CallExpression(node) {
				const callee = node.callee;
				const isImported =
					callee.type === "Identifier" && importedNames.has(callee.name);
				if (
					!isImported &&
					!isGlobalCryptoRandomUuid(callee, sourceCode.getScope(node))
				) {
					return;
				}
				context.report({ node, messageId: "cryptoRandomUuid" });
			},
		};
	},
};

export default {
	meta: { name: "nextkit" },
	rules: { "no-crypto-random-uuid": noCryptoRandomUuid },
};
