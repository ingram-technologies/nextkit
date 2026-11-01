-- @ingram-tech/nk-auth — OAuth authorization server tables (better-auth 1.7.15).
--
-- The tables `@better-auth/oauth-provider` keeps its clients, resources,
-- tokens and consents in. `@better-auth/mcp` (an MCP authorization server, see
-- the `./mcp` export) and `@better-auth/cimd` run on the same tables and add
-- none. Every site gets them, as every site gets `passkey` and `jwks`: an unused
-- table costs nothing, and the next Better Auth change to these lands once,
-- here, instead of once per site that serves MCP.
--
-- The 1.6 `mcp` and `oidcProvider` plugins kept their grants in
-- `oauthApplication`, `oauthAccessToken` and `oauthConsent`. 1.7 removed both
-- plugins, and two of those names are reused below with a different shape, so
-- `if not exists` would keep the old table and Better Auth's schema check
-- would refuse every auth call. Where the old shape is found (the legacy access
-- token table has an `accessToken` column; the new one has `token`), the three
-- are DROPPED, not translated: they hold only short-lived grants, nothing a
-- person typed, and the new provider cannot read them. Every client that was
-- connected through the old plugin signs in once more. Running this while 1.6
-- code still serves the old plugin breaks that plugin's endpoints until the
-- 1.7 deploy lands; ordinary sign-in is untouched.
--
-- The rest is Better Auth's own `getMigrations` output for a configuration of
-- jwt + passkey + mcp + cimd, made idempotent and schema-qualified, plus the
-- deny-all RLS hardening every table in this chain carries (0001). A site that
-- already created these tables in its own chain no-ops here.
--
-- Append-only: this file is hashed by the runner and must never be edited once
-- shipped. The next better-auth schema change goes in 0005.

do $$
begin
	if exists (
		select 1 from information_schema.columns
		where table_schema = 'public' and table_name = 'oauthAccessToken' and column_name = 'accessToken'
	) then
		drop table "public"."oauthAccessToken";
	end if;
	if exists (
		select 1 from information_schema.columns
		where table_schema = 'public' and table_name = 'oauthConsent' and column_name = 'consentGiven'
	) then
		drop table "public"."oauthConsent";
	end if;
	drop table if exists "public"."oauthApplication";
