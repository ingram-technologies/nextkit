import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findings } from "../lib/doctor.js";

/**
 * nk-auth's guards build `?next=` from a request header only a proxy can set.
 * Binding the helpers without setting the header loses `next` silently, so
 * `nk doctor` flags a site that has the one and not the other.
 */
describe("nk doctor: nk-auth guards bound without the next header", () => {
	let dir;
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), "nk-doctor-auth-next-"));
		writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "site" }));
	});
	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	const write = (rel, content = "") => {
		const full = join(dir, rel);
		mkdirSync(dirname(full), { recursive: true });
		writeFileSync(full, content);
	};
	const nextFindings = () =>
		findings(dir).filter((f) => f.id === "auth:next-unwired");
	const helpers = "export const { requireUser } = createAuthHelpers(auth);\n";

	it("is silent on a site without the helpers", () => {
		write("src/proxy.ts", "export function proxy() {}");
		expect(nextFindings()).toEqual([]);
	});

	it("warns when the helpers are bound and nothing sets the header", () => {
		write("src/lib/auth/session.ts", helpers);
		write(
			"src/proxy.ts",
			"export const proxy = (req) => localeProxy(routing, req);",
		);
		const [finding] = nextFindings();
		expect(finding?.level).toBe("warn");
		expect(finding?.message).toContain("src/lib/auth/session.ts");
		expect(finding?.message).toContain("withAuthPathHeader");
	});

	it("is satisfied by createAuthMiddleware", () => {
		write("src/lib/auth/session.ts", helpers);
		write(
			"middleware.ts",
			"export const middleware = createAuthMiddleware({ protectedPaths: [] });",
		);
		expect(nextFindings()).toEqual([]);
	});

	it("is satisfied by withAuthPathHeader in a custom proxy", () => {
		write("src/lib/auth/session.ts", helpers);
		write(
			"src/proxy.ts",
			"const h = new Headers(req.headers); withAuthPathHeader(req, h);",
		);
		expect(nextFindings()).toEqual([]);
	});

	it("ignores node_modules and test files", () => {
		write("src/lib/auth/session.ts", helpers);
		write("node_modules/x/index.js", "withAuthPathHeader(req, h)");
		write("src/proxy.test.ts", "withAuthPathHeader(req, h)");
		expect(nextFindings()).toHaveLength(1);
	});
});
