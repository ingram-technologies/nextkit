// nextkit oxlint JS plugin rule: catch `event.currentTarget` reads that
// outlive the event handler.
//
// The trap: React nulls a synthetic event's `currentTarget` once the handler
// returns — it is per-dispatch state, reassigned as the one event object
// traverses the propagation path (mirroring the DOM spec, where currentTarget
// is only defined during dispatch). Reading it inside a callback that runs
// after the handler — a functional setState updater, setTimeout, a promise
// chain, a debounced closure — crashes with "Cannot read properties of null".
// The failure is intermittent: React evaluates a setState updater eagerly when
// the queue is empty, so the first keystroke works and only the replayed or
// queued case crashes.
//
// tsc CANNOT catch this class: @types/react declares `currentTarget` non-null
// (true during dispatch), and the nulling is a temporal invariant the type
// system cannot express. Worse, `currentTarget` is the better-typed accessor
// (typed as the element the handler is attached to, unlike `target`), so
// TS-first code is steered toward exactly the property that expires. React 16
// warned at runtime on any post-handler event access (event pooling); React 17
// removed pooling and the warning with it, leaving `currentTarget` as the one
// silently expiring property. Hence a lint rule.
//
// Detection: report `x.currentTarget` where `x` is bound as a parameter by an
// ENCLOSING function other than the innermost one — i.e. the read crosses a
// closure boundary out of the handler. Locals declared in the current function
// (including a captured `const target = event.currentTarget` in the handler
// body, which is the fix) never report.
//
// Known false positive: a closure the handler invokes synchronously itself
// (e.g. `items.map((it) => event.currentTarget...)`). That pattern is rare and
// fragile anyway; prefer capturing first, or suppress with a justified
// oxlint-disable comment.

const collectParamBindings = (params, into) => {
	for (const param of params) {
		if (param.type === "Identifier") into.add(param.name);
		else if (
			param.type === "AssignmentPattern" &&
			param.left.type === "Identifier"
		) {
			into.add(param.left.name);
		} else if (
			param.type === "RestElement" &&
			param.argument.type === "Identifier"
		) {
			into.add(param.argument.name);
		}
	}
};

const noDeferredCurrentTarget = {
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow reading `event.currentTarget` inside a callback nested in the event handler; React nulls `currentTarget` after dispatch.",
		},
		messages: {
			deferred:
				"`{{name}}.currentTarget` is read inside a callback nested in the event handler. React nulls `currentTarget` once the handler returns, so this can crash when the callback runs later (e.g. a replayed setState updater). Capture the value into a local in the handler body and use that instead.",
		},
	},
	create(context) {
		const scopes = [];
		const enterFunction = (node) => {
			const bindings = new Set();
			collectParamBindings(node.params, bindings);
			scopes.push(bindings);
		};
		const exitFunction = () => {
			scopes.pop();
		};
		return {
			FunctionDeclaration: enterFunction,
			"FunctionDeclaration:exit": exitFunction,
			FunctionExpression: enterFunction,
			"FunctionExpression:exit": exitFunction,
			ArrowFunctionExpression: enterFunction,
			"ArrowFunctionExpression:exit": exitFunction,
			VariableDeclarator(node) {
				// Track locals so a variable declared in the current function
				// (including a rebound `event`) never reports.
				if (scopes.length > 0 && node.id.type === "Identifier") {
					scopes[scopes.length - 1].add(node.id.name);
				}
			},
			MemberExpression(node) {
				if (node.computed) return;
				if (
					node.property.type !== "Identifier" ||
					node.property.name !== "currentTarget"
				) {
					return;
				}
				if (node.object.type !== "Identifier") return;
				if (scopes.length < 2) return;
				const name = node.object.name;
				if (scopes[scopes.length - 1].has(name)) return;
				if (!scopes.slice(0, -1).some((frame) => frame.has(name))) return;
				context.report({ node, messageId: "deferred", data: { name } });
			},
		};
	},
};

export default {
	meta: { name: "nextkit" },
	rules: { "no-deferred-current-target": noDeferredCurrentTarget },
};
