import { cimd } from "@better-auth/cimd";
import { fetchClientMetadataResource } from "@better-auth/cimd/node";
import { mcp } from "@better-auth/mcp";
import {
	oauthProviderAuthServerMetadata,
	oauthProviderOpenIdConfigMetadata,
} from "@better-auth/oauth-provider";
import type { BetterAuthPlugin } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";

type McpOptions = Parameters<typeof mcp>[0];

export interface McpAuthServerOptions extends Omit<McpOptions, "resource"> {
	/** The MCP endpoint's canonical URL. Access tokens are audience-bound to it. */
	resource: string;
	/** Where an unauthenticated authorization is sent to sign in. */
	loginPage: string;
	/** The page that asks the person; it must verify the signed query
	 *  (`verifyOAuthQueryParams`) before trusting anything on it. */
	consentPage: string;
}

/**
 * The site as an MCP authorization server: `@better-auth/mcp` with the Ingram
 * defaults, plus Client ID Metadata Documents and the loopback fix below. Spread
 * the result into `plugins`, next to a `jwt()` plugin, which signs the access
 * tokens so a resource server verifies them against the JWKS alone.
 *
 * Dynamic registration stays on, unauthenticated: MCP has moved to Client ID
 * Metadata Documents, but the clients written before that register themselves
 * with no credential to register with, and refusing them refuses most of today's
 * MCP clients. Registration grants nothing; the consent page is where a person
 * decides.
 *
 * The tables live in nk-auth's chain (0004), so there is nothing to migrate
 * beyond the site's usual `db:migrate`.
 */
export const mcpAuthServer = (options: McpAuthServerOptions) =>
	[
		mcp({
			allowDynamicClientRegistration: true,
			allowUnauthenticatedClientRegistration: true,
			...options,
		}),
		cimd({ fetchClientMetadataResource, metadataProfile: "mcp-2026-07-28" }),
		loopbackClientsAsNative(),
	] as const;

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

const isLoopback = (uri: unknown): boolean => {
	if (typeof uri !== "string") return false;
	try {
		const url = new URL(uri);
		return url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname);
	} catch {
		return false;
	}
};

/**
 * Dynamic registration defaults a client to `web`, as OpenID's DCR spec says,
 * and a web client may not redirect to plain-http localhost. A client that
 * registers only `http://localhost:PORT/...` redirects is by definition a native
 * app on the person's machine (RFC 8252 §7.3), which is what every MCP CLI is,
 * and most of them leave `application_type` out. Saying `native` for them
 * accepts the registration a native app was always going to be allowed.
 */
export const loopbackClientsAsNative = (): BetterAuthPlugin => ({
	id: "nk-mcp-loopback-native",
	hooks: {
		before: [
			{
				matcher: (ctx) => ctx.path === "/oauth2/register",
				handler: createAuthMiddleware(async (ctx) => {
					const body: unknown = ctx.body;
					if (typeof body !== "object" || body === null) return;
					if (
						"application_type" in body &&
						body.application_type !== undefined
					) {
						return;
					}
					const uris =
						"redirect_uris" in body ? body.redirect_uris : undefined;
					if (!Array.isArray(uris) || uris.length === 0) return;
					if (!uris.every(isLoopback)) return;
					return {
						context: { body: { ...body, application_type: "native" } },
					};
				}),
			},
		],
	},
});

type AuthWithDiscovery = Parameters<typeof oauthProviderAuthServerMetadata>[0] &
	Parameters<typeof oauthProviderOpenIdConfigMetadata>[0] & {
		handler: (request: Request) => Promise<Response>;
	};

/**
 * Discovery documents for the origin root, as Next route handlers.
 *
 * nextkit mounts Better Auth at `/auth`, so the issuer has a path, and RFC 8414
 * and OIDC locate an issuer-with-a-path's metadata by *inserting* the
 * well-known segment before it: `/.well-known/oauth-authorization-server/auth`.
 * Nothing under `/auth` can answer there. Mount each one at an optional
 * catch-all, which also answers the bare form older clients ask for:
 *
 *     src/app/.well-known/oauth-authorization-server/[[...path]]/route.ts
 *         export const GET = mcpDiscovery(auth).authorizationServer;
 *     src/app/.well-known/openid-configuration/[[...path]]/route.ts
 *         export const GET = mcpDiscovery(auth).openIdConfiguration;
 *     src/app/.well-known/oauth-protected-resource/[[...path]]/route.ts
 *         export const GET = mcpDiscovery(auth).protectedResource;
 *
 * The last is only for an MCP endpoint served by the same app; a separate
 * resource server publishes its own.
 */
export const mcpDiscovery = (auth: AuthWithDiscovery) => ({
	authorizationServer: oauthProviderAuthServerMetadata(auth),
	openIdConfiguration: oauthProviderOpenIdConfigMetadata(auth),
	protectedResource: (request: Request) => auth.handler(request),
});
