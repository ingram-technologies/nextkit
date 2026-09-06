// nextkit oxlint JS plugin rule: a client component reads only the env vars
// Next is willing to give the browser.
//
// Next replaces `process.env.FOO` at build time, and only `NEXT_PUBLIC_*`
// survives into client bundles. Everything else becomes `undefined` there, so
// a secret read from a `"use client"` file is a feature that silently does
// nothing in the browser — a key that is never sent, a flag that never turns
// on — while working perfectly in dev, in tests and in any server render of
// the same module. And when a var IS public, the value is inlined into the
// bundle for anyone to read, which is the wrong home for a credential.
//
// The rule is an allowlist rather than a list of secret names, because a list
// of secrets goes stale the moment someone adds an integration and the miss is
// silent: a client file may read `NEXT_PUBLIC_*` and `NODE_ENV`, nothing else.
//
// The fix is almost never to rename the variable to `NEXT_PUBLIC_`. Read it in
// a server component or route handler and pass the value down as a prop, or
// call an API route that reads it server-side.

const CLIENT_SAFE = /^NEXT_PUBLIC_/;

/** Whether the file opens with the "use client" directive. */
const isClientFile = (program) => {
	for (const statement of program.body) {
		if (statement.type !== "ExpressionStatement") break;
		const value = statement.directive ?? statement.expression.value;
		if (typeof value !== "string") break;
		if (value === "use client") return true;
	}
	return false;
};

/** The variable name in `process.env.FOO` / `process.env["FOO"]`, or null. */
const envVarName = (node) => {
	const object = node.object;
	if (object.type !== "MemberExpression" || object.computed) return null;
	if (object.object.type !== "Identifier" || object.object.name !== "process") {
		return null;
	}
	if (object.property.type !== "Identifier" || object.property.name !== "env") {
		return null;
	}
	if (!node.computed && node.property.type === "Identifier") {
		return node.property.name;
	}
	if (node.computed && node.property.type === "Literal") {
		return typeof node.property.value === "string" ? node.property.value : null;
	}
	return null;
};

const noServerEnvInClient = {
	meta: {
		type: "problem",
		docs: {
			description:
				'Disallow reading non-public env vars from a "use client" file',
		},
		messages: {
			serverEnvInClient:
				"`process.env.{{name}}` is not available in the browser: Next only inlines `NEXT_PUBLIC_*` into client bundles, so this reads `undefined` there while working on the server. Read it in a server component or route handler and pass the value in. Renaming it to `NEXT_PUBLIC_{{name}}` publishes it to every visitor, so do that only for values that are already public.",
		},
	},
	create(context) {
		let client = false;
		return {
			Program(node) {
				client = isClientFile(node);
			},
			MemberExpression(node) {
				if (!client) return;
				const name = envVarName(node);
				if (name === null) return;
				if (name === "NODE_ENV" || CLIENT_SAFE.test(name)) return;
				context.report({
					node,
					messageId: "serverEnvInClient",
					data: { name },
				});
			},
		};
	},
};

export default {
	meta: { name: "nextkit" },
	rules: { "no-server-env-in-client": noServerEnvInClient },
};
