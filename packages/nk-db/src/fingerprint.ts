// Catalog-level schema fingerprint: the squash / baseline equivalence gate.
//
// A normalized JSON view of everything a schema is made of, including what
// drizzle's snapshot cannot model (functions, triggers, grants, policies,
// ownership, DEFERRABLE clauses, roles), so two databases can be diffed
// structurally. Two sources: a fresh in-memory PGlite booted from a migration
// chain, or a live database. Diff set-wise per key, never positionally:
// identifier collation differs between PGlite and a server, so a textual diff
// is sort noise.
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import type { Pool } from "pg";
import { createPool, type CreatePoolConfig } from "./pool.js";

export interface FingerprintScope {
	/** Schemas to cover. Default `["public"]`. */
	schemas?: string[];
	/**
	 * Roles whose ownership and grants matter (the app's RLS roles, a view
	 * owner). Ownership and ACL entries of other roles are ignored, because the
	 * migration role differs per environment.
	 */
	roles?: string[];
}

export type Fingerprint = Record<string, unknown[]>;

const DEFAULT_SCHEMAS = ["public"];
const DEFAULT_ROLES = ["anon", "authenticated", "service_role", "authenticator"];

const quoteList = (values: string[]): string =>
	`in (${values.map((v) => `'${v.replace(/'/g, "''")}'`).join(",")})`;

/** The catalog queries, each returning one json value via json_agg with explicit ordering. */
export const fingerprintQueries = (
	scope: FingerprintScope = {},
): Record<string, string> => {
	const inSchemas = quoteList(scope.schemas ?? DEFAULT_SCHEMAS);
	const inRoles = quoteList(scope.roles ?? DEFAULT_ROLES);
	return {
		schemas: `select coalesce(json_agg(s order by s.nspname), '[]') from (
			select n.nspname, pg_get_userbyid(n.nspowner) as owner,
				coalesce((select json_agg(x order by x) from unnest(n.nspacl::text[]) x), '[]'::json) as acl
			from pg_namespace n where n.nspname ${inSchemas}) s`,
		relowners: `select coalesce(json_agg(o order by o.rel), '[]') from (
			select n.nspname || '.' || cl.relname as rel, cl.relkind::text as kind,
				pg_get_userbyid(cl.relowner) as owner, coalesce(cl.reloptions::text, '') as options
			from pg_class cl join pg_namespace n on n.oid = cl.relnamespace
			where n.nspname ${inSchemas} and cl.relkind in ('r','p','v','m')
				and pg_get_userbyid(cl.relowner) ${inRoles}) o`,
		roles: `select coalesce(json_agg(r order by r.rolname), '[]') from (
			select rolname, rolsuper, rolinherit, rolcanlogin, rolbypassrls from pg_roles where rolname ${inRoles}) r`,
		enums: `select coalesce(json_agg(e order by e.typname, e.sort), '[]') from (
			select t.typname, en.enumsortorder as sort, en.enumlabel
			from pg_type t join pg_namespace n on n.oid = t.typnamespace join pg_enum en on en.enumtypid = t.oid
			where n.nspname ${inSchemas}) e`,
		columns: `select coalesce(json_agg(c order by c.rel, c.col), '[]') from (
			select n.nspname || '.' || cl.relname as rel, a.attname as col,
				format_type(a.atttypid, a.atttypmod) as type, a.attnotnull as notnull,
				pg_get_expr(d.adbin, d.adrelid) as default, a.attidentity as identity, a.attgenerated as generated
			from pg_attribute a join pg_class cl on cl.oid = a.attrelid join pg_namespace n on n.oid = cl.relnamespace
			left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
			where n.nspname ${inSchemas} and cl.relkind in ('r','p') and a.attnum > 0 and not a.attisdropped) c`,
		constraints: `select coalesce(json_agg(c order by c.rel, c.name), '[]') from (
			select co.conrelid::regclass::text as rel, co.conname as name, pg_get_constraintdef(co.oid) as def
			from pg_constraint co join pg_namespace n on n.oid = co.connamespace where n.nspname ${inSchemas}) c`,
		indexes: `select coalesce(json_agg(i order by i.indexname), '[]') from (
			select schemaname, tablename, indexname, indexdef from pg_indexes where schemaname ${inSchemas}) i`,
		triggers: `select coalesce(json_agg(t order by t.rel, t.name), '[]') from (
			select tg.tgrelid::regclass::text as rel, tg.tgname as name, pg_get_triggerdef(tg.oid) as def
			from pg_trigger tg join pg_class cl on cl.oid = tg.tgrelid join pg_namespace n on n.oid = cl.relnamespace
			where n.nspname ${inSchemas} and not tg.tgisinternal) t`,
		functions: `select coalesce(json_agg(f order by f.schema, f.name, f.args), '[]') from (
			select n.nspname as schema, p.proname as name, pg_get_function_identity_arguments(p.oid) as args,
				pg_get_functiondef(p.oid) as def
			from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			where n.nspname ${inSchemas} and p.prokind in ('f','p')
				and not exists (select 1 from pg_depend dep where dep.objid = p.oid and dep.deptype = 'e')) f`,
		policies: `select coalesce(json_agg(p order by p.tablename, p.policyname), '[]') from (
			select schemaname, tablename, policyname, permissive, roles::text[] as roles, cmd, qual, with_check
			from pg_policies where schemaname ${inSchemas}) p`,
		rls: `select coalesce(json_agg(r order by r.rel), '[]') from (
			select n.nspname || '.' || cl.relname as rel, cl.relrowsecurity as enabled, cl.relforcerowsecurity as forced
			from pg_class cl join pg_namespace n on n.oid = cl.relnamespace where n.nspname ${inSchemas} and cl.relkind = 'r') r`,
		views: `select coalesce(json_agg(v order by v.schemaname, v.viewname), '[]') from (
			select vw.schemaname, vw.viewname, vw.definition
			from pg_views vw join pg_class cl on cl.relname = vw.viewname
			join pg_namespace n on n.oid = cl.relnamespace and n.nspname = vw.schemaname
			where vw.schemaname ${inSchemas}
				and not exists (select 1 from pg_depend dep where dep.objid = cl.oid and dep.deptype = 'e')) v`,
		sequences: `select coalesce(json_agg(s order by s.sequencename), '[]') from (
			select schemaname, sequencename, data_type::text, start_value, min_value, max_value, increment_by, cycle
			from pg_sequences where schemaname ${inSchemas}) s`,
		// ACLs from pg_class / pg_proc via aclexplode, not information_schema,
		// whose role_*_grants views hide rows whose grantor is not an enabled
		// role for the connecting user. The grantor is environment-specific and
		// omitted.
		table_grants: `select coalesce(json_agg(g order by g.table_schema, g.table_name, g.grantee, g.privilege_type), '[]') from (
			select distinct n.nspname as table_schema, cl.relname as table_name,
				acl.grantee::regrole::text as grantee, acl.privilege_type
			from pg_class cl join pg_namespace n on n.oid = cl.relnamespace, lateral aclexplode(cl.relacl) acl
			where n.nspname ${inSchemas} and cl.relkind in ('r','p','v','m')
				and acl.grantee::regrole::text ${inRoles}) g`,
		routine_grants: `select coalesce(json_agg(g order by g.routine, g.grantee), '[]') from (
			select distinct n.nspname || '.' || p.proname as routine, acl.grantee::regrole::text as grantee, acl.privilege_type
			from pg_proc p join pg_namespace n on n.oid = p.pronamespace, lateral aclexplode(p.proacl) acl
			where n.nspname ${inSchemas} and acl.grantee::regrole::text ${inRoles}) g`,
		default_acls: `select coalesce(json_agg(d order by d.role, d.schema, d.objtype), '[]') from (
			select defaclrole::regrole::text as role, coalesce(defaclnamespace::regnamespace::text, '') as schema,
				defaclobjtype as objtype, defaclacl::text as acl from pg_default_acl) d`,
	};
};

