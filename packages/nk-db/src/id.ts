/**
 * `@ingram-tech/nk-db/id` — the fleet's id codec, now published standalone as
 * [`id758`](https://github.com/ingram-technologies/id758). This subpath stays
 * as the nextkit-facing entry point: it re-exports the whole `id758` surface
 * plus the names nextkit sites adopted before the extraction, so nothing that
 * imports from here needs to change. New code may import `id758` directly.
 *
 * Like `id758` itself, this module must stay isomorphic (no node-only imports):
 * it is pulled into Drizzle schemas, client components and edge runtimes.
 */
export * from "id758";
import {
	createIdRegistry as createId758Registry,
	decodeId,
	encodeId,
	type IdRegistry,
	mintId,
	uuidv7,
} from "id758";

/**
 * The prefixes every Ingram site uses for the entities Better Auth owns. A
 * session, a bearer token or an RLS claim carries these ids across apps (one
 * suite shares one session), so a site's registry may not choose its own.
 */
export const SHARED_ID_PREFIXES = { user: "usr", organization: "org" } as const;

/**
 * `id758`'s {@link createId758Registry | createIdRegistry}, refusing a registry
 * that maps `user` or `organization` to anything but its
 * {@link SHARED_ID_PREFIXES | shared prefix}.
 */
export function createIdRegistry<const T extends Record<string, string>>(
	prefixes: T,
): IdRegistry<Extract<keyof T, string>> {
	for (const [entity, shared] of Object.entries(SHARED_ID_PREFIXES)) {
		const prefix = Object.hasOwn(prefixes, entity) ? prefixes[entity] : undefined;
		if (prefix !== undefined && prefix !== shared) {
			throw new Error(
				`createIdRegistry: "${entity}" must use the shared prefix "${shared}", not "${prefix}"`,
			);
		}
	}
	return createId758Registry(prefixes);
}

/** @deprecated Use `uuidv7` from `id758`. */
export const uuidGenerateId = uuidv7;
/** @deprecated Use `encodeId` from `id758`. */
export const toPrefixedId = encodeId;
/** @deprecated Use `decodeId` from `id758`. */
export const fromPrefixedId = decodeId;
/** @deprecated Use `mintId` from `id758`. */
export const base58Id = mintId;
