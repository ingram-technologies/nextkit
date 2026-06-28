import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { dbEnv, getDatabaseUrl, isConfigured } from "./keys.js";

const DB_KEYS = [
	"DATABASE_URL",
	"DATABASE_SSL",
	"DATABASE_CA_CERT",
	"DATABASE_POOL_MAX",
] as const;

describe("connection-string resolution", () => {
	const saved: Record<string, string | undefined> = {};
	beforeEach(() => {
		for (const key of DB_KEYS) {
			saved[key] = process.env[key];
			delete process.env[key];
		}
	});
	afterEach(() => {
		for (const key of DB_KEYS) {
			if (saved[key] === undefined) delete process.env[key];
			else process.env[key] = saved[key];
		}
	});

	it("resolves DATABASE_URL", () => {
		process.env.DATABASE_URL = "a";
		expect(getDatabaseUrl()).toBe("a");
	});

	it("returns undefined when DATABASE_URL is unset", () => {
		expect(getDatabaseUrl()).toBeUndefined();
	});

	it("isConfigured reflects presence", () => {
		expect(isConfigured()).toBe(false);
		process.env.DATABASE_URL = "x";
		expect(isConfigured()).toBe(true);
	});

	it("dbEnv throws a clear error when nothing is set", () => {
		expect(() => dbEnv()).toThrow(/no database connection string/);
	});

	it("dbEnv resolves the full contract", () => {
		process.env.DATABASE_URL = "postgres://x";
		process.env.DATABASE_SSL = "true";
		process.env.DATABASE_CA_CERT = "PEM";
		process.env.DATABASE_POOL_MAX = "5";
		const env = dbEnv();
		expect(env.connectionString).toBe("postgres://x");
		expect(env.ssl).toBe(true);
		expect(env.caCert).toBe("PEM");
		expect(env.poolMax).toBe(5);
	});

	it("tolerates a libpq-style DATABASE_SSL instead of throwing", () => {
		process.env.DATABASE_URL = "postgres://x";
		process.env.DATABASE_SSL = "disable";
		const env = dbEnv();
		expect(env.ssl).toBe(false);
	});
});
