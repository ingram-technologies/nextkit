import { describe, expect, it } from "vitest";
import { exitStatus } from "../lib/run.js";

describe("exitStatus", () => {
	// A signal-killed child (OOM, SIGSEGV) reports status null. Reading that as
	// 0 would let a crashed linter pass the CI gate.
	it("treats a signal-killed child as a failure", () => {
		expect(exitStatus({ status: null, signal: "SIGKILL" })).toBe(1);
	});

	it("treats a child with neither status nor signal as a pass", () => {
		expect(exitStatus({ status: null, signal: null })).toBe(0);
	});

	it.each([0, 1, 2, 127])("passes status %i through", (status) => {
		expect(exitStatus({ status, signal: null })).toBe(status);
	});
});
