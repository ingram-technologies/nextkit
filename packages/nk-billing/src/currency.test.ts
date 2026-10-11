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
	const SYMBOL = { usd: "$", eur: "€" } as const;

	it.each([
		[1000, "usd"],
		[2000, "eur"],
		[0, "usd"],
	] as const)("drops the fraction on a round %i %s", (minor, currency) => {
		const out = formatAmount(minor, currency);
		expect(out).toContain(SYMBOL[currency]);
		expect(out).not.toMatch(/\d[.,]\d/);
		expect(out.replace(/\D/g, "")).toBe(String(minor / 100));
	});

	it.each([
		[1050, "usd"],
		[1999, "eur"],
		[5, "eur"],
	] as const)("keeps two fraction digits on %i %s", (minor, currency) => {
		const out = formatAmount(minor, currency);
		expect(out).toContain(SYMBOL[currency]);
		expect(out).toMatch(/\d[.,]\d{2}(?!\d)/);
		expect(Number(out.replace(/\D/g, ""))).toBe(minor);
	});
});
