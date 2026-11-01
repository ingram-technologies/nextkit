import { fileURLToPath } from "node:url";
import { createTestDb, type TestDb } from "@ingram-tech/nk-db/pglite";
import { betterAuth } from "better-auth";
import { jwt } from "better-auth/plugins/jwt";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mcpAuthServer, mcpDiscovery } from "./mcp.js";

// The preset against the shipped chain, through Better Auth itself: if 0004 and
// the plugins disagree, 1.7.5+'s schema check refuses the first call here.

const MIGRATIONS = fileURLToPath(new URL("../migrations", import.meta.url));
const BASE = "http://localhost:3000";

let db: TestDb;
const makeAuth = (database: TestDb["pool"]) =>
	betterAuth({
		database,
		secret: "s".repeat(32),
		baseURL: BASE,
		basePath: "/auth",
		plugins: [
			jwt(),
			...mcpAuthServer({
				resource: `${BASE}/mcp`,
				loginPage: "/login",
				consentPage: "/consent",
			}),
		],
	});
let auth: ReturnType<typeof makeAuth>;

beforeAll(async () => {
	db = await createTestDb({
		migrate: async () => {},
		dependencyMigrations: [{ folder: MIGRATIONS, table: "__nkauth_migrations" }],
	});
	auth = makeAuth(db.pool);
});

afterAll(async () => {
	await db?.close();
});

const register = async (redirectUris: string[]) => {
	const response = await auth.handler(
		new Request(`${BASE}/auth/oauth2/register`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				client_name: "test",
				redirect_uris: redirectUris,
				token_endpoint_auth_method: "none",
			}),
		}),
	);
	return {
		status: response.status,
		body: (await response.json()) as Record<string, unknown>,
	};
};

describe("mcpAuthServer", () => {
	it("registers a client that redirects only to loopback as native, unauthenticated", async () => {
		const { status, body } = await register(["http://localhost:51234/callback"]);
		expect(status).toBe(201);
		expect(body.application_type).toBe("native");
	});

	it("leaves a client with a real redirect as web", async () => {
		const { status, body } = await register(["https://app.example.com/callback"]);
		expect(status).toBe(201);
		expect(body.application_type).toBe("web");
	});

	it("serves authorization server metadata for the /auth issuer at the origin root", async () => {
		const response = await mcpDiscovery(auth).authorizationServer(
			new Request(`${BASE}/.well-known/oauth-authorization-server/auth`),
		);
		const metadata = (await response.json()) as Record<string, unknown>;
		expect(metadata.issuer).toBe(`${BASE}/auth`);
		expect(metadata.registration_endpoint).toBe(`${BASE}/auth/oauth2/register`);
	});
});
