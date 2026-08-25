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

const lint = (source, filename = "fixture.ts") => {
	const dir = mkdtempSync(join(tmpdir(), "nk-oxlint-idcodec-"));
	dirs.push(dir);
	writeFileSync(
		join(dir, ".oxlintrc.json"),
		JSON.stringify({
			jsPlugins: [pluginPath],
			rules: { "nextkit/no-id-codec-in-app-code": "error" },
		}),
	);
	mkdirSync(dirname(join(dir, filename)), { recursive: true });
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

describe("no-id-codec-in-app-code", () => {
	it("flags the bare codec functions imported from id758", () => {
		expect(
			lint(
				`import { decodeId } from "id758";\nexport const u = decodeId("inv_x");`,
			),
		).toContain("no-id-codec-in-app-code");
	});

	it("flags them from the nk-db re-export, deprecated names included", () => {
		expect(
			lint(
				`import { fromPrefixedId } from "@ingram-tech/nk-db/id";\nexport const u = fromPrefixedId("inv_x");`,
			),
		).toContain("no-id-codec-in-app-code");
	});

	it("flags a registry helper's encode / decode / decodeOrNull", () => {
		for (const method of ["encode", "decode", "decodeOrNull"]) {
			expect(
				lint(
					`import { ids } from "@/lib/ids";\nexport const v = ids.invoice.${method}("x");`,
				),
			).toContain(`ids.invoice.${method}()`);
		}
	});

	it("follows the registry under an import alias", () => {
		expect(
			lint(
				`import { ids as reg } from "./ids";\nexport const v = reg.org.decode("x");`,
			),
		).toContain("no-id-codec-in-app-code");
	});

	it("does not flag validation, minting, or the prefix", () => {
		expect(
			lint(
				`import { ids } from "./ids";\nexport const ok = ids.invoice.is("x");\nexport const fresh = ids.invoice.mint();\nexport const p = ids.invoice.prefix;`,
			),
		).toBe("");
	});

	it("does not flag the isomorphic mint or the column bindings", () => {
		expect(
			lint(
				`import { uuidv7, createIdRegistry } from "id758";\nimport { createIdColumns } from "@ingram-tech/nk-db/id/drizzle";\nexport const id = uuidv7();\nexport const ids = createIdRegistry({ a: "a" });\nexport const cols = createIdColumns(ids);`,
			),
		).toBe("");
	});

	it("does not flag a same-named method on another object", () => {
		expect(
			lint(
				`declare const codec: { thing: { decode(s: string): string } };\nexport const v = codec.thing.decode("x");\nexport const bytes = new TextEncoder().encode("x");`,
			),
		).toBe("");
	});

	it("is silent where the boundary is built: ids.ts, schema.ts (tests via the shared oxlintrc override)", () => {
		const source = `import { decodeId } from "id758";\nexport const u = decodeId("inv_x");`;
		expect(lint(source, "lib/ids.ts")).toBe("");
		expect(lint(source, "db/schema.ts")).toBe("");
		expect(lint(source, "id.ts")).toBe("");
	});
});
