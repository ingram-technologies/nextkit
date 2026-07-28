import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fromAddress } from "./client.js";
import { MAX_LOGGED_BODY_CHARS, MAX_LOGGED_META_CHARS, type Queryable } from "./log.js";
import { createMailer } from "./mailer.js";

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

	it("leaves the body column out of the insert when capture is off", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
		);
		const { db, calls } = fakeDb();
		const mailer = createMailer({ db });

		await mailer.send({
			to: "a@example.com",
			from: fromAddress("Acme"),
			subject: "Hi",
			html: "<p>Hi</p>",
		});

		// A metadata-only site must never reference a column it hasn't migrated in.
		expect(calls[0]?.sql).not.toContain("body");
		expect(calls[0]?.params).toHaveLength(9);
	});

	it("archives the rendered parts when captureBody is on", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
		);
		const { db, calls } = fakeDb();
		const mailer = createMailer({ db, captureBody: true });

		await mailer.send({
			to: "a@example.com",
			from: fromAddress("Acme"),
			subject: "Receipt",
			html: "<p>Thanks</p>",
			text: "Thanks",
		});

		expect(calls[0]?.sql).toContain("body");
		expect(JSON.parse(String(calls[0]?.params[9]))).toEqual({
			html: "<p>Thanks</p>",
			text: "Thanks",
		});
	});

	it("stores only the parts a send actually had", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
		);
		const { db, calls } = fakeDb();
		const mailer = createMailer({ db, captureBody: true });

		await mailer.send({
			to: "a@example.com",
			from: fromAddress("Acme"),
			subject: "Plain",
			text: "Plain",
		});

		expect(JSON.parse(String(calls[0]?.params[9]))).toEqual({ text: "Plain" });
	});

	it("honours a per-send captureBody override in both directions", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
		);
		const { db, calls } = fakeDb();
		const archiving = createMailer({ db, captureBody: true });
		const metadataOnly = createMailer({ db });

		// The case this exists for: a magic-link body must stay out of the archive.
		await archiving.send({
			to: "a@example.com",
			from: fromAddress("Acme"),
			subject: "Sign in",
			html: "<a href='https://example.com/magic?token=live'>Sign in</a>",
			captureBody: false,
		});
		await metadataOnly.send({
			to: "a@example.com",
			from: fromAddress("Acme"),
			subject: "Receipt",
			html: "<p>Thanks</p>",
			captureBody: true,
		});

		expect(calls[0]?.sql).not.toContain("body");
		expect(JSON.stringify(calls[0]?.params)).not.toContain("token=live");
		expect(JSON.parse(String(calls[1]?.params[9]))).toEqual({
			html: "<p>Thanks</p>",
		});
	});

	it("archives the body of a failed send too", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(new Response("nope", { status: 500 })),
		);
		vi.spyOn(console, "error").mockImplementation(() => {});
		const { db, calls } = fakeDb();
		const mailer = createMailer({ db, captureBody: true });

		await expect(
			mailer.send({
				to: "a@example.com",
				from: fromAddress("Acme"),
				subject: "Receipt",
				text: "Thanks",
			}),
		).rejects.toThrow(/returned 500/);

		expect(calls[0]?.params[7]).toBe("failed");
		expect(JSON.parse(String(calls[0]?.params[9]))).toEqual({ text: "Thanks" });
	});

	it("clamps an oversized body and flags it as truncated", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
		);
		const { db, calls } = fakeDb();
		const mailer = createMailer({ db, captureBody: true });

		await mailer.send({
			to: "a@example.com",
			from: fromAddress("Acme"),
			subject: "Huge",
			html: "x".repeat(MAX_LOGGED_BODY_CHARS + 1000),
			text: "small",
		});

		const body = JSON.parse(String(calls[0]?.params[9]));
		expect(body.html).toHaveLength(MAX_LOGGED_BODY_CHARS);
		// A preview must be able to say "this is cut off" rather than imply it's whole.
		expect(body.truncated).toBe(true);
		// An untouched part carries no marker of its own.
		expect(body.text).toBe("small");
	});

	it("stores site-defined meta, independently of body capture", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
		);
		const { db, calls } = fakeDb();
		const mailer = createMailer({ db }); // metadata-only mailer

		await mailer.send({
			to: "a@example.com",
			from: fromAddress("Acme"),
			subject: "Hi",
			html: "<p>Hi</p>",
			meta: { personEmailId: "8f1c…", bookingId: 42 },
		});

		// No body captured, so meta is the 10th param, not the 11th.
		expect(calls[0]?.sql).toContain("meta");
		expect(calls[0]?.sql).not.toContain("body");
		expect(JSON.parse(String(calls[0]?.params[9]))).toEqual({
			personEmailId: "8f1c…",
			bookingId: 42,
		});
	});

	it("keeps meta out of the Cloudflare payload", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(new Response(null, { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);
		const { db } = fakeDb();
		const mailer = createMailer({ db });

		await mailer.send({
			to: "a@example.com",
			from: fromAddress("Acme"),
			subject: "Hi",
			text: "Hi",
			meta: { personEmailId: "8f1c…" },
		});

		const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(JSON.parse(init.body as string).meta).toBeUndefined();
	});

	it("omits meta rather than truncating it when it doesn't fit", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
		);
		vi.spyOn(console, "error").mockImplementation(() => {});
		const { db, calls } = fakeDb();
		const mailer = createMailer({ db });

		await mailer.send({
			to: "a@example.com",
			from: fromAddress("Acme"),
			subject: "Hi",
			text: "Hi",
			meta: { blob: "x".repeat(MAX_LOGGED_META_CHARS) },
		});

		// Half a JSON document is worse than none — the row still lands.
		expect(calls).toHaveLength(1);
		expect(calls[0]?.sql).not.toContain("meta");
		expect(calls[0]?.params).toHaveLength(9);
	});

	it("survives meta that cannot be serialized", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
		);
		vi.spyOn(console, "error").mockImplementation(() => {});
		const { db, calls } = fakeDb();
		const mailer = createMailer({ db });
		const circular: Record<string, unknown> = {};
		circular.self = circular;

		await expect(
			mailer.send({
				to: "a@example.com",
				from: fromAddress("Acme"),
				subject: "Hi",
				text: "Hi",
				meta: circular,
			}),
		).resolves.toBeUndefined();

		expect(calls[0]?.sql).not.toContain("meta");
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
