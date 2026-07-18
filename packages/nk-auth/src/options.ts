import type { PasskeyOptions } from "@better-auth/passkey";
import bcrypt from "bcrypt";

// `uuidGenerateId` (the `advanced.database.generateId` UUIDv7 generator) and the
// base58 skin now live in the dependency-light `./id` module; re-exported here so
// existing `from "@ingram-tech/nk-auth"` imports keep resolving.
export { uuidGenerateId } from "./id.js";

/**
 * Portable Better Auth building blocks for Ingram sites.
 *
 * Deliberately NOT a `betterAuth()` wrapper: a site assembles its own instance
 * and spreads these presets in. That keeps full plugin type inference at the
 * call site (where `declaration` is off) and respects the prime directive — the
 * site stays plain Better Auth, we just ship the shared config. JWT + org
 * presets live in `./jwt` and `./organization`. See the package README.
 */

/**
 * `emailAndPassword.password` config that hashes/verifies with bcrypt.
 *
 * @deprecated LEGACY SUPPORT ONLY. Do not wire this into a new site. It exists
 * solely so sites with pre-existing **bcrypt** password hashes keep verifying.
 * Better Auth's default is scrypt — new sites should omit this and use that
 * default. Sites still on bcrypt should migrate hashes to scrypt and drop this;
 * see the nk-auth README (§"Migrating bcrypt passwords to scrypt") for the path.
 *
 * NOTE: bcrypt silently truncates the password at **72 bytes**, so two passwords
 * sharing their first 72 bytes verify as equal — even though the password policy
 * allows up to {@link DEFAULT_MAX_PASSWORD_LENGTH} (128) characters. This is a
 * property of bcrypt, not a bug here, and it's deliberately not length-guarded:
 * a guard would break verification of the legacy long-password hashes this
 * preset exists to support (bcrypt already truncated them at hash time). It is
 * one more reason to migrate off bcrypt — scrypt has no such ceiling.
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

/**
 * Derive passkey options from the site's single base URL: `rpID` = the URL's
 * hostname (the WebAuthn effective domain — host only, no scheme or port) and
 * `origin` = the URL itself. This is the common case (one sign-in origin), and
 * it keeps the relying-party id and the registered origin in lockstep so they
 * can't drift. Pass the same value the instance signs sessions for, e.g.:
 *
 *   passkey(passkeyOptionsForBaseUrl(env.baseURL, "Example"))
 *
 * Reach for `makePasskeyOptions` directly when a site spans multiple origins or
 * must register against a parent registrable domain (e.g. rpID "example.com"
 * for an "app.example.com" origin).
 */
export const passkeyOptionsForBaseUrl = (
	baseURL: string,
	rpName: string,
): PasskeyOptions =>
	makePasskeyOptions({
		rpId: new URL(baseURL).hostname,
		rpName,
		origin: baseURL,
	});

/** Send one transactional email (wire to `@ingram-tech/nk-email`'s `sendEmail`). */
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
