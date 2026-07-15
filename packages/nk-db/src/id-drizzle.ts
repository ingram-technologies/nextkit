import { sql, type SQL } from "drizzle-orm";
import { customType } from "drizzle-orm/pg-core";
import { decodeAnyId, type IdHelper } from "./id.js";

/**
 * Drizzle bindings for the id codec (`@ingram-tech/nk-db/id/drizzle`).
 *
 * Deliberately a separate subpath from the package root: this is imported by a
 * site's `schema.ts`, so it pulls only `drizzle-orm` and the (isomorphic) codec
 * — never `pg`, the pool, or the RLS helpers that the root export carries.
 *
 * The problem it solves: when a site stores raw `uuid` but exposes prefixed
 * public ids (`inv_…`), any id that reaches a query still skinned blows up with
 * `invalid input syntax for type uuid`. Rather than decoding at every call site
 * and hoping none are missed, decode once at the column.
 */

type IdColumnBindings<K extends string> = {
	/**
	 * A `uuid` column that decodes a public, prefixed id to its raw uuid *before*
	 * the value reaches Postgres.
	 *
	 * Drizzle runs `toDriver` on every JS→driver value: insert/update `SET`
	 * values **and** WHERE-clause comparison values (`eq`, `inArray`, …), so
	 * `eq(invoices.id, "inv_…")` is decoded transparently and feeding a skinned id
	 * into a typed query stops being a failure mode.
	 *
	 * `dataType` is unchanged (`uuid`), so this is a TypeScript-only mapping: no
	 * DDL, no migration, and `drizzle-kit generate` reports no schema diff.
	 *
	 * Decode is tolerant — a raw uuid or a non-id sentinel passes through, so
	 * adopting it never regresses a working call site. There is intentionally no
	 * `fromDriver`: reads stay raw uuids. Encoding is the caller's job, because
	 * (unlike decode) it cannot be inferred from the value — see `entityOf`.
	 */
	idColumn: (entity: K) => ReturnType<typeof customType<IdColumnConfig>>;
	/**
	 * A `uuid` column for a **polymorphic** FK — an `entity_id` whose target is
	 * named by a sibling `*_type` column — where no single-entity decoder applies.
	 * Decodes a prefixed id of any entity in the registry (ids are
	 * self-describing).
	 *
	 * A column cannot see its sibling, so this accepts an id of the *wrong*
	 * entity. Where both halves are in hand, check them (`entityOf(registry, id)
	 * === expectedType`) before writing, or the row is silently mislabelled.
	 */
	polymorphicIdColumn: ReturnType<typeof customType<IdColumnConfig>>;
	/**
	 * Bind an id into raw SQL as a `uuid`. Raw SQL and RPC args bypass the column
	 * layer entirely, so this is the sanctioned binding for them:
	 * `sql\`select f(${sqlUuid(id)})\``. Needs no entity because ids are
	 * self-describing; a raw uuid (the common case) passes through, and
	 * null/undefined binds as `null::uuid`.
	 */
	sqlUuid: (value: string | null | undefined) => SQL;
	/**
	 * Bind a list of ids as a `uuid[]`, for RPCs taking a `uuid[]` arg. Built
	 * element-wise on purpose: pg binds a JS array as `text[]`, and
	 * `text[]::uuid[]` is not a legal direct cast (SQLSTATE 42846).
	 */
	sqlUuidArray: (values: readonly string[]) => SQL;
};

type IdColumnConfig = { data: string; driverData: string };

/**
 * Build the Drizzle id bindings for a site's registry:
 *
 * ```ts
 * // ids.ts
 * export const ids = createIdRegistry({ invoice: "inv", account: "acct" });
 * export const { idColumn, polymorphicIdColumn, sqlUuid } = createIdColumns(ids);
 *
 * // schema.ts
 * export const invoices = pgTable("invoices", {
 *   id: idColumn("invoice")().primaryKey(),
 *   account_id: idColumn("account")().notNull(),
 * });
 * ```
 */
export function createIdColumns<K extends string>(
	registry: Record<K, IdHelper>,
): IdColumnBindings<K> {
	const decodeAny = (value: string) => decodeAnyId(registry, value);

	const sqlUuid = (value: string | null | undefined): SQL =>
		sql`${value == null ? null : decodeAny(value)}::uuid`;

	return {
		idColumn: (entity) =>
			customType<IdColumnConfig>({
				dataType: () => "uuid",
				toDriver: (value) =>
					typeof value === "string"
						? (registry[entity].decodeOrNull(value) ?? value)
						: value,
			}),
		polymorphicIdColumn: customType<IdColumnConfig>({
			dataType: () => "uuid",
			toDriver: (value) => (typeof value === "string" ? decodeAny(value) : value),
		}),
		sqlUuid,
		sqlUuidArray: (values) =>
			sql`array[${sql.join(
				values.map((value) => sqlUuid(value)),
				sql`, `,
			)}]::uuid[]`,
	};
}
