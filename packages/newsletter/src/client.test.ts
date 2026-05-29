import { sendEmail } from "@ingram-tech/email";
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createNewsletter } from "./client";

// Mock the email boundary; everything else is exercised for real. vitest hoists
// this above the imports, so `createNewsletter` sees the mocked module.
vi.mock("@ingram-tech/email", () => ({
	sendEmail: vi.fn(),
	fromAddress: vi.fn(
		(name: string, localPart = "notifications") =>
			`${name} <${localPart}@mail.test>`,
	),
}));

const TS = "2026-01-01T00:00:00.000Z";

type Row = Record<string, unknown>;
type Store = { newsletters: Row[]; newsletter_subscriptions: Row[] };

const newsletterRow = (over: Row = {}): Row => ({
	id: "nl_1",
	slug: "weekly",
	name: "Weekly",
	description: null,
	from_name: "Acme",
	from_local_part: "news",
	reply_to: null,
	is_active: true,
	created_at: TS,
	updated_at: TS,
	...over,
});

const subRow = (over: Row = {}): Row => ({
	id: "sub_1",
	newsletter_id: "nl_1",
	email: "a@example.com",
	user_id: null,
	unsubscribe_token: "tok_1",
	subscribed_at: TS,
	unsubscribed_at: null,
	source: null,
	metadata: {},
	created_at: TS,
	updated_at: TS,
	...over,
});

let idCounter = 0;

/**
 * Minimal in-memory stand-in for the slice of the Supabase query builder that
 * `createNewsletter` uses. It mutates the seeded `store` in place so reads after
 * writes see the change, and returns schema-complete rows so the client's Zod
 * parsing runs for real.
 */
class FakeQuery {
	table: keyof Store;
	store: Store;
	filters: ((r: Row) => boolean)[] = [];
	op: "select" | "insert" | "update" = "select";
	payload: Row | null = null;
	mode: "single" | "maybe" | null = null;
	orderBy: [string, boolean] | null = null;

	constructor(table: keyof Store, store: Store) {
		this.table = table;
		this.store = store;
	}
	select() {
		return this;
	}
	insert(values: Row) {
		this.op = "insert";
		this.payload = values;
		return this;
	}
	update(values: Row) {
		this.op = "update";
		this.payload = values;
		return this;
	}
	eq(col: string, val: unknown) {
		this.filters.push((r) => r[col] === val);
		return this;
	}
	is(col: string, val: unknown) {
		this.filters.push((r) => r[col] === val);
		return this;
	}
	order(col: string, opts: { ascending?: boolean } = {}) {
		this.orderBy = [col, opts.ascending !== false];
		return this;
	}
	maybeSingle() {
		this.mode = "maybe";
		return this;
	}
	single() {
		this.mode = "single";
		return this;
	}
	private match(r: Row) {
		return this.filters.every((f) => f(r));
	}
	private run() {
		const rows = this.store[this.table];
		if (this.op === "insert" && this.payload) {
			idCounter += 1;
			const base =
				this.table === "newsletter_subscriptions"
					? subRow({
							id: `sub_${idCounter}`,
							unsubscribe_token: `tok_${idCounter}`,
						})
					: newsletterRow({ id: `nl_${idCounter}` });
			const row = { ...base, ...this.payload };
			rows.push(row);
			return { data: this.mode ? row : [row], error: null };
		}
		if (this.op === "update" && this.payload) {
			const matched = rows.filter((r) => this.match(r));
			for (const r of matched) Object.assign(r, this.payload);
			return { data: this.mode ? (matched[0] ?? null) : matched, error: null };
		}
		let matched = rows.filter((r) => this.match(r));
		if (this.orderBy) {
			const [col, asc] = this.orderBy;
			matched = [...matched].sort((a, b) => {
				const av = String(a[col]);
				const bv = String(b[col]);
				if (av === bv) return 0;
				return (av < bv ? -1 : 1) * (asc ? 1 : -1);
			});
		}
		return { data: this.mode ? (matched[0] ?? null) : matched, error: null };
	}
	// biome-ignore lint/suspicious/noThenProperty: deliberate thenable — a test double of Supabase's PromiseLike query builder, which is awaited at several points in the client.
	then(
		resolve: (value: { data: unknown; error: null }) => unknown,
		reject?: (reason: unknown) => unknown,
	) {
		return Promise.resolve(this.run()).then(resolve, reject);
	}
}

// Build a newsletter client over an in-memory store. The fake satisfies only the
// query surface used here, so it's bridged to the SupabaseClient type for the call.
const client = (store: Store) =>
	createNewsletter({
		supabase: {
			from: (t: keyof Store) => new FakeQuery(t, store),
		} as unknown as SupabaseClient,
		baseUrl: "https://acme.test",
	});

