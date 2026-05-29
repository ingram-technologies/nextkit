import { randomUUID } from "node:crypto";
import type { PasskeyOptions } from "@better-auth/passkey";
import bcrypt from "bcrypt";

/**
 * Portable Better Auth building blocks for Ingram sites.
 *
 * Deliberately NOT a `betterAuth()` wrapper: a site assembles its own instance
 * and spreads these presets in. That keeps full plugin type inference at the
 * call site (where `declaration` is off) and respects the prime directive — the
 * site stays plain Better Auth, we just ship the shared config. JWT + org
 * presets live in `./jwt` and `./organization`. See docs/better-auth-migration.md.
 *
 * `uuidGenerateId` keeps new-user ids UUID-shaped (needed for Supabase
 * `auth.uid()::uuid` on RLS sites).
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

/** `advanced.database.generateId` — keeps new-user ids UUID-shaped. */
export const uuidGenerateId = (): string => randomUUID();

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