type Queryable = Pick<Pool, "query">;

const collect = async (
	run: (sql: string) => Promise<unknown>,
	scope: FingerprintScope,
): Promise<Fingerprint> => {
	const out: Fingerprint = {};
	for (const [name, sql] of Object.entries(fingerprintQueries(scope))) {
		const value = await run(sql);
		out[name] = Array.isArray(value) ? value : [];
	}
	return out;
};

const firstColumn = async (db: Queryable, sql: string): Promise<unknown> => {
	const { rows } = await db.query<Record<string, unknown>>(sql);
	return Object.values(rows[0] ?? {})[0];
};

export type FingerprintDatabaseOptions = FingerprintScope &
	CreatePoolConfig & {
		/** Reuse a pool instead of creating one from the connection string. Not ended here. */
		pool?: Pool;
	};

/** Fingerprint a live database (connection from the env contract, a URL, or a pool). */
export const fingerprintDatabase = async (
	options: FingerprintDatabaseOptions = {},
): Promise<Fingerprint> => {
	const pool = options.pool ?? createPool(options);
	try {
		return await collect((sql) => firstColumn(pool, sql), options);
	} finally {
		if (!options.pool) await pool.end();
	}
};

export interface FingerprintChainOptions extends FingerprintScope {
	/** The chain to apply. Default `drizzle`. */
	migrationsFolder?: string;
	/** Chains applied before it (nk-auth's `migrations/`), in order. */
	dependencyMigrations?: string[];
	/** Install nk-db's id codec functions first, as `createTestDb` does. Default false. */
	id758?: boolean;
	/** PGlite extensions to load (`{ vector }` from `@electric-sql/pglite-pgvector`). */
	extensions?: Record<string, unknown>;
	/** SQL the server had before the chain ran (`create extension if not exists vector`). */
	pre?: string[];
	/**
	 * Directory whose `package.json` anchors the `@electric-sql/pglite` import
	 * (a site workspace that depends on it). Without it the peer resolves from
	 * nk-db's own install, which an isolated linker only satisfies when the
	 * depending workspace also lists the peer.
	 */
	resolveFrom?: string;
}

