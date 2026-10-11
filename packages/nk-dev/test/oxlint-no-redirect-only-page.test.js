import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { lint as lintRule, ruleIds } from "./oxlint-harness.js";

const RULE = "nextkit/no-redirect-only-page";

// The rule keys off the `src/app/**/page.tsx` path, so fixtures are written at
// a real route path.
const lint = (routeDir, source) =>
	lintRule("no-redirect-only-page", source, {
		filename: join("src", "app", routeDir, "page.tsx"),
	});

const REDIRECT_IMPORT = `import { redirect } from "next/navigation";\n`;

describe("no-redirect-only-page", () => {
	it("flags a redirect-only page and names the config entry", () => {
		const out = lint(
			"old-home",
			`${REDIRECT_IMPORT}export default function Page() { redirect("/home"); }`,
		);
		expect(ruleIds(out)).toEqual([RULE]);
		expect(out[0].message).toContain('source: "/old-home"');
		expect(out[0].message).toContain('destination: "/home"');
	});

	it("strips route groups from the derived source path", () => {
		const out = lint(
			join("(marketing)", "promo"),
			`${REDIRECT_IMPORT}export default function Page() { redirect("/sale"); }`,
		);
		expect(ruleIds(out)).toEqual([RULE]);
		expect(out[0].message).toContain('source: "/promo"');
	});

	it("maps a dynamic segment to a config param in source and destination", () => {
		const out = lint(
			join("old-blog", "[slug]"),
			`${REDIRECT_IMPORT}export default async function Page({ params }) {\n\tconst { slug } = await params;\n\tredirect(\`/blog/\${slug}\`);\n}`,
		);
		expect(ruleIds(out)).toEqual([RULE]);
		expect(out[0].message).toContain('source: "/old-blog/:slug"');
		expect(out[0].message).toContain('destination: "/blog/:slug"');
	});

	it("derives / for the root page", () => {
		const out = lint(
			"",
			`${REDIRECT_IMPORT}export default function Page() { redirect("/home"); }`,
		);
		expect(ruleIds(out)).toEqual([RULE]);
		expect(out[0].message).toContain('source: "/"');
	});

	it("does not flag a page that renders real content", () => {
		const out = lint(
			"dashboard",
			`export default function Page() { return <main>Dashboard</main>; }`,
		);
		expect(out).toEqual([]);
	});

	it("does not flag a page whose redirect is conditional logic", () => {
		const out = lint(
			"account",
			`${REDIRECT_IMPORT}export default function Page({ user }: { user?: string }) {\n\tif (!user) { redirect("/login"); }\n\tconsole.log(user);\n\treturn <main>Account</main>;\n}`,
		);
		expect(out).toEqual([]);
	});
});
