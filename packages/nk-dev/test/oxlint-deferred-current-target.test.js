import { describe, expect, it } from "vitest";
import { lint as lintRule, ruleIds } from "./oxlint-harness.js";

const RULE = "nextkit/no-deferred-current-target";

const lint = (source) =>
	lintRule("no-deferred-current-target", source, { filename: "fixture.tsx" });

describe("no-deferred-current-target", () => {
	it("flags a read inside a setState updater", () => {
		const out = lint(`
			export const f = (set) => (event) =>
				set((current) => ({ ...current, name: event.currentTarget.value }));
		`);
		expect(ruleIds(out)).toEqual([RULE]);
	});

	it("flags a read inside a setTimeout callback", () => {
		const out = lint(`
			export const f = (event) => {
				setTimeout(() => console.log(event.currentTarget.textContent), 100);
			};
		`);
		expect(ruleIds(out)).toEqual([RULE]);
	});

	it("does not flag a synchronous read in the handler body", () => {
		const out = lint(`
			export const f = (set) => (event) => {
				const name = event.currentTarget.value;
				set((current) => ({ ...current, name }));
			};
		`);
		expect(out).toEqual([]);
	});

	it("does not flag a callback param that shadows the handler's event", () => {
		const out = lint(`
			export const f = (on) => (event) => {
				on((event) => event.currentTarget.value);
			};
		`);
		expect(out).toEqual([]);
	});

	it("does not flag a local declared inside the callback", () => {
		const out = lint(`
			export const f = (event) => {
				setTimeout(() => {
					const event = getSyntheticEvent();
					console.log(event.currentTarget);
				}, 100);
			};
		`);
		expect(out).toEqual([]);
	});
});
