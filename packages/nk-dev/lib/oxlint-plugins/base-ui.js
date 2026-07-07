// nextkit oxlint JS plugin: catch Radix-era props left on Base UI
// (@base-ui/react) shadcn wrappers that silently do nothing post-migration.
//
// The trap: a Radix prop whose name is also a valid native DOM attribute is
// accepted by Base UI's wrapper prop types (they extend the rendered element's
// DOM props) and then dropped at runtime. `onSelect` on a menu item is the
// canonical case: it type-checks as the DOM text-selection handler on the
// rendered <div>, so tsc stays silent, and it never fires on click. The menu
// action just does nothing. Base UI's Menu.Item activates via `onClick`.
//
// tsc CANNOT catch this class (the prop is a legitimate DOM attribute), which
// is exactly why it needs a lint rule. Note the mirror image: non-DOM Radix
// renames (asChild -> render, forceMount -> keepMounted, onValueCommit ->
// onValueCommitted, delayDuration -> delay, Accordion type -> openMultiple) are
// NOT listed here because they are not valid DOM attributes, so tsc already
// errors on them. Only add an entry when the old prop is a valid DOM attribute
// on the element the wrapper renders (i.e. genuinely silent). Otherwise you add
// noise that duplicates the type-checker.
//
// Matching is by the shadcn wrapper's JSX element name, which is stable across
// nextkit sites. Aliased imports (rare) are not matched; that is an accepted
// limitation, not a correctness hole (the type-checker still guards renames).
//
// The same component names exist in Radix-based shadcn, where `onSelect` is the
// CORRECT API. So the rule only activates for projects that actually depend on
// @base-ui/react; on Radix (or UI-less) sites it is inert. This lets the shared
// nextkit ruleset enable it as an error fleet-wide without false positives.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const baseUiCache = new Map();

const pkgDeclaresBaseUi = (pkgPath) => {
	try {
		const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
		return Boolean(
			pkg.dependencies?.["@base-ui/react"] ||
			pkg.devDependencies?.["@base-ui/react"] ||
			pkg.peerDependencies?.["@base-ui/react"],
		);
	} catch {
		return false;
	}
};

// Walk up to the nearest package.json and report whether it declares
// @base-ui/react, memoizing every directory visited so a lint run pays the fs
// cost once per project subtree.
const projectUsesBaseUi = (fromDir) => {
	const seen = [];
	let dir = fromDir;
	let result = null;
	while (result === null) {
		if (baseUiCache.has(dir)) {
			result = baseUiCache.get(dir);
		} else {
			seen.push(dir);
			const pkgPath = join(dir, "package.json");
			const parent = dirname(dir);
			if (existsSync(pkgPath)) result = pkgDeclaresBaseUi(pkgPath);
			else if (parent === dir) result = false;
			else dir = parent;
		}
	}
	for (const d of seen) baseUiCache.set(d, result);
	return result;
};

// component name -> { bannedProp: replacementProp }
const BANNED = {
	// Base UI Menu.Item (and its checkbox/radio variants) activate via onClick.
	DropdownMenuItem: { onSelect: "onClick" },
	DropdownMenuCheckboxItem: { onSelect: "onClick" },
	DropdownMenuRadioItem: { onSelect: "onClick" },
	ContextMenuItem: { onSelect: "onClick" },
	ContextMenuCheckboxItem: { onSelect: "onClick" },
	ContextMenuRadioItem: { onSelect: "onClick" },
	MenubarItem: { onSelect: "onClick" },
	MenubarCheckboxItem: { onSelect: "onClick" },
	MenubarRadioItem: { onSelect: "onClick" },
};

const elementNameOf = (attributeNode) => {
	const opening = attributeNode.parent;
	if (!opening || opening.type !== "JSXOpeningElement") return null;
	const name = opening.name;
	return name && name.type === "JSXIdentifier" ? name.name : null;
};

const noRadixPropsOnBaseUi = {
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow Radix-era props that Base UI wrappers silently ignore",
		},
	},
	create(context) {
		const filename = context.physicalFilename || context.filename || "";
		if (!filename || !projectUsesBaseUi(dirname(filename))) return {};
		return {
			JSXAttribute(node) {
				if (!node.name || node.name.type !== "JSXIdentifier") return;
				const banned = BANNED[elementNameOf(node)];
				if (!banned) return;
				const replacement = banned[node.name.name];
				if (!replacement) return;
				context.report({
					node: node.name,
					message: `\`${node.name.name}\` does nothing on this Base UI component and is silently dropped at runtime. Use \`${replacement}\` instead (a Radix -> Base UI leftover the type-checker cannot catch).`,
				});
			},
		};
	},
};

export default {
	meta: { name: "nextkit" },
	rules: { "no-radix-props-on-base-ui": noRadixPropsOnBaseUi },
};
