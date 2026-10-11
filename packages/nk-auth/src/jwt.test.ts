import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createIdRegistry, uuidv7 } from "@ingram-tech/nk-db/id";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { jwt } from "better-auth/plugins/jwt";
import {
	type CryptoKey,
	decodeJwt,
	errors,
	exportJWK,
	generateKeyPair,
	type JWK,
	SignJWT,
} from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type BackendJwtConfig, backendJwtOptions, verifyBackendJwt } from "./jwt.js";

const ids = createIdRegistry({ user: "usr" });

/**
 * A real Better Auth instance with the preset wired in: sign a user up and mint
 * their token through the jwt plugin's own `/token` endpoint, so the claims
 * asserted are the ones Better Auth actually signs.
 */
const mintFor = async (config: BackendJwtConfig) => {
	const db: Record<string, Array<Record<string, unknown>>> = {
		user: [],
		session: [],
		account: [],
		verification: [],
		jwks: [],
	};
	const auth = betterAuth({
		database: memoryAdapter(db),
		secret: "test-secret-that-is-at-least-32-characters",
		baseURL: "http://localhost:3000",
		emailAndPassword: { enabled: true },
		advanced: { database: { generateId: () => uuidv7() } },
		plugins: [jwt(backendJwtOptions(config))],
	});
	const res = await auth.api.signUpEmail({
		body: { email: "a@b.com", password: "correct horse battery", name: "A" },
		asResponse: true,
	});
	const cookie = (res.headers.getSetCookie()[0] ?? "").split(";")[0] ?? "";
	const { token } = await auth.api.getToken({ headers: new Headers({ cookie }) });
	const userId = db.user?.[0]?.id;
	if (typeof userId !== "string") throw new Error("sign-up created no user");
	return { claims: decodeJwt(token), userId };
};

describe("backendJwtOptions", () => {
	it("mints sub and payload id in public form when given the registry helper", async () => {
		const { claims, userId } = await mintFor({
			audience: "api",
			ids: { user: ids.user },
		});
		expect(claims.sub).toBe(ids.user.encode(userId));
		expect(claims.id).toBe(ids.user.encode(userId));
		expect(claims.email).toBe("a@b.com");
		expect(claims.aud).toBe("api");
	});

	it("leaves Better Auth's defaults (raw uuid sub) without a registry", async () => {
		const { claims, userId } = await mintFor({ audience: "api" });
		expect(claims.sub).toBe(userId);
		expect(claims.id).toBe(userId);
	});
});

// --- verifyBackendJwt against a local JWKS endpoint --------------------------

interface SigningKey {
	kid: string;
	alg: string;
	privateKey: CryptoKey;
	jwk: JWK;
}

const signingKey = async (kid: string, alg = "EdDSA"): Promise<SigningKey> => {
	const { publicKey, privateKey } = await generateKeyPair(alg, { extractable: true });
	return { kid, alg, privateKey, jwk: { ...(await exportJWK(publicKey)), kid, alg } };
};

const ISSUER = "https://auth.example.com";
const AUDIENCE = "backend";

const sign = (
	key: SigningKey,
	claims: { aud?: string; iss?: string; exp?: number } = {},
): Promise<string> =>
	new SignJWT({ sub: "u1" })
		.setProtectedHeader({ alg: key.alg, kid: key.kid })
		.setIssuer(claims.iss ?? ISSUER)
		.setAudience(claims.aud ?? AUDIENCE)
		.setIssuedAt()
		.setExpirationTime(claims.exp ?? "15m")
		.sign(key.privateKey);

