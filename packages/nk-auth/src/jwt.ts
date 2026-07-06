import type { JwtOptions } from "better-auth/plugins/jwt";
import {
	createRemoteJWKSet,
	errors as joseErrors,
	type JWTPayload,
	jwtVerify,
} from "jose";

/**
 * `jwt` plugin preset for a site's OWN backend API: a short-lived token with a
 * specific `audience`, typically carrying extra claims the site adds via
 * `auth.api.signJWT`. Defaults to EdDSA (Better Auth's default), with the JWKS
 * exposed at `/api/auth/jwks` so the backend can verify it (`verifyBackendJwt`).
 */

export interface BackendJwtConfig {
	/** Expected audience of the site's backend, e.g. "my-app-backend". */
	audience: string;
	/** Token lifetime, e.g. "15m". */
	expirationTime?: string;
	/**
	 * Don't auto-attach the JWT to the `set-auth-jwt` response header — set when
	 * the site mints tokens on demand via `auth.api.signJWT` instead.
	 */
	disableSettingJwtHeader?: boolean;
}

/** `jwt` plugin options for a backend-API token (custom audience). */
export const backendJwtOptions = (config: BackendJwtConfig): JwtOptions => ({
	disableSettingJwtHeader: config.disableSettingJwtHeader,
	jwt: {
		audience: config.audience,
		expirationTime: config.expirationTime,
	},
});

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

// Forced-reload throttle (per JWKS URL). The no-matching-key path is reachable
// by anyone who can send a request with a made-up `kid`, and `.reload()`
// deliberately bypasses jose's cooldown — unthrottled, garbage tokens would
// each cost a fresh fetch against the auth origin.
const RELOAD_COOLDOWN_MS = 30_000;
const lastForcedReload = new Map<string, number>();

/**
 * Verify a Better-Auth-minted backend JWT (EdDSA) against the issuer's JWKS.
 * For use by the backend that consumes `backendJwtOptions` tokens. Throws on an
 * invalid/expired token or audience/issuer mismatch; returns the claims.
 *
 * Hardened against Better Auth signing-key rotation: jose's `createRemoteJWKSet`
 * refuses to refetch the JWKS for `cooldownDuration` (30s default) after any
 * fetch, so a token signed with a freshly rotated key whose `kid` isn't yet in
 * the cached set would fail for the *whole* cooldown window — a ~30s burst of
 * auth failures on every request that verifies a token. On a no-matching-key
 * miss we force a single `.reload()` (which bypasses the cooldown) and retry, so
 * a rotation costs one extra fetch instead of a brief outage.
 */
export const verifyBackendJwt = async (params: {
	token: string;
	/** The issuer's JWKS endpoint, e.g. `${BETTER_AUTH_URL}/api/auth/jwks`. */
	jwksUrl: string | URL;
	audience: string;
	issuer: string;
}): Promise<JWTPayload> => {
	const url =
		typeof params.jwksUrl === "string" ? new URL(params.jwksUrl) : params.jwksUrl;
	const cacheKey = url.toString();
	let jwks = jwksCache.get(cacheKey);
	if (!jwks) {
		jwks = createRemoteJWKSet(url);
		jwksCache.set(cacheKey, jwks);
	}
	const options = {
		audience: params.audience,
		issuer: params.issuer,
		algorithms: ["EdDSA"],
		// Tolerate a few seconds of clock skew between the minting and verifying
		// hosts; jose's default of 0 fails legitimate tokens at exp/nbf boundaries.
		clockTolerance: 5,
	};
	try {
		const { payload } = await jwtVerify(params.token, jwks, options);
		return payload;
	} catch (err) {
		if (!(err instanceof joseErrors.JWKSNoMatchingKey)) throw err;
		// `kid` absent from the cached JWKS — almost always a just-rotated signing
		// key. Force a refresh past the cooldown and retry exactly once, at most
		// once per cooldown window so unknown-`kid` garbage can't hammer the
		// issuer.
		const now = Date.now();
		if (now - (lastForcedReload.get(cacheKey) ?? 0) < RELOAD_COOLDOWN_MS) {
			throw err;
		}
		lastForcedReload.set(cacheKey, now);
		await jwks.reload();
		const { payload } = await jwtVerify(params.token, jwks, options);
		return payload;
	}
};
