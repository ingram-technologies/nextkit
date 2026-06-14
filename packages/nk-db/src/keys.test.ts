import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { dbEnv, getDatabaseUrl, isConfigured } from "./keys";

const DB_KEYS = [
	"DATABASE_URL",
	"POSTGRES_URL_NON_POOLING",
	"POSTGRES_URL",
	"DATABASE_SSL",
	"DATABASE_CA_CERT",
	"DATABASE_POOL_MAX",
] as const;

describe("connection-string precedence", () => {
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

	it("prefers DATABASE_URL over the Supabase fallbacks", () => {
		process.env.DATABASE_URL = "a";
		process.env.POSTGRES_URL_NON_POOLING = "b";
		process.env.POSTGRES_URL = "c";
		expect(getDatabaseUrl()).toBe("a");
	});

	it("falls back to POSTGRES_URL_NON_POOLING, then POSTGRES_URL", () => {
		process.env.POSTGRES_URL_NON_POOLING = "b";
		process.env.POSTGRES_URL = "c";
		expect(getDatabaseUrl()).toBe("b");
		delete process.env.POSTGRES_URL_NON_POOLING;
		expect(getDatabaseUrl()).toBe("c");
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
});