beforeEach(() => {
	idCounter = 0;
	vi.mocked(sendEmail).mockReset();
	vi.mocked(sendEmail).mockResolvedValue(undefined);
});

describe("subscribe", () => {
	it("inserts a new subscription with an unsubscribe token", async () => {
		const store: Store = {
			newsletters: [newsletterRow()],
			newsletter_subscriptions: [],
		};
		const sub = await client(store).subscribe({
			newsletterSlug: "weekly",
			email: "New@Example.com",
		});
		expect(sub.email).toBe("new@example.com");
		expect(sub.unsubscribe_token).toBeTruthy();
		expect(store.newsletter_subscriptions).toHaveLength(1);
	});

	it("is a no-op for an already-active subscription", async () => {
		const store: Store = {
			newsletters: [newsletterRow()],
			newsletter_subscriptions: [subRow()],
		};
		const sub = await client(store).subscribe({
			newsletterSlug: "weekly",
			email: "A@Example.com",
		});
		expect(sub.id).toBe("sub_1");
		expect(store.newsletter_subscriptions).toHaveLength(1);
	});

	it("resurrects a previously unsubscribed row", async () => {
		const store: Store = {
			newsletters: [newsletterRow()],
			newsletter_subscriptions: [subRow({ unsubscribed_at: TS })],
		};
		const sub = await client(store).subscribe({
			newsletterSlug: "weekly",
			email: "a@example.com",
		});
		expect(sub.unsubscribed_at).toBeNull();
		expect(store.newsletter_subscriptions[0]?.unsubscribed_at).toBeNull();
	});

	it("throws for an unknown newsletter", async () => {
		const store: Store = { newsletters: [], newsletter_subscriptions: [] };
		await expect(
			client(store).subscribe({ newsletterSlug: "nope", email: "a@b.com" }),
		).rejects.toThrow(/Unknown newsletter/);
	});

	it("throws for an inactive newsletter", async () => {
		const store: Store = {
			newsletters: [newsletterRow({ is_active: false })],
			newsletter_subscriptions: [],
		};
		await expect(
			client(store).subscribe({ newsletterSlug: "weekly", email: "a@b.com" }),
		).rejects.toThrow(/not active/);
	});
});

describe("unsubscribe", () => {
	it("marks the row unsubscribed and returns true", async () => {
		const store: Store = {
			newsletters: [newsletterRow()],
			newsletter_subscriptions: [subRow()],
		};
		expect(await client(store).unsubscribe("tok_1")).toBe(true);
		expect(store.newsletter_subscriptions[0]?.unsubscribed_at).not.toBeNull();
	});

	it("is idempotent for an already-unsubscribed row", async () => {
		const store: Store = {
			newsletters: [newsletterRow()],
			newsletter_subscriptions: [subRow({ unsubscribed_at: TS })],
		};
		expect(await client(store).unsubscribe("tok_1")).toBe(true);
	});

	it("returns false for an unknown token", async () => {
		const store: Store = {
			newsletters: [newsletterRow()],
			newsletter_subscriptions: [],
		};
		expect(await client(store).unsubscribe("missing")).toBe(false);
	});
});

describe("send", () => {
	const threeSubs = (): Store => ({
		newsletters: [newsletterRow()],
		newsletter_subscriptions: [
			subRow({ id: "sub_1", email: "a@example.com", unsubscribe_token: "t1" }),
			subRow({ id: "sub_2", email: "b@example.com", unsubscribe_token: "t2" }),
			subRow({
				id: "sub_3",
				email: "c@example.com",
				unsubscribe_token: "t3",
				unsubscribed_at: TS,
			}),
		],
	});

	it("emails only active subscribers and reports counts", async () => {
		const res = await client(threeSubs()).send({
			newsletterSlug: "weekly",
			subject: "Hi",
			content: "Body",
		});
		expect(res.totalRecipients).toBe(2);
		expect(res.sentCount).toBe(2);
		expect(res.failedCount).toBe(0);
		expect(vi.mocked(sendEmail)).toHaveBeenCalledTimes(2);
	});

	it("isolates a per-recipient failure without aborting the batch", async () => {
		vi.mocked(sendEmail).mockImplementation(async ({ to }) => {
			if (to === "b@example.com") throw new Error("bounce");
		});
		const res = await client(threeSubs()).send({
			newsletterSlug: "weekly",
			subject: "Hi",
			content: "Body",
		});
		expect(res.sentCount).toBe(1);
		expect(res.failedCount).toBe(1);
		expect(res.failures[0]?.email).toBe("b@example.com");
	});

	it("respects onlyTo for test sends", async () => {
		const res = await client(threeSubs()).send({
			newsletterSlug: "weekly",
			subject: "Hi",
			content: "Body",
			onlyTo: ["A@example.com"],
		});
		expect(res.totalRecipients).toBe(1);
		expect(vi.mocked(sendEmail)).toHaveBeenCalledOnce();
	});
});
