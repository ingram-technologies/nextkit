import type { PasskeyOptions } from "@better-auth/passkey";
import type { BetterAuthOptions } from "better-auth";
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

/**
 * Which auth mail is being sent. Switch on this to pick a template — never on
 * `subject`, which is English default copy a site is expected to replace.
 */
export type AuthEmailKind = "verify-email" | "reset-password" | "change-email";

/** The subset of the Better Auth user these callbacks pass through. */
export interface AuthEmailUser {
	id: string;
	email: string;
	name?: string;
}

/** One outgoing auth mail, handed to the site's sender. */
export interface AuthEmailMessage {
	/** Discriminator — pick the template off this. */
	kind: AuthEmailKind;
	/**
	 * Recipient. For `change-email` this is deliberately the user's CURRENT
	 * address: confirming the move from the address that already owns the
	 * account is what stops a hijacked session from walking off with it.
	 */
	to: string;
	/**
	 * Default English subject, for sites that don't localize. Prefer your own
	 * translated copy — see the README.
	 */
	subject: string;
	/** The one-time action link. */
	url: string;
	/** The raw token behind `url`, if you need to build your own link. */
	token: string;
	/** `id` lets you look up a locale/preferences; `name` personalizes copy. */
	user: AuthEmailUser;
	/** `change-email` only: the address the user is moving to. */
	newEmail?: string;
	/** The originating request — `Accept-Language` is a locale source. */
	request?: Request;
}

/** Send one transactional email (wire to `@ingram-tech/nk-email`'s `sendEmail`). */
export type SendEmail = (message: AuthEmailMessage) => Promise<unknown>;

/**
 * Email callbacks for `emailAndPassword.sendResetPassword`,
 * `emailVerification.sendVerificationEmail` and
 * `user.changeEmail.sendChangeEmailConfirmation`, routed through your sender.
 *
 * Spread all three in. Hand-writing them is a trap: `betterAuth()` infers its
 * options generically, so TypeScript does NOT excess-property-check that object
 * literal — a callback under a misremembered name (`sendChangeEmailVerification`
 * is the one people reach for) compiles clean and simply never fires. The
 * `PinnedEmailSenders` assertion below ties these three names to the real Better
 * Auth options, so a rename upstream breaks this build instead of your site.
 */
export const makeEmailSenders = (send: SendEmail) => ({
	sendResetPassword: async (
		{ user, url, token }: { user: AuthEmailUser; url: string; token: string },
		request?: Request,
	): Promise<void> => {
		await send({
			kind: "reset-password",
			to: user.email,
			subject: "Reset your password",
			url,
			token,
			user,
			request,
		});
	},
	sendVerificationEmail: async (
		{ user, url, token }: { user: AuthEmailUser; url: string; token: string },
		request?: Request,
	): Promise<void> => {
		await send({
			kind: "verify-email",
			to: user.email,
			subject: "Verify your email",
			url,
			token,
			user,
			request,
		});
	},
	sendChangeEmailConfirmation: async (
		{
			user,
			newEmail,
			url,
			token,
		}: {
			user: AuthEmailUser;
			newEmail: string;
			url: string;
			token: string;
		},
		request?: Request,
	): Promise<void> => {
		await send({
			kind: "change-email",
			to: user.email, // the CURRENT address — see AuthEmailMessage.to
			subject: "Confirm your email change",
			url,
			token,
			user,
			newEmail,
			request,
		});
	},
});

/**
 * Compile-time pin: each sender above must stay assignable to the Better Auth
 * option slot it is meant to fill, *addressed by that option's real name*.
 *
 * This exists because `betterAuth()` receives its options through a generic, so
 * TypeScript does NOT excess-property-check the object literal a site passes it.
 * A callback under a wrong-but-plausible name — `sendChangeEmailVerification`
 * for `sendChangeEmailConfirmation`, say — therefore compiles cleanly at every
 * call site and simply never fires, which is a silent no-op in production and
 * exactly the bug this pin is here to prevent recurring.
 *
 * Indexing by key is what makes it bite: rename any of the three upstream and
 * `NonNullable<…["theName"]>` stops resolving, breaking this build. It lives in
 * source rather than in a `.test.ts` on purpose — `tsconfig.json` excludes test
 * files, so a type-level assertion in one is never checked by anything.
 */
type PinnedEmailSenders = {
	reset: NonNullable<
		NonNullable<BetterAuthOptions["emailAndPassword"]>["sendResetPassword"]
	>;
	verify: NonNullable<
		NonNullable<BetterAuthOptions["emailVerification"]>["sendVerificationEmail"]
	>;
	change: NonNullable<
		NonNullable<
			NonNullable<BetterAuthOptions["user"]>["changeEmail"]
		>["sendChangeEmailConfirmation"]
	>;
};

const _pinEmailSenders = (send: SendEmail): PinnedEmailSenders => {
	const senders = makeEmailSenders(send);
	return {
		reset: senders.sendResetPassword,
		verify: senders.sendVerificationEmail,
		change: senders.sendChangeEmailConfirmation,
	};
};
void _pinEmailSenders;
