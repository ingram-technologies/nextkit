// nextkit oxlint JS plugin rule: don't import from `node:crypto` what is
// already a global.
//
// Web Crypto is on `globalThis` in every runtime we ship to — Node (since 19,
// and nk-dev's floor is 22), the browser, and every edge/worker runtime. So
// `randomUUID`, `getRandomValues`, `subtle` and `webcrypto` are reachable as
// `crypto.randomUUID()`, `crypto.getRandomValues()`, `crypto.subtle` and
// `crypto` with no import at all.
//
// Importing them anyway costs something real: it pins the module to a Node-only
// runtime for a function it would have had regardless. A component, a shared
// helper or a route that could have run anywhere now can't, and the reason is
// invisible at the call site — the code reads identically either way. Two of
// these are not even different objects: `node:crypto`'s `subtle` and `webcrypto`
// are the very same references as `globalThis.crypto.subtle` and
// `globalThis.crypto`.
//
// nk-db already pays for this the hard way: its id codec is imported by Drizzle
// schemas, client components and edge runtimes, so `id.ts` is held to an empty
// import list by a test (`id.test.ts`, "isomorphic invariant") whose comment
// names `node:crypto` for randomness as the tempting one. That invariant was
// prose in one package; this rule is the mechanical version of it, fleet-wide.
//
// This is about the module boundary, not the algorithm. The rest of `node:crypto`
// — `createHash`, `createHmac`, `createPrivateKey`, `randomBytes`,
// `timingSafeEqual` — has no drop-in global (the Web Crypto equivalents live
// under `crypto.subtle` and are async), so those imports are correct and this
// rule leaves them alone. Trimming a redundant name off an import list is the
// common fix; the import disappears entirely only when nothing else was on it.
//
// Deliberately not autofixable. Deleting the specifier is the easy half — the
// call sites still have to become member expressions on the global, and a
// default or namespace import named `crypto` (which shadows the global it is
// standing in for) needs the whole file reread, not a mechanical edit.
//
// One case keeps the import: `node:crypto`'s `randomUUID` takes an options bag
// (`randomUUID({ disableEntropyCache: true })`) that Web Crypto's does not. If
// you need it, keep the import and say so:
//
//   // oxlint-disable-next-line nextkit/no-redundant-node-crypto -- needs disableEntropyCache
//
// Only static `import` is checked, matching every other rule in this plugin.
// `require("node:crypto")` in a CommonJS script is out of scope.
//
// Note this overlaps by design with `nextkit/no-crypto-random-uuid`, which asks
// a different question about the same call: that rule is about v4-versus-v7 for
// a *stored id*, this one is about the module. A call site that justifiably
// keeps v4 — a bearer token, a nonce — silences that rule and should still be
// reaching for the global.

const NODE_CRYPTO_MODULES = new Set(["crypto", "node:crypto"]);

/** node:crypto exports that are already global, and what to reach for instead. */
const REDUNDANT_EXPORTS = new Map([
	["randomUUID", "crypto.randomUUID()"],
	["getRandomValues", "crypto.getRandomValues()"],
	["subtle", "crypto.subtle"],
	["webcrypto", "crypto"],
]);

const noRedundantNodeCrypto = {
	meta: {
		type: "suggestion",
		docs: {
			description:
				"Disallow importing node:crypto members that are already on the Web Crypto global",
		},
		messages: {
			redundantImport:
				"`{{name}}` from `{{module}}` is already global — use `{{replacement}}` and drop the import. Web Crypto is on globalThis in Node (>=19), the browser and every edge runtime, so importing it pins this module to Node for nothing. Keep the import only if you need a Node-specific signature, with `// oxlint-disable-next-line nextkit/no-redundant-node-crypto -- <reason>`.",
			redundantMember:
				"`{{local}}.{{name}}` is already global — use `{{replacement}}`. Web Crypto is on globalThis in Node (>=19), the browser and every edge runtime; reaching for it through the `{{module}}` namespace pins this module to Node for nothing.",
		},
	},
	create(context) {
		// Local names bound to the whole module (`import * as c` / `import c`),
		// whose members we then check.
		const namespaceNames = new Set();

		return {
			ImportDeclaration(node) {
				const module = node.source.value;
				if (!NODE_CRYPTO_MODULES.has(module)) return;

				for (const specifier of node.specifiers) {
					if (
						specifier.type === "ImportNamespaceSpecifier" ||
						specifier.type === "ImportDefaultSpecifier"
					) {
						namespaceNames.add(specifier.local.name);
						continue;
					}
					if (specifier.type !== "ImportSpecifier") continue;
					if (specifier.imported.type !== "Identifier") continue;

					const name = specifier.imported.name;
					const replacement = REDUNDANT_EXPORTS.get(name);
					if (!replacement) continue;

					context.report({
						node: specifier,
						messageId: "redundantImport",
						data: { name, module, replacement },
					});
				}
			},
			// `nodeCrypto.subtle` where `nodeCrypto` is the imported module. The
			// import itself can be legitimate (it may also carry `createHash`), so
			// the redundant part is this access, not the declaration.
			MemberExpression(node) {
				if (node.computed) return;
				if (node.object.type !== "Identifier") return;
				if (!namespaceNames.has(node.object.name)) return;
				if (node.property.type !== "Identifier") return;

				const replacement = REDUNDANT_EXPORTS.get(node.property.name);
				if (!replacement) return;

				context.report({
					node,
					messageId: "redundantMember",
					data: {
						local: node.object.name,
						name: node.property.name,
						replacement,
						module: "node:crypto",
					},
				});
			},
		};
	},
};

export default {
	meta: { name: "nextkit" },
	rules: { "no-redundant-node-crypto": noRedundantNodeCrypto },
};
