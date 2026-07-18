import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

const setup = (source) => {
	const dir = mkdtempSync(join(tmpdir(), "nk-oxlint-usestate-"));
	dirs.push(dir);
	writeFileSync(
		join(dir, ".oxlintrc.json"),
		JSON.stringify({
			jsPlugins: [pluginPath],
			rules: { "nextkit/no-redundant-usestate-type": "error" },
		}),
	);
	const file = join(dir, "fixture.tsx");
	writeFileSync(file, source);
	return { dir, file };
};

// End-to-end through the real oxlint binary.
const lint = (source) => {
	const { dir } = setup(source);
	try {
		execFileSync("oxlint", ["-c", ".oxlintrc.json", "fixture.tsx"], {
			cwd: dir,
			encoding: "utf8",
		});
		return "";
	} catch (error) {
		return String(error.stdout ?? "");
	}
};

const fix = (source) => {
	const { dir, file } = setup(source);
	try {
		execFileSync("oxlint", ["-c", ".oxlintrc.json", "--fix", "fixture.tsx"], {
			cwd: dir,
			encoding: "utf8",
		});
	} catch {
		// oxlint exits non-zero when remaining problems exist; the file is
		// still written with whatever fixes applied.
	}
	return readFileSync(file, "utf8");
};

describe("no-redundant-usestate-type", () => {
	it("flags and fixes a redundant boolean annotation", () => {
		const src = `const [open, setOpen] = useState<boolean>(false);`;
		expect(lint(src)).toContain("no-redundant-usestate-type");
		expect(fix(src)).toBe(`const [open, setOpen] = useState(false);`);
	});

	it("flags and fixes redundant string and number annotations", () => {
		expect(fix(`const [s] = useState<string>("");`)).toBe(
			`const [s] = useState("");`,
		);
		expect(fix(`const [n] = useState<number>(0);`)).toBe(
			`const [n] = useState(0);`,
		);
	});

	it("collapses `T | undefined` with an undefined initial value", () => {
		const src = `const [v, setV] = useState<number | undefined>(undefined);`;
		expect(lint(src)).toContain("no-redundant-usestate-type");
		expect(fix(src)).toBe(`const [v, setV] = useState<number>();`);
	});

	it("does not flag a load-bearing array annotation", () => {
		// useState([]) would infer never[], so the annotation is required.
		expect(lint(`const [xs] = useState<string[]>([]);`)).toBe("");
	});

	it("does not touch null initial values (behavior-preserving only)", () => {
		expect(lint(`const [v] = useState<string | null>(null);`)).toBe("");
	});

	it("does not flag a genuinely needed annotation", () => {
		expect(lint(`const [v] = useState<Widget | undefined>();`)).toBe("");
		expect(lint(`const [n] = useState<number>();`)).toBe("");
	});
});
