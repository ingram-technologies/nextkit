import { type AnyColumn, sql, type SQL } from "drizzle-orm";
import { customType } from "drizzle-orm/pg-core";
import { decodeAnyId, type Id, type IdHelper } from "./id.js";

/**
 * Drizzle bindings for the id codec (`@ingram-tech/nk-db/id/drizzle`).
 *
 * Deliberately a separate subpath from the package root: this is imported by a
 * site's `schema.ts`, so it pulls only `drizzle-orm` and the (isomorphic) codec
 * — never `pg`, the pool, or the RLS helpers that the root export carries.
 *
 * The invariant these bindings hold: **application code only ever sees public
 * ids**. A column declared with `idColumn` decodes a public id to its raw uuid
 * on the way *into* Postgres and encodes the uuid on the way *out*, so a row
 * read through Drizzle carries `inv_…`, a `where eq(invoices.id, "inv_…")`
 * just works, and nothing above the schema converts by hand. Raw SQL crosses
 * the same boundary with `id758_encode` / `id758_decode` in the query (see
 * `@ingram-tech/nk-db/id/sql`) or with {@link IdColumnBindings.encodedId} /
 * {@link IdColumnBindings.sqlUuid} here.
 */

type IdColumnBindings<K extends string> = {
	/**
	 * A `uuid` column that speaks public ids. Its TypeScript type is the
	 * entity's branded `Id<E>`, so an invoice id can't be handed to an account
	 * column.
	 *
	 * - `toDriver` (insert/update `SET` values **and** WHERE-clause comparison
	 *   values: `eq`, `inArray`, …) decodes the public id to its uuid. Tolerant:
	 *   a raw uuid passes through unchanged, so a value minted by the database
	 *   or by Better Auth's `generateId` still inserts.
	 * - `fromDriver` (every selected value, including `returning()` and the
	 *   relational `db.query`) encodes the uuid, so a read yields `inv_…`.
	 *
	 * `dataType` is unchanged (`uuid`), so this is a TypeScript-only mapping: no
	 * DDL, no migration, and `drizzle-kit generate` reports no schema diff.
	 */
	idColumn: <E extends K>(
		entity: E,
	) => ReturnType<typeof customType<IdColumnConfig<Id<E>>>>;
	/**
	 * A `uuid` column for a **polymorphic** FK — an `entity_id` whose target is
	 * named by a sibling `*_type` column — where no single-entity codec applies.
	 * Decodes a public id of any entity in the registry (ids are
	 * self-describing) on the way in; reads stay raw uuids, because a column
	 * cannot see its sibling to know which prefix to put back. Encode such a
	 * value in the query with {@link IdColumnBindings.encodedId} once the type
	 * is known, or with `entityOf` in code.
	 *
	 * The same blindness means it accepts an id of the *wrong* entity. Where
	 * both halves are in hand, check them (`entityOf(registry, id) ===
	 * expectedType`) before writing, or the row is silently mislabelled.
	 */
	polymorphicIdColumn: ReturnType<typeof customType<IdColumnConfig<string>>>;
	/**
	 * A raw-SQL selection of a uuid column or expression as the entity's public
	 * id, for the queries the column layer cannot reach (a `sql` select, an
	 * aggregate, a polymorphic column whose type this row has resolved):
	 * `db.select({ id: encodedId("invoice", invoices.id) })`. Emits
	 * `id758_encode('inv', …)`, so the database must have the functions
	 * (`@ingram-tech/nk-db/id/sql`).
	 */
	encodedId: <E extends K>(entity: E, column: AnyColumn | SQL) => SQL<Id<E>>;
	/**
	 * Bind an id into raw SQL as a `uuid`. Raw SQL and RPC args bypass the column
	 * layer entirely, so this is the sanctioned binding for them:
	 * `sql\`select f(${sqlUuid(id)})\``. Needs no entity because ids are
	 * self-describing; a raw uuid passes through, and null/undefined binds as
	 * `null::uuid`. Decodes in JS, so it needs nothing installed in the
	 * database — the SQL-side alternative is `id758_decode(${id})`.
	 */
	sqlUuid: (value: string | null | undefined) => SQL;
	/**
	 * Bind a list of ids as a `uuid[]`, for RPCs taking a `uuid[]` arg. Built
	 * element-wise on purpose: pg binds a JS array as `text[]`, and
	 * `text[]::uuid[]` is not a legal direct cast (SQLSTATE 42846).
	 */
	sqlUuidArray: (values: readonly string[]) => SQL;
};

type IdColumnConfig<TData extends string> = { data: TData; driverData: string };

/**
 * Build the Drizzle id bindings for a site's registry:
 *
 * ```ts
 * // ids.ts
 * export const ids = createIdRegistry({ invoice: "inv", account: "acct" });
 * export const { idColumn, polymorphicIdColumn, encodedId, sqlUuid } =
 *   createIdColumns(ids);
 *
 * // schema.ts
 * export const invoices = pgTable("invoices", {
 *   id: idColumn("invoice")().primaryKey(),      // Id<"invoice">, "inv_…" in and out
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
		idColumn: <E extends K>(entity: E) =>
			customType<IdColumnConfig<Id<E>>>({
				dataType: () => "uuid",
				toDriver: (value) =>
					typeof value === "string"
						? (registry[entity].decodeOrNull(value) ?? value)
						: value,
				fromDriver: (value) => registry[entity].encode(value) as Id<E>,
			}),
		polymorphicIdColumn: customType<IdColumnConfig<string>>({
			dataType: () => "uuid",
			toDriver: (value) => (typeof value === "string" ? decodeAny(value) : value),
		}),
		encodedId: <E extends K>(entity: E, column: AnyColumn | SQL) =>
			sql<Id<E>>`id758_encode(${registry[entity].prefix}, ${column})`,
		sqlUuid,
		sqlUuidArray: (values) =>
			sql`array[${sql.join(
				values.map((value) => sqlUuid(value)),
				sql`, `,
			)}]::uuid[]`,
	};
}
