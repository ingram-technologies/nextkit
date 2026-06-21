import { describe, expect, it } from "vitest";
import {
	currencyForCountry,
	formatAmount,
	resolveCurrencyFromHeaders,
} from "./currency.js";

describe("currencyForCountry", () => {
	it("maps EU/EEA to eur", () => {
		for (const c of ["FR", "de", "NL", "no", "IS"]) {
			expect(currencyForCountry(c)).toBe("eur");
		}
	});
	it("maps other identified countries to usd", () => {
		for (const c of ["US", "gb", "JP", "AU"]) {
			expect(currencyForCountry(c)).toBe("usd");
		}
	});
	it("falls back to the base currency on no signal", () => {
		expect(currencyForCountry(null)).toBe("eur");
		expect(currencyForCountry(undefined)).toBe("eur");
		expect(currencyForCountry("")).toBe("eur");
	});
});

describe("resolveCurrencyFromHeaders", () => {
	it("reads the Vercel geo header", () => {
		const eur = new Headers({ "x-vercel-ip-country": "FR" });
		const usd = new Headers({ "x-vercel-ip-country": "US" });
		expect(resolveCurrencyFromHeaders(eur)).toBe("eur");
		expect(resolveCurrencyFromHeaders(usd)).toBe("usd");
		expect(resolveCurrencyFromHeaders(new Headers())).toBe("eur");
	});
});

describe("formatAmount", () => {
	it("drops .00 on round figures and keeps cents otherwise", () => {
		expect(formatAmount(1000, "usd")).toBe("$10");
		expect(formatAmount(1050, "usd")).toBe("$10.50");
	});
	it("formats eur", () => {
		// en-IE renders the euro sign as a prefix.
		expect(formatAmount(2000, "eur")).toBe("€20");
	});
});
