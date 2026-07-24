import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fromAddress } from "./client";
import type { Queryable } from "./log";
import { createMailer } from "./mailer";

const ORIGINAL_ENV = { ...process.env };

/** A Queryable that records every insert's SQL + params. */
const fakeDb = () => {
	const calls: { sql: string; params: unknown[] }[] = [];
	const db: Queryable = {
		query: async (sql: string, params: unknown[] = []) => {
			calls.push({ sql, params });
			return { rows: [] };
		},
	};
	return { db, calls };
};

beforeEach(() => {
	process.env.CLOUDFLARE_ACCOUNT_ID = "acct_123";
	process.env.CLOUDFLARE_EMAIL_API_TOKEN = "token_abc";
	process.env.EMAIL_FROM_DOMAIN = "mail.example.com";
});

afterEach(() => {
	process.env = { ...ORIGINAL_ENV };
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("createMailer", () => {
	it("sends and records a 'sent' row when a db is configured", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
		);
		const { db, calls } = fakeDb();
		const mailer = createMailer({ db });

		await mailer.send({
			to: ["first@example.com", "second@example.com"],
			from: fromAddress("Acme", "hello"),
			subject: "Hi",
			html: "<p>Hi</p>",
			templateKey: "welcome",
			kind: "transactional",
		});

		expect(calls).toHaveLength(1);
		const sql = calls[0]?.sql ?? "";
		const params = calls[0]?.params ?? [];
		expect(sql).toContain("insert into nk_email_log");
		// kind, recipient (first of the list), subject, sender, template_key, campaign_key, message_id, status, error
		expect(params[0]).toBe("transactional");
		expect(params[1]).toBe("first@example.com");
		expect(params[2]).toBe("Hi");
		expect(params[4]).toBe("welcome");
		expect(params[7]).toBe("sent");
		expect(params[8]).toBeNull();
	});

	it("records a 'failed' row and rethrows when the send fails", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(new Response("nope", { status: 500 })),
		);
		vi.spyOn(console, "error").mockImplementation(() => {});
		const { db, calls } = fakeDb();
		const mailer = createMailer({ db });

		await expect(
			mailer.send({
				to: "a@example.com",
				from: fromAddress("Acme"),
				subject: "Hi",
				text: "Hi",
			}),
		).rejects.toThrow(/returned 500/);

		expect(calls).toHaveLength(1);
		const params = calls[0]?.params ?? [];
		expect(params[0]).toBe("transactional"); // default kind
		expect(params[7]).toBe("failed");
		expect(params[8]).toMatch(/returned 500/);
	});

	it("is a pure pass-through with no db (nothing recorded)", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(new Response(null, { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);
		const mailer = createMailer();

		await mailer.send({
			to: "a@example.com",
			from: fromAddress("Acme"),
			subject: "Hi",
			text: "Hi",
		});

		expect(fetchMock).toHaveBeenCalledOnce();
		// The catalog/log metadata must not leak into the Cloudflare payload.
		const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		const payload = JSON.parse(init.body as string);
		expect(payload.templateKey).toBeUndefined();
		expect(payload.kind).toBeUndefined();
	});

	it("uses the configured defaultKind", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
		);
		const { db, calls } = fakeDb();
		const mailer = createMailer({ db, defaultKind: "marketing" });

		await mailer.send({
			to: "a@example.com",
			from: fromAddress("Acme"),
			subject: "News",
			html: "<p>News</p>",
			campaignKey: "issue-42",
		});

		const params = calls[0]?.params ?? [];
		expect(params[0]).toBe("marketing");
		expect(params[5]).toBe("issue-42");
	});

	it("never lets a logging failure mask a successful send", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
		);
		vi.spyOn(console, "error").mockImplementation(() => {});
		const db: Queryable = {
			query: async () => {
				throw new Error("db down");
			},
		};
		const mailer = createMailer({ db });

		await expect(
			mailer.send({
				to: "a@example.com",
				from: fromAddress("Acme"),
				subject: "Hi",
				text: "Hi",
			}),
		).resolves.toBeUndefined();
	});
});