end $$;
--> statement-breakpoint
create table if not exists "public"."oauthClient" ("id" text not null primary key, "clientId" text not null unique, "clientSecret" text, "clientDiscoveryId" text, "disabled" boolean, "skipConsent" boolean, "enableEndSession" boolean, "subjectType" text, "scopes" jsonb, "clientCredentialsScopes" jsonb, "userId" text references "public"."user" ("id") on delete cascade, "createdAt" timestamptz, "updatedAt" timestamptz, "name" text, "uri" text, "icon" text, "contacts" jsonb, "tos" text, "policy" text, "softwareId" text, "softwareVersion" text, "softwareStatement" text, "redirectUris" jsonb not null, "postLogoutRedirectUris" jsonb, "backchannelLogoutUri" text, "backchannelLogoutSessionRequired" boolean, "tokenEndpointAuthMethod" text, "applicationType" text, "jwks" text, "jwksUri" text, "grantTypes" jsonb, "responseTypes" jsonb, "requirePKCE" boolean, "dpopBoundAccessTokens" boolean, "referenceId" text, "metadata" jsonb);
--> statement-breakpoint
create table if not exists "public"."oauthResource" ("id" text not null primary key, "identifier" text not null unique, "name" text not null, "accessTokenTtl" integer, "refreshTokenTtl" integer, "signingAlgorithm" text, "signingKeyId" text, "allowedScopes" jsonb, "customClaims" jsonb, "dpopBoundAccessTokensRequired" boolean, "disabled" boolean, "createdAt" timestamptz, "updatedAt" timestamptz, "policyVersion" integer, "metadata" jsonb);
--> statement-breakpoint
create table if not exists "public"."oauthClientResource" ("id" text not null primary key, "clientId" text not null references "public"."oauthClient" ("clientId") on delete cascade, "resourceId" text not null references "public"."oauthResource" ("identifier") on delete cascade, "metadata" jsonb, "createdAt" timestamptz);
--> statement-breakpoint
create table if not exists "public"."oauthRefreshToken" ("id" text not null primary key, "token" text not null unique, "clientId" text not null references "public"."oauthClient" ("clientId") on delete cascade, "sessionId" text references "public"."session" ("id") on delete set null, "userId" text not null references "public"."user" ("id") on delete cascade, "referenceId" text, "authorizationCodeId" text, "resources" jsonb, "requestedUserInfoClaims" jsonb, "expiresAt" timestamptz not null, "createdAt" timestamptz not null, "revoked" timestamptz, "rotatedAt" timestamptz, "rotationReplayResponse" text, "rotationReplayExpiresAt" timestamptz, "authTime" timestamptz, "confirmation" jsonb, "scopes" jsonb not null);
--> statement-breakpoint
create table if not exists "public"."oauthAccessToken" ("id" text not null primary key, "token" text not null unique, "clientId" text not null references "public"."oauthClient" ("clientId") on delete cascade, "sessionId" text references "public"."session" ("id") on delete set null, "userId" text references "public"."user" ("id") on delete cascade, "referenceId" text, "authorizationCodeId" text, "resources" jsonb, "requestedUserInfoClaims" jsonb, "refreshId" text references "public"."oauthRefreshToken" ("id") on delete cascade, "expiresAt" timestamptz not null, "createdAt" timestamptz not null, "revoked" timestamptz, "confirmation" jsonb, "scopes" jsonb not null);
--> statement-breakpoint
create table if not exists "public"."oauthConsent" ("id" text not null primary key, "clientId" text not null references "public"."oauthClient" ("clientId") on delete cascade, "userId" text references "public"."user" ("id") on delete cascade, "referenceId" text, "resources" jsonb, "requestedUserInfoClaims" jsonb, "scopes" jsonb not null, "createdAt" timestamptz not null, "updatedAt" timestamptz not null);
--> statement-breakpoint
create table if not exists "public"."oauthClientAssertion" ("id" text not null primary key, "expiresAt" timestamptz not null);
--> statement-breakpoint
create index if not exists "oauthClient_userId_idx" on "public"."oauthClient" ("userId");
--> statement-breakpoint
create index if not exists "oauthClientResource_clientId_idx" on "public"."oauthClientResource" ("clientId");
--> statement-breakpoint
create index if not exists "oauthClientResource_resourceId_idx" on "public"."oauthClientResource" ("resourceId");
--> statement-breakpoint
create index if not exists "oauthRefreshToken_clientId_idx" on "public"."oauthRefreshToken" ("clientId");
--> statement-breakpoint
create index if not exists "oauthRefreshToken_sessionId_idx" on "public"."oauthRefreshToken" ("sessionId");
--> statement-breakpoint
create index if not exists "oauthRefreshToken_userId_idx" on "public"."oauthRefreshToken" ("userId");
--> statement-breakpoint
create index if not exists "oauthRefreshToken_authorizationCodeId_idx" on "public"."oauthRefreshToken" ("authorizationCodeId");
--> statement-breakpoint
create index if not exists "oauthAccessToken_clientId_idx" on "public"."oauthAccessToken" ("clientId");
--> statement-breakpoint
create index if not exists "oauthAccessToken_sessionId_idx" on "public"."oauthAccessToken" ("sessionId");
--> statement-breakpoint
create index if not exists "oauthAccessToken_userId_idx" on "public"."oauthAccessToken" ("userId");
--> statement-breakpoint
create index if not exists "oauthAccessToken_authorizationCodeId_idx" on "public"."oauthAccessToken" ("authorizationCodeId");
--> statement-breakpoint
create index if not exists "oauthAccessToken_refreshId_idx" on "public"."oauthAccessToken" ("refreshId");
--> statement-breakpoint
create index if not exists "oauthConsent_clientId_idx" on "public"."oauthConsent" ("clientId");
--> statement-breakpoint
create index if not exists "oauthConsent_userId_idx" on "public"."oauthConsent" ("userId");
--> statement-breakpoint
create unique index if not exists "oauthClientResource_clientId_resourceId_uidx" on "public"."oauthClientResource" ("clientId", "resourceId");
--> statement-breakpoint
alter table "public"."oauthClient" enable row level security;
--> statement-breakpoint
alter table "public"."oauthResource" enable row level security;
--> statement-breakpoint
alter table "public"."oauthClientResource" enable row level security;
--> statement-breakpoint
alter table "public"."oauthRefreshToken" enable row level security;
--> statement-breakpoint
alter table "public"."oauthAccessToken" enable row level security;
--> statement-breakpoint
alter table "public"."oauthConsent" enable row level security;
--> statement-breakpoint
alter table "public"."oauthClientAssertion" enable row level security;
