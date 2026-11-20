-- @ingram-tech/nk-auth — entity ids become uuid (better-auth 1.7.15).
--
-- 0001 created every id and id-referencing column as `text`. The fleet stores
-- ids as uuid, so a site's own `user_id uuid` could not carry a foreign key to
-- "user"(id), and sites kept text copies or cast at every join. This moves the
-- chain's entity ids to `uuid`, defaulting to `uuidv7()` (PostgreSQL 18):
--
--   user.id
--   session.id, session.userId
--   account.id, account.userId
--   verification.id
--   jwks.id
--   passkey.id, passkey.userId
--   oauthClient.id, oauthClient.userId
--   oauthResource.id, oauthClientResource.id
--   oauthRefreshToken.id, .sessionId, .userId
--   oauthAccessToken.id, .sessionId, .userId, .refreshId
--   oauthConsent.id, .userId
--   oauthClientAssertion.id
--
-- Values that are not ids of these rows stay `text`: account.accountId (the
-- provider's subject), passkey.credentialID, verification.identifier and
-- value, every token, oauthClient.clientId (a client_id may be a URL),
-- oauthResource.identifier, the oauth tables' clientId / resourceId /
-- referenceId / authorizationCodeId.
--
-- Better Auth must then let the database mint ids:
-- `advanced.database.generateId: "uuid"`. Its single-use records
-- (verification reservations, client-assertion jti) key their row on a
-- deterministic id, which only that strategy shapes as a uuid.
--
-- Live databases. A column already `uuid` (a site that owns some of these
-- tables in its own baseline) is left as it is, and a missing table is
-- skipped. Any column of any table that carries a foreign key to a converted
-- column is converted with it, transitively, so a site's own
-- `user_id text references "user"(id)` becomes uuid too; its foreign keys are
-- dropped and re-created from their own definitions. Before anything changes,
-- the migration REFUSES, naming the columns, when:
--   - a value in any of those columns is not a hyphenated uuid (no silent
--     cast: fix or delete those rows, then re-run the migrate), or
--   - a view, rule, policy or trigger depends on one of them (ALTER TYPE
--     cannot carry it; drop it, migrate, re-create it against uuid).
-- Expired verification and client-assertion rows with a non-uuid id are
-- deleted first: they are dead single-use markers Better Auth never reads.
-- Row and value counts are asserted after the rewrite.
--
-- Append-only: this file is hashed by the runner and must never be edited once
-- shipped. The next better-auth schema change goes in 0006.

do $$
declare
	chain constant text[] := array[
		'user.id', 'session.id', 'session.userId', 'account.id', 'account.userId',
		'verification.id', 'jwks.id', 'passkey.id', 'passkey.userId',
		'oauthClient.id', 'oauthClient.userId', 'oauthResource.id',
		'oauthClientResource.id', 'oauthRefreshToken.id', 'oauthRefreshToken.sessionId',
		'oauthRefreshToken.userId', 'oauthAccessToken.id', 'oauthAccessToken.sessionId',
		'oauthAccessToken.userId', 'oauthAccessToken.refreshId', 'oauthConsent.id',
		'oauthConsent.userId', 'oauthClientAssertion.id'
	];
	uuid_shape constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
	entry text;
	tbl regclass;
	col text;
	r record;
	expected bigint;
	actual bigint;
	problems text[] := '{}';
	clauses text;
	fk_count bigint;
begin
	if current_setting('server_version_num')::int < 180000 then
		raise exception 'nk-auth 0005_uuid_ids: needs PostgreSQL 18 or later for uuidv7(); this server is %.', current_setting('server_version');
	end if;

	create temp table nkauth_targets (
		rel regclass not null,
		att text not null,
		chain_id boolean not null,
		rows_before bigint,
		values_before bigint,
		primary key (rel, att)
	) on commit drop;
	create temp table nkauth_fks (rel regclass not null, name text not null, def text not null) on commit drop;

	-- The chain's own columns, where they exist and are not uuid yet.
	foreach entry in array chain loop
		tbl := to_regclass(format('public.%I', split_part(entry, '.', 1)));
		col := split_part(entry, '.', 2);
		continue when tbl is null;
		if exists (
			select 1 from pg_attribute a
			where a.attrelid = tbl and a.attname = col and not a.attisdropped
				and a.atttypid <> 'uuid'::regtype
		) then
			insert into nkauth_targets (rel, att, chain_id) values (tbl, col, col = 'id');
		end if;
	end loop;

	-- Every column holding a foreign key to a target is a target, transitively.
	loop
		insert into nkauth_targets (rel, att, chain_id)
		select distinct c.conrelid::regclass, a.attname::text, false
		from pg_constraint c
		cross join lateral unnest(c.conkey, c.confkey) as k(src, dst)
		join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.src
		join pg_attribute d on d.attrelid = c.confrelid and d.attnum = k.dst
		join nkauth_targets t on t.rel = c.confrelid and t.att = d.attname
		where c.contype = 'f' and a.atttypid <> 'uuid'::regtype
		on conflict do nothing;
		exit when not found;
	end loop;

	-- Refuse: objects ALTER TYPE cannot carry across.
	for r in
		select t.rel, t.att, coalesce(
			(select format('view or rule on %s', w.ev_class::regclass) from pg_rewrite w where d.classid = 'pg_rewrite'::regclass and w.oid = d.objid),
			(select format('policy %I on %s', p.polname, p.polrelid::regclass) from pg_policy p where d.classid = 'pg_policy'::regclass and p.oid = d.objid),
			(select format('trigger %I on %s', g.tgname, g.tgrelid::regclass) from pg_trigger g where d.classid = 'pg_trigger'::regclass and g.oid = d.objid)
		) as what
		from nkauth_targets t
		join pg_attribute a on a.attrelid = t.rel and a.attname = t.att
		join pg_depend d on d.refobjid = t.rel and d.refobjsubid = a.attnum
		where d.classid in ('pg_rewrite'::regclass, 'pg_policy'::regclass, 'pg_trigger'::regclass)
	loop
		problems := problems || format('%s.%I (%s)', r.rel, r.att, r.what);
	end loop;
	if cardinality(problems) > 0 then
		raise exception 'nk-auth 0005_uuid_ids: cannot change these columns to uuid while other objects depend on them: %. Drop those objects, run the migrate, then re-create them against uuid columns.', array_to_string(problems, '; ');
	end if;

	-- Dead single-use markers whose id predates the uuid strategy.
	for r in
		select t.rel from nkauth_targets t
		where t.att = 'id' and t.rel in (to_regclass('public.verification'), to_regclass('public."oauthClientAssertion"'))
	loop
		execute format('select count(*) from %s where id !~ %L and "expiresAt" < now()', r.rel, uuid_shape) into expected;
		execute format('delete from %s where id !~ %L and "expiresAt" < now()', r.rel, uuid_shape);
		get diagnostics actual = row_count;
		if actual <> expected then
			raise exception 'nk-auth 0005_uuid_ids: expected to delete % expired rows from %, deleted %.', expected, r.rel, actual;
		end if;
		if actual > 0 then
			raise notice 'nk-auth 0005_uuid_ids: deleted % expired non-uuid rows from %.', actual, r.rel;
		end if;
	end loop;

	-- Refuse: any value that is not a uuid.
	for r in select t.rel, t.att from nkauth_targets t order by t.rel::text, t.att loop
		execute format('select count(*) from %s where %I is not null and %I !~ %L', r.rel, r.att, r.att, uuid_shape) into actual;
		if actual > 0 then
			problems := problems || format('%s.%I: %s', r.rel, r.att, actual);
		end if;
	end loop;
	if cardinality(problems) > 0 then
		raise exception 'nk-auth 0005_uuid_ids: these columns hold values that are not uuids (column: rows): %. Nothing was changed. Rewrite or delete those rows (and every row referencing them), then re-run the migrate.', array_to_string(problems, '; ');
	end if;

	-- Counts the rewrite must preserve.
	for r in select t.rel, t.att from nkauth_targets t loop
		execute format('select count(*), count(%I) from %s', r.att, r.rel) into expected, actual;
		update nkauth_targets set rows_before = expected, values_before = actual
		where rel = r.rel and att = r.att;
	end loop;

	-- Foreign keys on either side of a target, kept verbatim to re-create.
	insert into nkauth_fks (rel, name, def)
	select distinct c.conrelid::regclass, c.conname::text, pg_get_constraintdef(c.oid)
	from pg_constraint c
	where c.contype = 'f' and exists (
		select 1 from nkauth_targets t
		join pg_attribute a on a.attrelid = t.rel and a.attname = t.att
		where (t.rel = c.conrelid and a.attnum = any (c.conkey))
			or (t.rel = c.confrelid and a.attnum = any (c.confkey))
	);
	for r in select f.rel, f.name from nkauth_fks f loop
		execute format('alter table %s drop constraint %I', r.rel, r.name);
	end loop;

	-- One rewrite per table.
	for r in select t.rel from nkauth_targets t group by t.rel loop
		select string_agg(format('alter column %I drop default, alter column %I type uuid using %I::uuid', t.att, t.att, t.att), ', ')
		into clauses
		from nkauth_targets t where t.rel = r.rel;
		execute format('alter table %s %s', r.rel, clauses);
	end loop;

	-- Better Auth's "uuid" strategy leaves the id to the database.
	foreach entry in array chain loop
		continue when split_part(entry, '.', 2) <> 'id';
		tbl := to_regclass(format('public.%I', split_part(entry, '.', 1)));
		continue when tbl is null;
		if exists (select 1 from nkauth_targets t where t.rel = tbl and t.att = 'id')
			or not exists (select 1 from pg_attrdef ad join pg_attribute a on a.attrelid = ad.adrelid and a.attnum = ad.adnum where ad.adrelid = tbl and a.attname = 'id')
		then
			execute format('alter table %s alter column id set default uuidv7()', tbl);
		end if;
	end loop;

	for r in select f.rel, f.name, f.def from nkauth_fks f loop
		execute format('alter table %s add constraint %I %s', r.rel, r.name, r.def);
	end loop;

	-- Assert the rewrite kept every row and value, and every foreign key.
	for r in select t.rel, t.att, t.rows_before, t.values_before from nkauth_targets t loop
		execute format('select count(*), count(%I) from %s', r.att, r.rel) into expected, actual;
		if expected <> r.rows_before or actual <> r.values_before then
			raise exception 'nk-auth 0005_uuid_ids: %.% changed from % rows / % values to % / %.', r.rel, r.att, r.rows_before, r.values_before, expected, actual;
		end if;
		if not exists (select 1 from pg_attribute a where a.attrelid = r.rel and a.attname = r.att and a.atttypid = 'uuid'::regtype) then
			raise exception 'nk-auth 0005_uuid_ids: %.% is not uuid after the rewrite.', r.rel, r.att;
		end if;
	end loop;
	select count(*) into fk_count from nkauth_fks f
	where exists (select 1 from pg_constraint c where c.conrelid = f.rel and c.conname = f.name and c.contype = 'f');
	if fk_count <> (select count(*) from nkauth_fks) then
		raise exception 'nk-auth 0005_uuid_ids: re-created % of % foreign keys.', fk_count, (select count(*) from nkauth_fks);
	end if;

	raise notice 'nk-auth 0005_uuid_ids: % columns now uuid, % foreign keys re-created.', (select count(*) from nkauth_targets), fk_count;
end $$;
