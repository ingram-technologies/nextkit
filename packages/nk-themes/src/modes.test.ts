import { describe, expect, it } from "vitest";
import { isThemeMode, THEME_MODES } from "./modes.js";

describe("THEME_MODES", () => {
	it("is exactly light/dark/system in order", () => {
		expect(THEME_MODES).toEqual(["light", "dark", "system"]);
	});
});

describe("isThemeMode", () => {
	it("accepts the three valid modes", () => {
		expect(isThemeMode("light")).toBe(true);
		expect(isThemeMode("dark")).toBe(true);
		expect(isThemeMode("system")).toBe(true);
	});

	it("rejects unknown values and undefined", () => {
		expect(isThemeMode("solarized")).toBe(false);
		expect(isThemeMode(undefined)).toBe(false);
	});
});