const loadPglite = async (
	from?: string,
): Promise<typeof import("@electric-sql/pglite")> => {
	if (from !== undefined) {
		const req = createRequire(join(resolve(from), "package.json"));
		return (await import(
			req.resolve("@electric-sql/pglite")
		)) as typeof import("@electric-sql/pglite");
	}
	return import("@electric-sql/pglite");
};

/** The `.sql` files of a chain folder in journal order (sorted names without a journal). */
export const chainFiles = (folder: string): string[] => {
	try {
		const journal = JSON.parse(
			readFileSync(join(folder, "meta", "_journal.json"), "utf8"),
		) as { entries: Array<{ tag: string }> };
		return journal.entries.map((e) => join(folder, `${e.tag}.sql`));
	} catch {
		return readdirSync(folder)
			.filter((f) => f.endsWith(".sql"))
			.sort()
			.map((f) => join(folder, f));
	}
};

/**
 * Fingerprint a fresh in-memory PGlite booted from a chain. Every file is
 * exec'd whole, in journal order: drizzle's migrator sends a file as one
 * query, which a pg_dump-derived baseline (no breakpoints, `DO $$` blocks,
 * `SET LOCAL ROLE`) is not. `@electric-sql/pglite` is the optional peer.
 */
export const fingerprintChain = async (
	options: FingerprintChainOptions = {},
): Promise<Fingerprint> => {
	const { PGlite } = await loadPglite(options.resolveFrom);
	const db = new PGlite({ extensions: (options.extensions ?? {}) as never });
	try {
		if (options.id758) {
			const { ID758_SQL } = await import("id758/sql");
			await db.exec(ID758_SQL);
		}
		for (const sql of options.pre ?? []) await db.exec(sql);
		const folders = [
			...(options.dependencyMigrations ?? []),
			options.migrationsFolder ?? "drizzle",
		].map((f) => resolve(f));
		for (const folder of folders) {
			for (const file of chainFiles(folder)) {
				// PGlite does not persist a session SET across exec calls.
				await db.exec(
					`set search_path to public;\n${readFileSync(file, "utf8")}`,
				);
			}
		}
		return await collect(
			(sql) => firstColumn(db as unknown as Queryable, sql),
			options,
		);
	} finally {
		await db.close();
	}
};

export interface FingerprintDifference {
	key: string;
	/** Entries only the first fingerprint has, as canonical JSON. */
	onlyA: string[];
	/** Entries only the second fingerprint has, as canonical JSON. */
	onlyB: string[];
}

const canonical = (value: unknown): string =>
	JSON.stringify(value, (_key, v: unknown) =>
		v !== null && typeof v === "object" && !Array.isArray(v)
			? Object.fromEntries(
					Object.entries(v as Record<string, unknown>).sort(([a], [b]) =>
						a.localeCompare(b),
					),
				)
			: v,
	);

/** Set-wise, per-key difference between two fingerprints; empty when equivalent. */
export const diffFingerprints = (
	a: Fingerprint,
	b: Fingerprint,
): FingerprintDifference[] => {
	const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
	const out: FingerprintDifference[] = [];
	for (const key of keys) {
		const sa = new Set((a[key] ?? []).map(canonical));
		const sb = new Set((b[key] ?? []).map(canonical));
		const onlyA = [...sa].filter((x) => !sb.has(x)).sort();
		const onlyB = [...sb].filter((x) => !sa.has(x)).sort();
		if (onlyA.length > 0 || onlyB.length > 0) out.push({ key, onlyA, onlyB });
	}
	return out;
};

/** Human-readable rendering of a diff, `limit` entries per side per key. */
export const formatFingerprintDiff = (
	differences: FingerprintDifference[],
	labels: [string, string] = ["a", "b"],
	limit = 12,
): string => {
	const lines: string[] = [];
	let total = 0;
	for (const d of differences) {
		total += d.onlyA.length + d.onlyB.length;
		lines.push(
			`## ${d.key}: only in ${labels[0]}: ${d.onlyA.length}, only in ${labels[1]}: ${d.onlyB.length}`,
		);
		for (const x of d.onlyA.slice(0, limit)) lines.push(`  - ${x}`);
		for (const x of d.onlyB.slice(0, limit)) lines.push(`  + ${x}`);
	}
	lines.push(`TOTAL DIFFS ${total}`);
	return lines.join("\n");
};
