import { randomUUID } from "node:crypto";
import type { PasskeyOptions } from "@better-auth/passkey";
import bcrypt from "bcrypt";
import type { JwtOptions } from "better-auth/plugins/jwt";

/**
 * Portable Better Auth building blocks for Ingram sites.
 *
 * Deliberately NOT a `betterAuth()` wrapper: a site assembles its own instance
 * in `lib/auth.ts` and spreads these presets in. That keeps full plugin type
 * inference at the call site (where `declaration` is off) and respects the
 * prime directive — the site stays plain Better Auth, we just ship the
 * RLS-preserving config. See docs/better-auth-migration.md.
 *
 * Two invariants these presets carry, both of which silently break RLS if
 * dropped (see docs/better-auth-migration.md):
 *   1. `uuidGenerateId` keeps new-user ids UUID-shaped for `auth.uid()::uuid`.
 *   2. `rlsJwtOptions` mints `role: "authenticated"`, or PostgREST treats every
 *      request as `anon`.
 */

/**
 * `emailAndPassword.password` config. Verifies with bcrypt so passwords
 * migrated from Supabase (bcrypt) keep working — Better Auth defaults to scrypt.
 */
export const bcryptPassword = {
	hash: (password: string): Promise<string> => bcrypt.hash(password, 10),
	verify: ({
		hash,
		password,
	}: {
		hash: string;
		password: string;
	}): Promise<boolean> => bcrypt.compare(password, hash),
};

/** `advanced.database.generateId` — invariant 1. */
export const uuidGenerateId = (): string => randomUUID();

/**
 * `jwt` plugin options — the RLS bridge. Mints an asymmetric token whose claims
 * Supabase accepts as a third-party issuer, so `auth.uid()` returns the user's
 * UUID and every existing policy keeps working. Use as `jwt(rlsJwtOptions)`.
 */
export const rlsJwtOptions: JwtOptions = {
	jwks: { keyPairConfig: { alg: "EdDSA" } },
	jwt: {
		definePayload: ({ user }) => ({
			sub: user.id, // the Supabase UUID
			role: "authenticated", // invariant 2
			aud: "authenticated",
		}),
	},
};

export interface PasskeyConfig {
	/** Relying-party id: the registrable domain, e.g. "example.com". */
	rpId: string;
	/** Relying-party display name. */
	rpName: string;
	/** Expected origin(s), e.g. "https://example.com". */
	origin: string | string[];
}

/** Build `passkey` plugin options. Use as `passkey(makePasskeyOptions(cfg))`. */
export const makePasskeyOptions = (cfg: PasskeyConfig): PasskeyOptions => ({
	rpID: cfg.rpId,
	rpName: cfg.rpName,
	origin: cfg.origin,
});

/** Send one transactional email (wire to `@ingram-tech/email`'s `sendEmail`). */
export type SendEmail = (message: {
	to: string;
	subject: string;
	url: string;
}) => Promise<unknown>;

/**
 * Email callbacks for `emailAndPassword.sendResetPassword` and
 * `emailVerification.sendVerificationEmail`, routed through your sender.
 */
export const makeEmailSenders = (send: SendEmail) => ({
	sendResetPassword: async ({
		user,
		url,
	}: {
		user: { email: string };
		url: string;
	}): Promise<void> => {
		await send({ to: user.email, subject: "Reset your password", url });
	},
	sendVerificationEmail: async ({
		user,
		url,
	}: {
		user: { email: string };
		url: string;
	}): Promise<void> => {
		await send({ to: user.email, subject: "Verify your email", url });
	},
});
