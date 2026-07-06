import { describe, expect, it } from "vitest";
import { createPool, normalizeCaCert } from "./pool.js";

const ESCAPED =
	"-----BEGIN CERTIFICATE-----\\nMIIAbc\\nDEF==\\n-----END CERTIFICATE-----\\n";
const REAL = "-----BEGIN CERTIFICATE-----\nMIIAbc\nDEF==\n-----END CERTIFICATE-----\n";

describe("normalizeCaCert", () => {
	it("un-escapes literal \\n (the `vercel env pull` / dotenv form) to real newlines", () => {
		expect(normalizeCaCert(ESCAPED)).toBe(REAL);
	});

	it("leaves an already-newlined PEM untouched (idempotent)", () => {
		expect(normalizeCaCert(REAL)).toBe(REAL);
		expect(normalizeCaCert(normalizeCaCert(ESCAPED))).toBe(REAL);
	});

	it("passes undefined through", () => {
		expect(normalizeCaCert(undefined)).toBeUndefined();
	});
});

describe("createPool ssl wiring", () => {
	it("hands `pg` a verify-full cert with real newlines even from the escaped form", async () => {
		const pool = createPool({
			connectionString: "postgres://u:p@db.example.com:5432/app",
			caCert: ESCAPED,
		});
		// pg stores constructor options; the pool is lazy (no connection yet).
		const ssl = pool.options.ssl as { ca?: string; rejectUnauthorized?: boolean };
		expect(ssl.rejectUnauthorized).toBe(true);
		expect(ssl.ca).toBe(REAL);
		expect(ssl.ca).not.toContain("\\n");
		await pool.end();
	});
});

describe("createPool local-socket precedence", () => {
	it("caps a local pool at max 1 even when DATABASE_POOL_MAX says otherwise", async () => {
		process.env.DATABASE_URL =
			"postgresql://postgres:postgres@127.0.0.1:5432/postgres";
		process.env.DATABASE_POOL_MAX = "5";
		try {
			const pool = createPool();
			expect(pool.options.max).toBe(1);
			await pool.end();
		} finally {
			delete process.env.DATABASE_URL;
			delete process.env.DATABASE_POOL_MAX;
		}
	});

	it("does not enable TLS against a local socket even when a CA cert is set", async () => {
		const pool = createPool({
			connectionString: "postgresql://postgres:postgres@localhost:5432/postgres",
			caCert: REAL,
		});
		expect(pool.options.ssl).toBeUndefined();
		expect(pool.options.max).toBe(1);
		await pool.end();
	});

	it("does not misclassify a remote URL whose password mentions localhost", async () => {
		const pool = createPool({
			connectionString: "postgres://u:localhost@db.example.com:5432/app",
		});
		// pg fills its own default (10) when we don't force the local max:1.
		expect(pool.options.max).not.toBe(1);
		await pool.end();
	});
});
