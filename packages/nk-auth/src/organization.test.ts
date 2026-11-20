import { fileURLToPath } from "node:url";
import { createTestDb, type TestDb } from "@ingram-tech/nk-db/pglite";
import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins/organization";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	lastActiveOrganizationHooks,
	lastActiveOrganizationUserField,
	nkOrganizationDefaults,
} from "./organization.js";

// The hooks through Better Auth itself, on a one-connection pool: sign-up holds
// that connection in a transaction while session.create.before runs, so a hook
// that asked the pool for another one never finished.

const MIGRATIONS = fileURLToPath(new URL("../migrations", import.meta.url));

// The organization plugin's tables are site-owned, not in nk-auth's chain. Their
// ids are uuid like the chain's, defaulted, since Better Auth's "uuid" strategy
// leaves every id to the database.
const ORG_DDL = [
	'alter table "user" add column "lastActiveOrganizationId" uuid',
	'alter table "session" add column "activeOrganizationId" uuid',
	`create table "organization" ("id" uuid primary key default uuidv7(), "name" text not null,
		"slug" text not null unique, "logo" text, "createdAt" timestamptz not null,
		"updatedAt" timestamptz, "metadata" text)`,
	`create table "member" ("id" uuid primary key default uuidv7(),
		"organizationId" uuid not null references "organization" ("id") on delete cascade,
		"userId" uuid not null references "user" ("id") on delete cascade,
		"role" text not null, "createdAt" timestamptz not null)`,
	`create table "invitation" ("id" uuid primary key default uuidv7(),
		"organizationId" uuid not null references "organization" ("id") on delete cascade,
		"email" text not null, "role" text, "status" text not null,
		"expiresAt" timestamptz not null, "createdAt" timestamptz not null default now(),
		"inviterId" uuid not null references "user" ("id") on delete cascade)`,
];

let db: TestDb;
const makeAuth = (pool: TestDb["pool"]) =>
	betterAuth({
		database: pool,
		secret: "s".repeat(32),
		baseURL: "http://localhost:3000",
		emailAndPassword: { enabled: true },
		advanced: { database: { generateId: "uuid" } },
		user: { additionalFields: lastActiveOrganizationUserField },
		databaseHooks: lastActiveOrganizationHooks(pool),
		plugins: [organization(nkOrganizationDefaults)],
	});
let auth: ReturnType<typeof makeAuth>;

beforeAll(async () => {
	db = await createTestDb({
		migrate: async (pg) => {
			for (const statement of ORG_DDL) await pg.exec(statement);
		},
		dependencyMigrations: [{ folder: MIGRATIONS, table: "__nkauth_migrations" }],
	});
	auth = makeAuth(db.pool);
});

afterAll(async () => {
	await db?.close();
});

const password = "correct horse battery";

describe("lastActiveOrganizationHooks", () => {
	it("signs up on a one-connection pool", async () => {
		const result = await auth.api.signUpEmail({
			body: { email: "new@example.com", password, name: "New" },
		});
		expect(result.user.email).toBe("new@example.com");
	}, 5_000);

	it("restores the last active organization on sign-in, and persists a switch", async () => {
		const { user } = await auth.api.signUpEmail({
			body: { email: "member@example.com", password, name: "Member" },
		});
		const orgs = ["a", "b"].map((slug) => ({ id: crypto.randomUUID(), slug }));
		const [orgA, orgB] = orgs.map((org) => org.id);
		for (const org of orgs) {
			await db.pool.query(
				'insert into "organization" (id, name, slug, "createdAt") values ($1::uuid, $1::text, $2, now())',
				[org.id, org.slug],
			);
			await db.pool.query(
				`insert into "member" (id, "organizationId", "userId", role, "createdAt")
				 values ($1, $2, $3, 'owner', now())`,
				[crypto.randomUUID(), org.id, user.id],
			);
		}
		await db.pool.query(
			'update "user" set "lastActiveOrganizationId" = $1 where id = $2',
			[orgA, user.id],
		);

		const signIn = await auth.api.signInEmail({
			body: { email: "member@example.com", password },
			returnHeaders: true,
		});
		const cookie = (signIn.headers.getSetCookie()[0] ?? "").split(";")[0] ?? "";
		const headers = new Headers({ cookie });
		const session = await auth.api.getSession({ headers });
		expect(session?.session.activeOrganizationId).toBe(orgA);

		await auth.api.setActiveOrganization({
			headers,
			body: { organizationId: orgB },
		});
		const stored = await db.pool.query<{ lastActiveOrganizationId: string }>(
			'select "lastActiveOrganizationId" from "user" where id = $1',
			[user.id],
		);
		expect(stored.rows[0]?.lastActiveOrganizationId).toBe(orgB);
	});

	it("skips an organization the user has left", async () => {
		const { user } = await auth.api.signUpEmail({
			body: { email: "left@example.com", password, name: "Left" },
		});
		await db.pool.query(
			'update "user" set "lastActiveOrganizationId" = $1 where id = $2',
			[crypto.randomUUID(), user.id],
		);
		const signIn = await auth.api.signInEmail({
			body: { email: "left@example.com", password },
			returnHeaders: true,
		});
		const cookie = (signIn.headers.getSetCookie()[0] ?? "").split(";")[0] ?? "";
		const session = await auth.api.getSession({ headers: new Headers({ cookie }) });
		expect(session?.session.activeOrganizationId ?? null).toBeNull();
	});
});
