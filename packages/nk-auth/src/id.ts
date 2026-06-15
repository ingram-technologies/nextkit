import { randomBytes } from "node:crypto";

/**
 * The Ingram id codec — a UUIDv7 and its base58 skin. Dependency-light on
 * purpose (only `node:crypto`), so a site can import it without pulling the
 * bcrypt / passkey machinery in `./options`: `@ingram-tech/nk-auth/id`.
 *
 * The Python twin lives in cloud.ingram.tech's `v1/core.py` (`new_id`); the
 * byte → string vectors in `id.test.ts` and that repo's `tests/test_ids.py` are
 * kept identical, so a Better-Auth id (stored as a hyphenated UUIDv7 by
 * {@link uuidGenerateId}) and an `agt_`/`smt_` id from the API are the same
 * encoding of the same 16 bytes.
 *
 * The split is deliberate: keep storing the hyphenated UUIDv7 at rest (so
 * Supabase `auth.uid()::uuid` / uuid columns keep working) and use
 * {@link toPrefixedId} to skin it as a prefixed base58 id for the wire / display,
 * {@link fromPrefixedId} to recover it. {@link base58Id} mints a fresh one
 * directly, for text-id sites that want API-style ids natively.
 */

/**
 * `advanced.database.generateId` for Better Auth — mints a **UUIDv7** (RFC 9562):
 * a 48-bit Unix-ms timestamp prefix + random tail, version `7`, variant `10`.
 * Keeps ids UUID-shaped (Supabase `auth.uid()::uuid`) while staying time-ordered
 * for index locality. Node/Bun's `randomUUID` is v4-only, so we lay the bytes out
 * by hand.
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
	return bytesToUuid(bytes);
};

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
// ceil(128 / log2(58)): a 16-byte value never needs more than 22 digits. We
// left-pad to it so every body is uniform width and sorts lexically ==
// chronologically (UUIDv7's ms-timestamp prefix lives in the high bytes).
const WIDTH = 22;

/** Big-endian base58 (Bitcoin alphabet) of 16 bytes, left-padded to `WIDTH`. */
function encode58(bytes: Uint8Array): string {
	let n = 0n;
	for (const b of bytes) n = (n << 8n) | BigInt(b);
	let out = "";
	while (n > 0n) {
		out = B58.charAt(Number(n % 58n)) + out;
		n /= 58n;
	}
	return out.padStart(WIDTH, B58.charAt(0));
}

/** Inverse of {@link encode58}: a base58 body back to 16 bytes. */
function decode58(body: string): Uint8Array {
	let n = 0n;
	for (const ch of body) {
		const v = B58.indexOf(ch);
		if (v < 0) throw new Error(`invalid base58 char: ${ch}`);
		n = n * 58n + BigInt(v);
	}
	const bytes = new Uint8Array(16);
	for (let i = 15; i >= 0; i--) {
		bytes[i] = Number(n & 0xffn);
		n >>= 8n;
	}
	return bytes;
}

/** A hyphenated UUID string → its 16 raw bytes. */
function uuidToBytes(uuid: string): Uint8Array {
	const hex = uuid.replace(/-/g, "");
	if (!/^[0-9a-fA-F]{32}$/.test(hex)) throw new Error(`not a uuid: ${uuid}`);
	const bytes = new Uint8Array(16);
	for (let i = 0; i < 16; i++) {
		bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
	}
	return bytes;
}

/** 16 raw bytes → a canonical hyphenated UUID string. */
function bytesToUuid(bytes: Uint8Array): string {
	const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Skin a stored hyphenated UUIDv7 as a prefixed base58 id, e.g. `team_…`. */
export function toPrefixedId(uuid: string, prefix: string): string {
	return `${prefix}_${encode58(uuidToBytes(uuid))}`;
}

/** Inverse of {@link toPrefixedId}: recover the hyphenated UUIDv7. */
export function fromPrefixedId(id: string): string {
	const body = id.slice(id.indexOf("_") + 1);
	return bytesToUuid(decode58(body));
}

/** Mint a fresh prefixed base58 id (UUIDv7 core), for text-id sites / API parity. */
export function base58Id(prefix: string): string {
	return toPrefixedId(uuidGenerateId(), prefix);
}
