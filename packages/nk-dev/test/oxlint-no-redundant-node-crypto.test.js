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
	const dir = mkdtempSync(join(tmpdir(), "nk-oxlint-node-crypto-"));
	dirs.push(dir);
	writeFileSync(
		join(dir, ".oxlintrc.json"),
		JSON.stringify({
			jsPlugins: [pluginPath],
			rules: { "nextkit/no-redundant-node-crypto": "error" },
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

describe("no-redundant-node-crypto", () => {
	for (const name of ["randomUUID", "getRandomValues", "subtle", "webcrypto"]) {
		it(`flags ${name} imported from node:crypto`, () => {
			expect(lint(`import { ${name} } from "node:crypto";\n`)).toContain(
				"no-redundant-node-crypto",
			);
		});
	}

	it("flags the unprefixed module too", () => {
		expect(lint(`import { randomUUID } from "crypto";\n`)).toContain(
			"no-redundant-node-crypto",
		);
	});

	it("names the global to reach for instead", () => {
		expect(lint(`import { subtle } from "node:crypto";\n`)).toContain(
			"crypto.subtle",
		);
	});

	it("flags a redundant name alongside a legitimate one", () => {
		const output = lint(
			`import { createHash, randomUUID } from "node:crypto";\nexport const h = createHash("sha256");\nexport const id = randomUUID();\n`,
		);
		expect(output).toContain("no-redundant-node-crypto");
		// The report is on the specifier, not the whole import — createHash has no
		// global equivalent and must stay.
		expect(output).not.toContain("createHash` from");
	});

	it("flags a member access through a namespace import", () => {
		expect(
			lint(
				`import * as nodeCrypto from "node:crypto";\nexport const id = nodeCrypto.randomUUID();\n`,
			),
		).toContain("no-redundant-node-crypto");
	});

	it("flags a member access through a default import", () => {
		expect(
			lint(
				`import nodeCrypto from "node:crypto";\nexport const id = nodeCrypto.randomUUID();\n`,
			),
		).toContain("no-redundant-node-crypto");
	});

	it("does not flag node:crypto exports with no global equivalent", () => {
		expect(
			lint(
				`import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";\n`,
			),
		).toBe("");
	});

	it("does not flag other members of a namespace import", () => {
		expect(
			lint(
				`import * as nodeCrypto from "node:crypto";\nexport const h = nodeCrypto.createHash("sha256");\n`,
			),
		).toBe("");
	});

	it("does not flag the global it is asking for", () => {
		expect(lint(`export const id = crypto.randomUUID();\n`)).toBe("");
	});

	it("does not flag a same-named import from another module", () => {
		expect(lint(`import { subtle } from "./theme";\n`)).toBe("");
	});

	it("respects a justified disable comment", () => {
		expect(
			lint(
				`// oxlint-disable-next-line nextkit/no-redundant-node-crypto -- needs disableEntropyCache\nimport { randomUUID } from "node:crypto";\n`,
			),
		).toBe("");
	});
});
