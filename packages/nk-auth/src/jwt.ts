import type { JwtOptions } from "better-auth/plugins/jwt";
import { createRemoteJWKSet, type JWTPayload, jwtVerify } from "jose";

/**
 * `jwt` plugin presets. Two shapes, because Ingram sites mint JWTs for two
 * different audiences:
 *
 *   - `rlsJwtOptions` — a Supabase RLS bridge token (`role: "authenticated"`),
 *     so PostgREST's `auth.uid()` keeps working. See docs/better-auth-migration.md.
 *   - `backendJwtOptions` — a short-lived token for a site's OWN backend API
 *     (a specific `audience`), typically carrying extra claims the site adds via
 *     `auth.api.signJWT`.
 *
 * Both default to EdDSA (Better Auth's default), exposed at `/api/auth/jwks`.
 */

/** Supabase RLS bridge: mints `sub` = user id, `role`/`aud` = "authenticated". */
export const rlsJwtOptions: JwtOptions = {
	jwks: { keyPairConfig: { alg: "EdDSA" } },
	jwt: {
		definePayload: ({ user }) => ({
			sub: user.id,
			role: "authenticated",
			aud: "authenticated",
		}),
	},
};

export interface BackendJwtConfig {
	/** Expected audience of the site's backend, e.g. "ingram-wiki-backend". */
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

/**
 * Verify a Better-Auth-minted backend JWT (EdDSA) against the issuer's JWKS.
 * For use by the backend that consumes `backendJwtOptions` tokens. Throws on an
 * invalid/expired token or audience/issuer mismatch; returns the claims.
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
	const { payload } = await jwtVerify(params.token, jwks, {
		audience: params.audience,
		issuer: params.issuer,
		algorithms: ["EdDSA"],
	});
	return payload;
};
