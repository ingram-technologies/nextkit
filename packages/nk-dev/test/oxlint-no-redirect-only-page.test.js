import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const pluginPath = join(
	dirname(fileURLToPath(import.meta.url)),
	"../lib/oxlint-plugins/index.js",
);

const dirs = [];
afterEach(() => {
	for (const dir of dirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

// The rule keys off the `src/app/**/page.tsx` path, so fixtures are written at
// a real route path under the temp dir and linted from there.
const lint = (routeDir, source) => {
	const dir = mkdtempSync(join(tmpdir(), "nk-oxlint-redirect-"));
	dirs.push(dir);
	writeFileSync(
		join(dir, ".oxlintrc.json"),
		JSON.stringify({
			jsPlugins: [pluginPath],
			rules: { "nextkit/no-redirect-only-page": "error" },
		}),
	);
	const abs = join(dir, "src", "app", routeDir);
	mkdirSync(abs, { recursive: true });
	const rel = join("src", "app", routeDir, "page.tsx");
	writeFileSync(join(abs, "page.tsx"), source);
	try {
		execFileSync("oxlint", ["-c", ".oxlintrc.json", rel], {
			cwd: dir,
			encoding: "utf8",
		});
		return "";
	} catch (error) {
		return String(error.stdout ?? "");
	}
};

describe("no-redirect-only-page", () => {
	it("flags a redirect-only page and names the config entry", () => {
		const out = lint(
			"old-home",
			`import { redirect } from "next/navigation";\nexport default function Page() { redirect("/home"); }`,
		);
		expect(out).toContain("no-redirect-only-page");
		expect(out).toContain('source: "/old-home"');
		expect(out).toContain('destination: "/home"');
	});

	it("strips route groups from the derived source path", () => {
		const out = lint(
			join("(marketing)", "promo"),
			`import { redirect } from "next/navigation";\nexport default function Page() { redirect("/sale"); }`,
		);
		expect(out).toContain('source: "/promo"');
	});

	it("does not flag a page that renders real content", () => {
		const out = lint(
			"dashboard",
			`export default function Page() { return <main>Dashboard</main>; }`,
		);
		expect(out).toBe("");
	});

	it("does not flag a page whose redirect is conditional logic", () => {
		const out = lint(
			"account",
			`import { redirect } from "next/navigation";\nexport default function Page({ user }: { user?: string }) {\n\tif (!user) { redirect("/login"); }\n\tconsole.log(user);\n\treturn <main>Account</main>;\n}`,
		);
		expect(out).toBe("");
	});
});
