---
"@ingram-tech/nk-auth": minor
---

Better Auth 1.7.15, and the site as an MCP authorization server.

- `0004_oauth_provider` ships the `@better-auth/oauth-provider` tables to every site. Where it finds the 1.6 `mcp` / `oidcProvider` plugin's tables it drops them: every client connected through the old plugin signs in once more. Run `db:migrate` before deploying.
- `@ingram-tech/nk-auth/mcp`: `mcpAuthServer` (`@better-auth/mcp` plus Client ID Metadata Documents, unauthenticated dynamic registration, and loopback clients registered as native) and `mcpDiscovery`, the origin-root discovery handlers an issuer at `/auth` needs.
- `better-auth`, `@better-auth/passkey`, and the new optional peers `@better-auth/mcp`, `@better-auth/oauth-provider` and `@better-auth/cimd` are pinned to 1.7.15.
