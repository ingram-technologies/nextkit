import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findings } from "../lib/doctor.js";

/**
 * A static segment beats the `[...all]` catch-all, so a page under app/auth/
 * matching a Better Auth endpoint shadows it (POSTs return 405) with no
 * build-time signal. `nk doctor` derives the endpoint list textually from
 * better-auth's dist and flags the collision.
 */
describe("nk doctor: Better Auth endpoint shadowing", () => {
	let dir;
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), "nk-doctor-auth-"));
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

	// Mirrors better-auth's dist shape loosely: routes are .mjs files calling
	// createAuthEndpoint("<path>", ...).
	const writeBetterAuth = () => {
		write(
			"node_modules/better-auth/package.json",
			JSON.stringify({
				name: "better-auth",
				version: "1.6.0",
				main: "dist/index.mjs",
			}),
		);
		write(
			"node_modules/better-auth/dist/api/routes/two.mjs",
			[
				'const resetPassword = () => createAuthEndpoint("/reset-password", {',
				'\tmethod: "POST",',
				"});",
				'const resetPasswordToken = createAuthEndpoint("/reset-password/:token", {});',
				'const callbackOAuth = createAuthEndpoint("/callback/:id", {});',
				'const signInEmail = () => createAuthEndpoint("/sign-in/email", {});',
			].join("\n"),
		);
	};

	const writeMount = (appDir = "src/app") =>
		write(`${appDir}/auth/[...all]/route.ts`, "export const GET = () => {};");

	const shadowFindings = () => findings(dir).filter((f) => f.id.startsWith("auth:"));

	it("flags a page shadowing a core endpoint as an error", () => {
		writeBetterAuth();
		writeMount();
		write("src/app/auth/reset-password/page.tsx");
		const f = shadowFindings().find(
			(x) => x.id === "auth:endpoint-shadow:/reset-password",
		);
		expect(f).toBeDefined();
		expect(f.level).toBe("error");
		expect(f.message).toMatch(/reset-password\/page\.tsx/);
		expect(f.message).toMatch(/405/);
	});

	it("matches an endpoint :param segment against any page segment", () => {
		writeBetterAuth();
		writeMount();
		write("src/app/auth/callback/google/page.tsx");
		const f = shadowFindings().find(
			(x) => x.id === "auth:endpoint-shadow:/callback/google",
		);
		expect(f).toBeDefined();
		expect(f.level).toBe("error");
	});

	it("leaves a non-colliding page alone", () => {
		writeBetterAuth();
		writeMount();
		write("src/app/auth/login/page.tsx");
		expect(shadowFindings()).toEqual([]);
	});

	it("strips (group) segments before matching", () => {
		writeBetterAuth();
		writeMount();
		write("src/app/auth/(marketing)/reset-password/page.tsx");
		expect(
			shadowFindings().find(
				(x) => x.id === "auth:endpoint-shadow:/reset-password",
			),
		).toBeDefined();
	});

	it("skips _private folders", () => {
		writeBetterAuth();
		writeMount();
		write("src/app/auth/_components/reset-password/page.tsx");
		expect(shadowFindings()).toEqual([]);
	});

	it("is silent without a [...all] mount, even with a colliding page", () => {
		writeBetterAuth();
		write("src/app/auth/reset-password/page.tsx");
		expect(shadowFindings()).toEqual([]);
	});

	it("is silent when better-auth is not installed", () => {
		writeMount();
		write("src/app/auth/reset-password/page.tsx");
		expect(shadowFindings()).toEqual([]);
	});

	it("handles a bare app/ directory (no src/)", () => {
		writeBetterAuth();
		writeMount("app");
		write("app/auth/reset-password/page.tsx");
		expect(
			shadowFindings().find(
				(x) => x.id === "auth:endpoint-shadow:/reset-password",
			),
		).toBeDefined();
	});

	it("reports a plugin endpoint collision as a warning", () => {
		writeBetterAuth();
		write(
			"node_modules/better-auth/dist/plugins/magic-link/index.mjs",
			'const verify = createAuthEndpoint("/magic-link/verify", {});',
		);
		writeMount();
		write("src/app/auth/magic-link/verify/page.tsx");
		const f = shadowFindings().find(
			(x) => x.id === "auth:endpoint-shadow-plugin:/magic-link/verify",
		);
		expect(f).toBeDefined();
		expect(f.level).toBe("warn");
		expect(f.message).toMatch(/plugin/);
	});

	it("warns (not errors) when better-auth's routes layout is not greppable", () => {
		write(
			"node_modules/better-auth/package.json",
			JSON.stringify({
				name: "better-auth",
				version: "9.9.9",
				main: "dist/index.mjs",
			}),
		);
		writeMount();
		const f = shadowFindings().find((x) => x.id === "auth:shadow-check-skipped");
		expect(f).toBeDefined();
		expect(f.level).toBe("warn");
	});
});
