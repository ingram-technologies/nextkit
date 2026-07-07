import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { authEnv, authSecret, isConfigured } from "./keys.js";

const VALID = {
	BETTER_AUTH_SECRET: "s".repeat(32),
	BETTER_AUTH_URL: "https://example.com",
	DATABASE_URL: "postgresql://user:pw@db.example.com:5432/postgres",
} as const;

describe("authEnv", () => {
	const original = process.env;

	beforeEach(() => {
		process.env = { ...original, ...VALID };
	});
	afterEach(() => {
		process.env = original;
	});

	it("returns a config-shaped object from valid env", () => {
		expect(authEnv()).toEqual({
			secret: VALID.BETTER_AUTH_SECRET,
			baseURL: VALID.BETTER_AUTH_URL,
			databaseUrl: VALID.DATABASE_URL,
		});
		expect(isConfigured()).toBe(true);
	});

	it("throws listing every missing/invalid var in production", () => {
		process.env = { ...original, NODE_ENV: "production" };
		delete process.env.BETTER_AUTH_SECRET;
		delete process.env.DATABASE_URL;
		process.env.BETTER_AUTH_URL = "not-a-url";
		expect(isConfigured()).toBe(false);
		expect(() => authEnv()).toThrow(/BETTER_AUTH_SECRET/);
		expect(() => authEnv()).toThrow(/BETTER_AUTH_URL/);
		expect(() => authEnv()).toThrow(/DATABASE_URL/);
	});

	it("falls back to a dev placeholder secret outside production", () => {
		process.env = { ...VALID, NODE_ENV: "development" };
		delete process.env.BETTER_AUTH_SECRET;
		expect(isConfigured()).toBe(true);
		expect(authEnv().secret).toMatch(/insecure-placeholder/);
	});

	it("keeps BETTER_AUTH_SECRET required in production", () => {
		process.env = { ...VALID, NODE_ENV: "production" };
		delete process.env.BETTER_AUTH_SECRET;
		expect(isConfigured()).toBe(false);
		expect(() => authEnv()).toThrow(/BETTER_AUTH_SECRET/);
	});
});

describe("authSecret", () => {
	const original = process.env;

	afterEach(() => {
		process.env = original;
	});

	it("returns the configured secret", () => {
		process.env = { ...original, ...VALID };
		expect(authSecret()).toBe(VALID.BETTER_AUTH_SECRET);
	});

	it("falls back to the dev placeholder when unset outside production", () => {
		process.env = { ...original, NODE_ENV: "development" };
		delete process.env.BETTER_AUTH_SECRET;
		expect(authSecret()).toMatch(/insecure-placeholder/);
	});

	it("throws when unset in production", () => {
		process.env = { ...original, NODE_ENV: "production" };
		delete process.env.BETTER_AUTH_SECRET;
		expect(() => authSecret()).toThrow(/BETTER_AUTH_SECRET/);
	});

	it("resolves the secret without requiring BETTER_AUTH_URL or DATABASE_URL", () => {
		// The whole point: a site with its own baseURL / DB wiring takes just the
		// secret. authEnv() would throw here on the two missing vars; authSecret()
		// must not care about them.
		process.env = { ...original, NODE_ENV: "production" };
		process.env.BETTER_AUTH_SECRET = VALID.BETTER_AUTH_SECRET;
		delete process.env.BETTER_AUTH_URL;
		delete process.env.DATABASE_URL;
		expect(authSecret()).toBe(VALID.BETTER_AUTH_SECRET);
		expect(() => authEnv()).toThrow(/BETTER_AUTH_URL/);
	});
});
