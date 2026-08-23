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
import { decodeId, encodeId, mintId, uuidv7 } from "id758";

/** @deprecated Use `uuidv7` from `id758`. */
export const uuidGenerateId = uuidv7;
/** @deprecated Use `encodeId` from `id758`. */
export const toPrefixedId = encodeId;
/** @deprecated Use `decodeId` from `id758`. */
export const fromPrefixedId = decodeId;
/** @deprecated Use `mintId` from `id758`. */
export const base58Id = mintId;
