import { randomBytes } from "node:crypto";

/**
 * The Ingram id codec — a UUIDv7 and its base58 skin. It lives here in nk-db
 * (the lowest package in the graph) behind the `@ingram-tech/nk-db/id` subpath,
 * so it stays `node:crypto`-only — no `pg` / `drizzle` — and any site can mint
 * ids without pulling a heavier slice.
 *
 * When a service has a non-JS twin of this codec (e.g. a Python API), keep its
 * byte → string vectors identical to the ones in `id.test.ts`, so a stored
 * UUIDv7 and a prefixed base58 id are the same encoding of the same 16 bytes.
 * That cross-impl contract is the most important property of this file — keep
 * the vectors in lockstep.
 *
 * Store the hyphenated UUIDv7 at rest (uuid columns stay native and time-ordered
 * for index locality) and use {@link toPrefixedId} to skin it as a prefixed
 * base58 id for the wire / display, {@link fromPrefixedId} to recover it.
 * {@link base58Id} mints a fresh one directly; {@link createIdRegistry} builds a
 * typed, prefix-validated set of helpers for a project's entities.
 */

/**
 * Mint a **UUIDv7** (RFC 9562): a 48-bit Unix-ms timestamp prefix + random tail,
 * version `7`, variant `10`. UUID-shaped (drops straight into a `uuid` column)
 * while staying time-ordered for index locality. Used as Better Auth's
 * `advanced.database.generateId`. Node/Bun's `randomUUID` is v4-only, so we lay
 * the bytes out by hand.
 */
export const uuidGenerateId = (): Uuid => {
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
	return bytesToUuid(bytes) as Uuid; // mint site
};

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
// ceil(128 / log2(58)): a 16-byte value never needs more than 22 digits. We
// left-pad to it so every body is uniform width and sorts lexically ==
// chronologically (UUIDv7's ms-timestamp prefix lives in the high bytes).
const WIDTH = 22;
// A bare base58 body: 22 chars, Bitcoin alphabet (no 0 / I / O / l).
const BODY = "[1-9A-HJ-NP-Za-km-z]{22}";

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
	// 58^22 slightly exceeds 2^128, so a high-range 22-char body can overflow 16
	// bytes; silently truncating would alias two distinct wire ids to one UUID.
	if (n >= 1n << 128n) throw new Error(`base58 value out of uuid range: ${body}`);
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

declare const ID_BRAND: unique symbol;
declare const UUID_BRAND: unique symbol;

/**
 * A prefixed base58 public id for entity `E` (e.g. `org_…`), branded by entity
 * so ids of different entities — and plain strings — can't be mixed silently. A
 * plain `string` at runtime; the brand is minted by a {@link createIdRegistry}
 * helper and erased on the wire.
 */
export type Id<E extends string> = string & { readonly [ID_BRAND]: E };

/**
 * A hyphenated UUIDv7 at rest, branded distinct from a public {@link Id} so a
 * skinned id can't be fed into a uuid slot (or a uuid into an id slot) by
 * accident. Recovered from an {@link Id} by a registry helper's `decode`.
 */
export type Uuid = string & { readonly [UUID_BRAND]: "Uuid" };

// Any RFC 9562 version (1-8): sites mint v7, but migrated rows are often v4.
const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Whether `value` is a hyphenated uuid — the sanctioned string→{@link Uuid}
 * bless: narrowing through the shape check is never a blind cast. Use at trust
 * boundaries (env/config, external payloads, `crypto.randomUUID()`).
 */
export const isUuid = (value: string | null | undefined): value is Uuid =>
	typeof value === "string" && UUID_RE.test(value);

/** The throwing {@link isUuid}: bless a string you require to be a uuid. */
export function asUuid(value: string): Uuid {
	if (!isUuid(value)) throw new Error(`not a uuid: ${value}`);
	return value;
}

/** Typed helpers for one entity's prefixed ids — built by {@link createIdRegistry}. */
export interface IdHelper<E extends string = string> {
	/** This entity's prefix, e.g. `"agt"` (no trailing underscore). */
	readonly prefix: string;
	/** Mint a fresh prefixed id (new UUIDv7 core). */
	mint(): Id<E>;
	/** Skin a stored hyphenated UUIDv7 as this entity's prefixed id. */
	encode(uuid: string): Id<E>;
	/** Recover the hyphenated UUIDv7; throws if the prefix / shape doesn't match. */
	decode(id: string): Uuid;
	/**
	 * Recover the hyphenated UUIDv7, or `null` if `id` isn't a well-formed
	 * prefixed id for this entity. The throw-free {@link decode}, for validating
	 * untrusted input (a path param, a query string) without a try/catch.
	 */
	decodeOrNull(id: string): Uuid | null;
	/** Whether `id` is a well-formed prefixed id for this entity (narrows to {@link Id}). */
	is(id: string): id is Id<E>;
}

/** The map returned by {@link createIdRegistry}: one {@link IdHelper} per key. */
export type IdRegistry<K extends string> = { [E in K]: IdHelper<E> };

function makeHelper<E extends string>(prefix: string): IdHelper<E> {
	// Prefixes are developer-controlled identifier constants, never user input.
	const matcher = new RegExp(`^${prefix}_${BODY}$`);
	// The brands are erased at runtime; these casts are the sole mint sites.
	return {
		prefix,
		mint: () => base58Id(prefix) as Id<E>,
		encode: (uuid) => toPrefixedId(uuid, prefix) as Id<E>,
		decode: (id) => {
			if (!matcher.test(id)) throw new Error(`not a ${prefix}_ id: ${id}`);
			return fromPrefixedId(id) as Uuid;
		},
		decodeOrNull: (id) => (matcher.test(id) ? (fromPrefixedId(id) as Uuid) : null),
		is: (id): id is Id<E> => matcher.test(id),
	};
}

/**
 * Build a typed, prefix-validated id registry for a project's entities — one
 * place to declare every prefix instead of hand-rolling encode/decode wrappers:
 *
 * ```ts
 * const ids = createIdRegistry({ org: "org", agent: "agt", session: "cs" });
 * ids.org.mint();          // "org_3k9…"
 * ids.org.encode(uuid);    // "org_…"
 * ids.org.decode("org_…"); // uuid — throws on a wrong / missing prefix
 * ids.agent.is(someId);    // boolean
 * ```
 */
export function createIdRegistry<const T extends Record<string, string>>(
	prefixes: T,
): { [K in keyof T]: IdHelper } {
	const reg: Record<string, IdHelper> = {};
	for (const [key, prefix] of Object.entries(prefixes)) {
		reg[key] = makeHelper(prefix);
	}
	return reg as { [K in keyof T]: IdHelper };
}
