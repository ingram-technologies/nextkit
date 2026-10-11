/**
 * The migration chain this package ships, as data: each `migrations/*.sql`
 * file's tag and the sha256 nk-db's runner records for it.
 *
 * The per-request chain check runs inside the site's server bundle, where the
 * package's files are not reliably on disk: Next rewrites `require.resolve`
 * to a numeric module id, so resolving `migrations/` there made every session
 * read throw. Carrying the chain in code keeps the check off the filesystem.
 * `chain.test.ts` fails if this list drifts from `migrations/`, so a new
 * migration must be added here in the same change.
 */
export const SHIPPED_AUTH_CHAIN: ReadonlyArray<{ tag: string; hash: string }> = [
	{
		tag: "0001_better_auth",
		hash: "5f44f3294805908dc7a946ac4fb2032d868da5f04e98f496ddfe76e8c0f8cddc",
	},
	{
		tag: "0002_better_auth_1_7",
		hash: "fa64a63e86ea862aff393fef6ecc705fb478d10c7bfc9e390ed475fa990aedea",
	},
	{
		tag: "0003_better_auth_1_7_3",
		hash: "45152bfe9401ace12ac860ccfc4ae49b6a3ab69cf2460947a964c5f231aa4919",
	},
];