/** An issuer's JWKS endpoint whose published keys a test can rotate. */
const jwksServer = async () => {
	const state = { keys: [] as JWK[], fetches: 0 };
	const server: Server = createServer((_req, res) => {
		state.fetches += 1;
		res.writeHead(200, { "content-type": "application/json" });
		res.end(JSON.stringify({ keys: state.keys }));
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const { port } = server.address() as AddressInfo;
	return {
		state,
		// A fresh port per test is a fresh URL, so the module's per-URL JWKS and
		// reload-throttle caches never leak between tests.
		jwksUrl: `http://127.0.0.1:${port}/api/auth/jwks`,
		close: () => new Promise<void>((resolve) => server.close(() => resolve())),
	};
};

describe("verifyBackendJwt", () => {
	let close: (() => Promise<void>) | undefined;
	const T0 = new Date("2026-01-01T00:00:00Z").getTime();

	const setup = async () => {
		// Only the clock is faked: the JWKS fetch still needs real sockets.
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(T0);
		const server = await jwksServer();
		close = server.close;
		const verify = (token: string, over: { aud?: string; iss?: string } = {}) =>
			verifyBackendJwt({
				token,
				jwksUrl: server.jwksUrl,
				audience: over.aud ?? AUDIENCE,
				issuer: over.iss ?? ISSUER,
			});
		return { ...server, verify };
	};

	afterEach(async () => {
		vi.useRealTimers();
		await close?.();
		close = undefined;
	});

	it("verifies a token signed with a just-rotated key after one forced JWKS reload", async () => {
		const { state, verify } = await setup();
		const a = await signingKey("a");
		state.keys = [a.jwk];
		await expect(verify(await sign(a))).resolves.toMatchObject({ sub: "u1" });
		expect(state.fetches).toBe(1);

		// Rotation one second later: well inside jose's own 30s refetch cooldown.
		const b = await signingKey("b");
		state.keys = [a.jwk, b.jwk];
		vi.setSystemTime(T0 + 1_000);
		await expect(verify(await sign(b))).resolves.toMatchObject({ sub: "u1" });
		expect(state.fetches).toBe(2);
	});

	it("does not refetch for a second unknown kid inside the reload cooldown", async () => {
		const { state, verify } = await setup();
		const a = await signingKey("a");
		state.keys = [a.jwk];
		await verify(await sign(a));
		// The first unknown kid spends the forced reload…
		vi.setSystemTime(T0 + 1_000);
		await expect(verify(await sign(await signingKey("x")))).rejects.toBeInstanceOf(
			errors.JWKSNoMatchingKey,
		);
		expect(state.fetches).toBe(2);
		// …so another one 10s later is refused without touching the issuer.
		vi.setSystemTime(T0 + 11_000);
		await expect(verify(await sign(await signingKey("y")))).rejects.toBeInstanceOf(
			errors.JWKSNoMatchingKey,
		);
		expect(state.fetches).toBe(2);
	});

	it("rejects a token for another audience or issuer", async () => {
		const { state, verify } = await setup();
		const a = await signingKey("a");
		state.keys = [a.jwk];
		await expect(
			verify(await sign(a, { aud: "someone-else" })),
		).rejects.toBeInstanceOf(errors.JWTClaimValidationFailed);
		await expect(
			verify(await sign(a, { iss: "https://evil.example.com" })),
		).rejects.toBeInstanceOf(errors.JWTClaimValidationFailed);
	});

	it("rejects a non-EdDSA token even when the JWKS publishes its key", async () => {
		const { state, verify } = await setup();
		const es = await signingKey("es", "ES256");
		state.keys = [es.jwk];
		await expect(verify(await sign(es))).rejects.toBeInstanceOf(
			errors.JOSEAlgNotAllowed,
		);
	});

	it("accepts a token a few seconds past exp (clock skew) but not one well past it", async () => {
		const { state, verify } = await setup();
		const a = await signingKey("a");
		state.keys = [a.jwk];
		const nowSec = T0 / 1000;
		// Hand-picked around the documented "a few seconds" of tolerated skew.
		await expect(verify(await sign(a, { exp: nowSec - 2 }))).resolves.toMatchObject(
			{
				sub: "u1",
			},
		);
		await expect(
			verify(await sign(a, { exp: nowSec - 60 })),
		).rejects.toBeInstanceOf(errors.JWTExpired);
	});
});
