import { randomBytes } from "node:crypto";
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
 * `uuidGenerateId` keeps new-user ids UUID-shaped (so Supabase `auth.uid()::uuid`
 * keeps working on RLS sites) — and specifically **UUIDv7**: time-ordered, so ids
 * cluster by creation time for index locality instead of scattering like v4. To
 * surface those same ids as prefixed base58 (`team_…`) on the wire/UI without
 * giving up the uuid column, skin them with `toPrefixedId` from `./id`.
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

/**
 * `advanced.database.generateId` — mints a **UUIDv7** (RFC 9562): a 48-bit
 * Unix-ms timestamp prefix + random tail, version `7`, variant `10`. Keeps ids
 * UUID-shaped (Supabase `auth.uid()::uuid`) while staying time-ordered.
 * Node/Bun's `randomUUID` is v4-only, so we lay the bytes out by hand.
 */
export const uuidGenerateId = (): string => {
	const bytes = randomBytes(16);
	const ts = Date.now();
	bytes[0] = Math.floor(ts / 2 ** 40) & 0xff;
	bytes[1] = Math.floor(ts / 2 ** 32) & 0xff;
	bytes[2] = Math.floor(ts / 2 ** 24) & 0xff;
	bytes[3] = Math.floor(ts / 2 ** 16) & 0xff;
	bytes[4] = Math.floor(ts / 2 ** 8) & 0xff;
	bytes[5] = ts & 0xff;
	bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70; // version 7
	bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80; // variant 10
	const hex = bytes.toString("hex");
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
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
