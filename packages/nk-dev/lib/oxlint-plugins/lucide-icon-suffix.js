// nextkit oxlint JS plugin rule: enforce the `Icon` suffix on lucide-react
// icon imports.
//
// lucide-react now ships every icon under an `Icon`-suffixed name (`HomeIcon`,
// `ArrowRightIcon`, ...) and has deprecated the bare aliases (`Home`,
// `ArrowRight`). Standardizing on the suffixed names keeps imports off the
// deprecated path and makes an icon obvious at the use site: `<TrashIcon />`
// reads as an icon, `<Trash />` reads like a domain component.
//
// The rule only fires on imports from "lucide-react", so it is inert on sites
// that do not use lucide — no package.json gate needed (unlike the base-ui
// rule, which keys off a component name that also exists in Radix). The
// package's non-icon named exports (`LucideProps`, `IconNode`, `icons`,
// `dynamicIconImports`) are skipped so the autofix never renames them to
// nonsense like `LucidePropsIcon`.
//
// Autofix renames the import specifier and, when the local name is not aliased,
// every reference to it in the file.

const NON_ICON_EXPORTS = new Set([
	"LucideProps",
	"IconNode",
	"icons",
	"dynamicIconImports",
]);

const lucideIconSuffix = {
	meta: {
		type: "suggestion",
		docs: {
			description: "Enforce the Icon suffix on lucide-react imports",
		},
		fixable: "code",
		messages: {
			missingIconSuffix:
				"Import `{{imported}}` from lucide-react must use the Icon suffix: `{{suggested}}`.",
		},
	},
	create(context) {
		const sourceCode = context.sourceCode;
		return {
			ImportDeclaration(node) {
				if (node.source.value !== "lucide-react") return;
				for (const specifier of node.specifiers) {
					if (specifier.type !== "ImportSpecifier") continue;
					if (specifier.imported.type !== "Identifier") continue;

					const importedName = specifier.imported.name;
					if (
						importedName.endsWith("Icon") ||
						NON_ICON_EXPORTS.has(importedName)
					) {
						continue;
					}

					const suggested = `${importedName}Icon`;
					const notAliased = specifier.imported.name === specifier.local.name;
					context.report({
						node: specifier,
						messageId: "missingIconSuffix",
						data: { imported: importedName, suggested },
						fix(fixer) {
							const fixes = [
								fixer.replaceText(specifier.imported, suggested),
							];
							if (notAliased) {
								for (const variable of sourceCode.getDeclaredVariables(
									node,
								)) {
									if (variable.name !== specifier.local.name) {
										continue;
									}
									for (const ref of variable.references) {
										if (ref.identifier !== specifier.local) {
											fixes.push(
												fixer.replaceText(
													ref.identifier,
													suggested,
												),
											);
										}
									}
								}
							}
							return fixes;
						},
					});
				}
			},
		};
	},
};

export default {
	meta: { name: "nextkit" },
	rules: { "lucide-icon-suffix": lucideIconSuffix },
};
