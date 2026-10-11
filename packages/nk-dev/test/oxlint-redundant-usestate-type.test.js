import { describe, expect, it } from "vitest";
import { fix as fixRule, lint as lintRule, ruleIds } from "./oxlint-harness.js";

const RULE = "nextkit/no-redundant-usestate-type";
const options = { filename: "fixture.tsx" };
const lint = (source) => lintRule("no-redundant-usestate-type", source, options);
const fix = (source) => fixRule("no-redundant-usestate-type", source, options);

describe("no-redundant-usestate-type", () => {
	it("flags and fixes a redundant boolean annotation", () => {
		const src = `const [open, setOpen] = useState<boolean>(false);`;
		expect(ruleIds(lint(src))).toEqual([RULE]);
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
		expect(ruleIds(lint(src))).toEqual([RULE]);
		expect(fix(src)).toBe(`const [v, setV] = useState<number>();`);
	});

	it("does not flag a load-bearing array annotation", () => {
		// useState([]) would infer never[], so the annotation is required.
		expect(lint(`const [xs] = useState<string[]>([]);`)).toEqual([]);
	});

	it("does not touch null initial values (behavior-preserving only)", () => {
		expect(lint(`const [v] = useState<string | null>(null);`)).toEqual([]);
	});

	it("does not flag a genuinely needed annotation", () => {
		expect(lint(`const [v] = useState<Widget | undefined>();`)).toEqual([]);
		expect(lint(`const [n] = useState<number>();`)).toEqual([]);
	});
});
