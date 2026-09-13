import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findings } from "../lib/doctor.js";

/**
 * Better Auth moves only with nk-auth, which pins the exact version its chain
 * was proven against. A site declaring another version, or any range, is a
 * schema/package split waiting to happen, so `nk doctor` fails it.
 */
describe("nk doctor: better-auth pinned to nk-auth's version", () => {
	let dir;
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), "nk-doctor-auth-version-"));
	});
	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});
	const site = (deps) =>
		writeFileSync(
			join(dir, "package.json"),
			JSON.stringify({ name: "site", dependencies: deps }),
		);
	const installNkAuth = (peer) => {
		const folder = join(dir, "node_modules/@ingram-tech/nk-auth");
		mkdirSync(folder, { recursive: true });
		writeFileSync(
			join(folder, "package.json"),
			JSON.stringify({
				name: "@ingram-tech/nk-auth",
				peerDependencies: { "better-auth": peer, "@better-auth/passkey": peer },
			}),
		);
	};
	const authFindings = () =>
		findings(dir).filter((f) => f.id.startsWith("auth:version:"));

	it("is silent on a site without nk-auth", () => {
		site({ "better-auth": "^1.7.2" });
		expect(authFindings()).toEqual([]);
	});

	it("is silent when nk-auth is not installed yet", () => {
		site({ "@ingram-tech/nk-auth": "^0.17.0", "better-auth": "^1.7.2" });
		expect(authFindings()).toEqual([]);
	});

	it("passes an exact pin matching nk-auth", () => {
		site({ "@ingram-tech/nk-auth": "^0.17.0", "better-auth": "1.7.4" });
		installNkAuth("1.7.4");
		expect(authFindings()).toEqual([]);
	});

	it("fails a range, even one that resolves to the right version", () => {
		site({ "@ingram-tech/nk-auth": "^0.17.0", "better-auth": "^1.7.4" });
		installNkAuth("1.7.4");
		const [finding] = authFindings();
		expect(finding?.level).toBe("error");
		expect(finding?.message).toContain("a range");
		expect(finding?.message).toContain("db:migrate");
	});

	it("fails a pin that differs, for every Better Auth package declared", () => {
		site({
			"@ingram-tech/nk-auth": "^0.17.0",
			"better-auth": "1.7.2",
			"@better-auth/passkey": "1.7.2",
		});
		installNkAuth("1.7.4");
		expect(
			authFindings()
				.map((f) => f.id)
				.sort(),
		).toEqual(["auth:version:@better-auth/passkey", "auth:version:better-auth"]);
	});

	it("fixes by pinning the site to nk-auth's version", () => {
		site({ "@ingram-tech/nk-auth": "^0.17.0", "better-auth": "^1.7.2" });
		installNkAuth("1.7.4");
		const [finding] = authFindings();
		expect(finding.fix(dir)).toContain("1.7.4");
		expect(authFindings()).toEqual([]);
	});
});
