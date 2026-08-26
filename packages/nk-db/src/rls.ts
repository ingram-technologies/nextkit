/**
 * Row-Level Security for a **direct Postgres connection** (`pg` / Drizzle).
 *
 * A plain connection runs as the connection's role with **no request claims**, so
 * RLS is either bypassed (privileged role) or denies everything. These helpers
 * scope a transaction the way a JWT-claims RLS setup needs: per transaction they
 * set the `request.jwt.claims` GUC and `SET LOCAL ROLE`, so policies written
 * against `auth.uid()` (i.e. `current_setting('request.jwt.claims') ->> 'sub'`)
 * fire correctly. It is pure Postgres. See `docs/db-package.md` (§RLS).
 *
 * Two requirements the caller owns (documented, not enforceable here):
 *   1. The pool must connect as a role that **does not bypass RLS** for the rows
 *      it touches — i.e. not the table owner and not a `BYPASSRLS` superuser for
 *      user-facing reads. (After `SET ROLE authenticated`, RLS applies even if the
 *      underlying connection is a superuser.)
 *   2. The connecting role must be allowed to `SET ROLE` to the target role
 *      (e.g. `GRANT app_user TO the_connecting_role`).
 */

import { decodeId, prefixOf } from "./id.js";

/**
 * The JWT-style claims to scope a transaction by. `sub` becomes `auth.uid()`;
 * `role` (default `"authenticated"`) is the Postgres role assumed. Any further
 * keys are written into the claims GUC for policies that read them
 * (`request.jwt.claims ->> 'org_id'`, etc.).
 */
export interface RlsClaims {
	/**
	 * The user id. Becomes the `sub` claim → `auth.uid()`. Either form: a public
	 * id (`usr_…`) is decoded to its uuid before it reaches the database (see
	 * {@link decodeIdClaims}), so `auth.uid()::uuid` policies hold.
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
/** The GUC `auth.uid()` / `auth.role()` policies read claims from. */
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
	claimsJson: JSON.stringify(decodeIdClaims(claims)),
});

/**
 * The claims as the database expects them: every string claim that is a
 * public, prefixed id (`usr_…`, `org_…`) is decoded to its uuid, so a policy
 * written as `user_id = auth.uid()` keeps working when the app passes the
 * public form — which it does once session ids come through nk-auth's
 * helpers with a registry. A public id is self-describing, so no registry is
 * needed here; a raw uuid or any other string passes through unchanged. This
 * is the database boundary doing the conversion, the same rule as `idColumn`.
 */
export const decodeIdClaims = (claims: RlsClaims): RlsClaims => {
	const out: RlsClaims = { ...claims };
	for (const [key, value] of Object.entries(claims)) {
		if (typeof value === "string" && prefixOf(value) !== null) {
			out[key] = decodeId(value);
		}
	}
	return out;
};

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
