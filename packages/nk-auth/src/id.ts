// The Ingram id codec moved to `@ingram-tech/nk-db/id` — the lowest package in
// the graph — so a site can mint ids without pulling this auth slice. This
// re-export keeps `@ingram-tech/nk-auth/id` (and Better Auth's
// `advanced.database.generateId`, wired in `./options`) working unchanged. For
// the typed prefix registry (`createIdRegistry`), import from `@ingram-tech/nk-db/id`.
export {
	base58Id,
	fromPrefixedId,
	toPrefixedId,
	uuidGenerateId,
} from "@ingram-tech/nk-db/id";
