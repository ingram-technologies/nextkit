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

	it("isConfigured and getDatabaseUrl reflect DATABASE_URL's presence", () => {
		expect(isConfigured()).toBe(false);
		expect(getDatabaseUrl()).toBeUndefined();
		process.env.DATABASE_URL = "postgres://x";
		expect(isConfigured()).toBe(true);
		expect(getDatabaseUrl()).toBe("postgres://x");
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

	it.each(["0", "-1", "abc", "1.5"])(
		"dbEnv rejects DATABASE_POOL_MAX=%s rather than sizing the pool with it",
		(value) => {
			process.env.DATABASE_URL = "postgres://x";
			process.env.DATABASE_POOL_MAX = value;
			expect(() => dbEnv()).toThrow(/DATABASE_POOL_MAX/);
		},
	);
});
