import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { authEnv, isConfigured } from "./keys.js";

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
