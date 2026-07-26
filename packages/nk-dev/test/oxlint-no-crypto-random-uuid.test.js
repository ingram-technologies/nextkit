import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
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

const lint = (source, filename = "fixture.ts") => {
	const dir = mkdtempSync(join(tmpdir(), "nk-oxlint-uuid-"));
	dirs.push(dir);
	writeFileSync(
		join(dir, ".oxlintrc.json"),
		JSON.stringify({
			jsPlugins: [pluginPath],
			rules: { "nextkit/no-crypto-random-uuid": "error" },
		}),
	);
	writeFileSync(join(dir, filename), source);
	try {
		execFileSync("oxlint", ["-c", ".oxlintrc.json", filename], {
			cwd: dir,
			encoding: "utf8",
		});
		return "";
	} catch (error) {
		return String(error.stdout ?? "");
	}
};

describe("no-crypto-random-uuid", () => {
	it("flags the global call", () => {
		expect(lint(`export const id = crypto.randomUUID();`)).toContain(
			"no-crypto-random-uuid",
		);
	});

	it("flags it through globalThis", () => {
		expect(lint(`export const id = globalThis.crypto.randomUUID();`)).toContain(
			"no-crypto-random-uuid",
		);
	});

	it("flags randomUUID imported from node:crypto", () => {
		expect(
			lint(
				`import { randomUUID } from "node:crypto";\nexport const id = randomUUID();`,
			),
		).toContain("no-crypto-random-uuid");
	});

	it("flags it under an import alias", () => {
		expect(
			lint(
				`import { randomUUID as mint } from "crypto";\nexport const id = mint();`,
			),
		).toContain("no-crypto-random-uuid");
	});

	it("does not flag the sanctioned UUIDv7 mint", () => {
		expect(
			lint(
				`import { uuidGenerateId } from "@ingram-tech/nk-db/id";\nexport const id = uuidGenerateId();`,
			),
		).toBe("");
	});

	it("does not flag a local crypto that shadows the global", () => {
		expect(
			lint(
				`const crypto = { randomUUID: () => "stub" };\nexport const id = crypto.randomUUID();`,
			),
		).toBe("");
	});

	it("does not flag other members of the global", () => {
		expect(
			lint(`export const bytes = crypto.getRandomValues(new Uint8Array(16));`),
		).toBe("");
	});

	it("does not flag a same-named method on another object", () => {
		expect(
			lint(
				`declare const stub: { randomUUID(): string };\nexport const id = stub.randomUUID();`,
			),
		).toBe("");
	});

	it("respects a justified disable comment", () => {
		expect(
			lint(
				`// oxlint-disable-next-line nextkit/no-crypto-random-uuid -- CSRF nonce, wants v4 entropy\nexport const state = crypto.randomUUID();`,
			),
		).toBe("");
	});
});
