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
