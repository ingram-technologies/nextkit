import { describe, expect, it } from "vitest";
import { isThemeMode, THEME_MODES } from "./modes.js";

describe("isThemeMode", () => {
	it("accepts the three valid modes, and every mode the list offers", () => {
		expect(isThemeMode("light")).toBe(true);
		expect(isThemeMode("dark")).toBe(true);
		expect(isThemeMode("system")).toBe(true);
		// The list and the guard must not drift: a mode a switcher offers has
		// to survive the guard when read back from the cookie.
		expect(THEME_MODES.every(isThemeMode)).toBe(true);
	});

	it("rejects unknown values and undefined", () => {
		expect(isThemeMode("solarized")).toBe(false);
		expect(isThemeMode(undefined)).toBe(false);
	});
});
