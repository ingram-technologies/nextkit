/**
 * Row-Level Security for a **direct Postgres connection** (no PostgREST).
 *
 * On Supabase, PostgREST is what made RLS work: per request it did
 * `SET ROLE authenticated` and set `request.jwt.claims` from the user's JWT, so
 * policies written against `auth.uid()` fired. The moment a site queries Postgres
 * directly (`pg` / Drizzle) — whether it's still on Supabase Postgres or has
 * moved to our DigitalOcean cluster — that setup is gone, and a plain connection
 * runs as the connection's role with **no claims**, so RLS is either bypassed
 * (privileged role) or denies everything.
 *
 * These helpers reproduce exactly what PostgREST did, per transaction: set the
 * claims GUC and `SET LOCAL ROLE`, so **existing `auth.uid()` policies keep
 * working unchanged**. It is pure Postgres, so it behaves identically on Supabase
 * and on DO. See `docs/db-package.md` (§RLS) and `docs/better-auth-migration.md`.
 *
 * Two requirements the caller owns (documented, not enforceable here):
 *   1. The pool must connect as a role that **does not bypass RLS** for the rows
 *      it touches — i.e. not the table owner and not a `BYPASSRLS` superuser for
 *      user-facing reads. (After `SET ROLE authenticated`, RLS applies even if the
 *      underlying connection is `postgres`, exactly as PostgREST relied on.)
 *   2. The connecting role must be allowed to `SET ROLE` to the target role
 *      (Supabase's `authenticator`/`postgres` can; on DO, `GRANT app_user TO …`).
 */

/**
 * The JWT-style claims to scope a transaction by. `sub` becomes `auth.uid()`;
 * `role` (default `"authenticated"`) is the Postgres role assumed. Any further
 * keys are written into the claims GUC for policies that read them
 * (`request.jwt.claims ->> 'org_id'`, etc.).
 */
export interface RlsClaims {
	/**
	 * The user id. Becomes the `sub` claim → `auth.uid()`. For Supabase-style
	 * policies that cast `sub` to `uuid`, this MUST be a valid UUID.
	 */
	sub: string;
	/** The Postgres role to assume (the JWT `role` claim). Defaults to `"authenticated"`. */
	role?: string;
	/** Any further claims your policies read from `request.jwt.claims`. */
	[claim: string]: unknown;
}

/** Overrides for {@link resolveRlsConfig} (and the helpers that build on it). */
export interface RlsOptions {
	/**
	 * Force the Postgres role to `SET LOCAL`, ignoring `claims.role`. Use when the
	 * DB role name differs from the JWT `role` claim (e.g. a dedicated `app_user`
	 * on DO while the claim stays `"authenticated"`).
	 */
	role?: string;
	/** The GUC the claims JSON is written to. Defaults to `"request.jwt.claims"`. */
	claimsSetting?: string;
}

/** The role assumed when neither `options.role` nor `claims.role` is set. */
export const RLS_DEFAULT_ROLE = "authenticated";
/** The GUC `auth.uid()` / `auth.role()` read; what PostgREST populated. */
export const RLS_CLAIMS_SETTING = "request.jwt.claims";

/** The concrete values a transaction is scoped with. */
export interface ResolvedRlsConfig {
	/** Postgres role to assume for the transaction. */
	role: string;
	/** GUC the claims JSON is written to. */
	claimsSetting: string;
	/** The claims serialized for `set_config` (a JSON string). */
	claimsJson: string;
}

/** Resolve claims + options into the role, GUC name, and serialized claims. */
export const resolveRlsConfig = (
	claims: RlsClaims,
	options: RlsOptions = {},
): ResolvedRlsConfig => ({
	role: options.role ?? claims.role ?? RLS_DEFAULT_ROLE,
	claimsSetting: options.claimsSetting ?? RLS_CLAIMS_SETTING,
	claimsJson: JSON.stringify(claims),
});

/**
 * The single parameterized statement that scopes a transaction: writes the
 * claims GUC and the `role` GUC, **both transaction-local** (`is_local = true`,
 * so they reset at `commit`/`rollback` and never leak across pooled
 * connections). Everything — including the GUC name and role — is bound, never
 * interpolated, so it's injection-safe.
 *
 * Exposed for callers that manage their own connection/transaction (e.g. a
 * framework middleware): run it as the first statement after `begin`.
 */
export const rlsPreamble = (
	config: ResolvedRlsConfig,
): { text: string; values: string[] } => ({
	text: "select set_config($1, $2, true), set_config('role', $3, true)",
	values: [config.claimsSetting, config.claimsJson, config.role],
});
