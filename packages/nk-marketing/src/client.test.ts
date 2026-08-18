import { createMailer, sendEmail } from "@ingram-tech/nk-email";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMarketing } from "./client.js";
import type { Queryable } from "./db.js";

// Mock the email boundary; everything else runs for real against the fake DB.
// escapeHtml is included because the renderer imports it from this module.
// createMailer delegates to the same sendEmail spy (stripping the log-only
// fields, exactly as the real mailer does), so the payload assertions below are
// unaffected by the client now sending through the mailer. Send-logging itself
// is covered by nk-email's own mailer tests.
vi.mock("@ingram-tech/nk-email", () => {
	const sendEmail = vi.fn();
	return {
		sendEmail,
		createMailer: vi.fn((_config?: unknown) => ({
			send: (opts: Record<string, unknown>) => {
				const {
					kind: _kind,
					templateKey: _tk,
					campaignKey: _ck,
					...rest
				} = opts;
				return sendEmail(rest);
			},
		})),
		fromAddress: vi.fn(
			(name: string, localPart = "notifications") =>
				`${name} <${localPart}@mail.test>`,
		),
		escapeHtml: (v: string) => v.replace(/</g, "&lt;").replace(/>/g, "&gt;"),
	};
});

const sendMock = vi.mocked(sendEmail);
const createMailerMock = vi.mocked(createMailer);

interface ContactRow {
	id: string;
	email: string;
	user_id: string | null;
	locale: string | null;
	unsubscribe_token: string;
	unsubscribed_all_at: string | null;
}
interface AudienceRow {
	id: string;
	slug: string;
	name: string;
	from_name: string;
	from_local_part: string;
	reply_to: string | null;
	is_active: boolean;
}
interface SubRow {
	id: string;
	audience_id: string;
	contact_id: string;
	unsubscribe_token: string;
	unsubscribed_at: string | null;
	source: string | null;
	subscribed_at: number;
}

const TS = "2026-01-01T00:00:00.000Z";

/**
 * In-memory stand-in for just the statements createMarketing issues — matched by
 * the leading text of each (whitespace-normalised). Enough to exercise consent,
 * dedup, and orchestration without Postgres; the real SQL is covered by the
 * consuming site's PGlite integration tests.
 */
class FakeDb implements Queryable {
	contacts: ContactRow[] = [];
	audiences: AudienceRow[] = [];
	subs: SubRow[] = [];
	deliveries = new Set<string>();
	private seq = 0;
	private subSeq = 0;

	seedAudience(over: Partial<AudienceRow> = {}): AudienceRow {
		const row: AudienceRow = {
			id: `aud_${this.audiences.length + 1}`,
			slug: "weekly",
			name: "Acme Weekly",
			from_name: "Acme",
			from_local_part: "news",
			reply_to: null,
			is_active: true,
			...over,
		};
		this.audiences.push(row);
		return row;
	}

	// oxlint-disable-next-line require-await -- async to satisfy the Queryable interface.
	async query<R = Record<string, unknown>>(
		sql: string,
		params: unknown[] = [],
	): Promise<{ rows: R[] }> {
		const s = sql.replace(/\s+/g, " ").trim();
		const rows = this.dispatch(s, params);
		return { rows: rows as R[] };
	}

	private dispatch(s: string, params: unknown[]): unknown[] {
		if (s.startsWith("insert into marketing_contacts")) {
			const [email, userId, locale, token] = params as [
				string,
				string | null,
				string | null,
				string,
			];
			const existing = this.contacts.find((c) => c.email === email);
			if (existing) {
				existing.user_id = existing.user_id ?? userId;
				existing.locale = locale ?? existing.locale;
				return [existing];
			}
			const row: ContactRow = {
				id: `con_${++this.seq}`,
				email,
				user_id: userId,
				locale,
				unsubscribe_token: token,
				unsubscribed_all_at: null,
			};
			this.contacts.push(row);
			return [row];
		}

		if (s.startsWith("select id, slug, name")) {
			const [slug] = params as [string];
			const a = this.audiences.find((x) => x.slug === slug);
			return a ? [a] : [];
		}

		if (s.startsWith("insert into marketing_subscriptions")) {
			const [audienceId, contactId, token, source] = params as [
				string,
				string,
				string,
				string | null,
			];
			const existing = this.subs.find(
				(x) => x.audience_id === audienceId && x.contact_id === contactId,
			);
			if (existing) {
				existing.unsubscribed_at = null;
				existing.source = source ?? existing.source;
				return [existing];
			}
			const row: SubRow = {
				id: `sub_${++this.subSeq}`,
				audience_id: audienceId,
				contact_id: contactId,
				unsubscribe_token: token,
				unsubscribed_at: null,
				source,
				subscribed_at: this.subSeq,
			};
			this.subs.push(row);
			return [row];
		}

		if (s.startsWith("select id, unsubscribed_at from marketing_subscriptions")) {
			const [token] = params as [string];
			const sub = this.subs.find((x) => x.unsubscribe_token === token);
			return sub ? [{ id: sub.id, unsubscribed_at: sub.unsubscribed_at }] : [];
		}

		if (s.startsWith("update marketing_subscriptions set unsubscribed_at")) {
			const [id] = params as [string];
			const sub = this.subs.find((x) => x.id === id);
			if (sub) sub.unsubscribed_at = TS;
			return [];
		}

		if (s.startsWith("select id, unsubscribed_all_at from marketing_contacts")) {
			const [token] = params as [string];
			const c = this.contacts.find((x) => x.unsubscribe_token === token);
			return c ? [{ id: c.id, unsubscribed_all_at: c.unsubscribed_all_at }] : [];
		}

		if (s.startsWith("update marketing_contacts set unsubscribed_all_at")) {
			const [id] = params as [string];
			const c = this.contacts.find((x) => x.id === id);
			// The same column is set (global opt-out) and cleared (re-subscribe).
			if (c) c.unsubscribed_all_at = s.includes("= null") ? null : TS;
			return [];
		}

		if (s.startsWith("insert into marketing_deliveries")) {
			const [campaign, contactId] = params as [string, string];
			const key = `${campaign}|${contactId}`;
			if (this.deliveries.has(key)) return [];
			this.deliveries.add(key);
			return [{ contact_id: contactId }];
		}

		if (s.startsWith("delete from marketing_deliveries")) {
			const [campaign, contactId] = params as [string, string];
			this.deliveries.delete(`${campaign}|${contactId}`);
			return [];
		}

		if (s.startsWith("select s.unsubscribe_token as sub_token")) {
			const [audienceId] = params as [string];
			return this.subs
				.filter(
					(x) => x.audience_id === audienceId && x.unsubscribed_at === null,
				)
				.map((x) => ({
					sub: x,
					c: this.contacts.find((c) => c.id === x.contact_id),
				}))
				.filter((j) => j.c && j.c.unsubscribed_all_at === null)
				.sort((a, b) => a.sub.subscribed_at - b.sub.subscribed_at)
				.map((j) => ({
					sub_token: j.sub.unsubscribe_token,
					contact_id: j.sub.contact_id,
					email: j.c?.email,
				}));
		}

		throw new Error(`FakeDb: unhandled statement: ${s.slice(0, 60)}`);
	}
}

let db: FakeDb;
let marketing: ReturnType<typeof createMarketing>;

beforeEach(() => {
	sendMock.mockReset();
	sendMock.mockResolvedValue(undefined);
	createMailerMock.mockClear();
	db = new FakeDb();
	marketing = createMarketing({ db, baseUrl: "https://acme.test" });
});

describe("identify", () => {
	it("creates a contact, then is idempotent and keeps the token", async () => {
		const a = await marketing.identify({ email: "User@Acme.test" });
		expect(a.email).toBe("user@acme.test"); // normalised
		const b = await marketing.identify({ email: "user@acme.test", userId: "u1" });
		expect(b.id).toBe(a.id);
		expect(b.unsubscribe_token).toBe(a.unsubscribe_token);
		expect(b.user_id).toBe("u1"); // backfilled
		expect(db.contacts).toHaveLength(1);
	});
});

describe("subscribe / unsubscribe", () => {
	it("subscribes, unsubscribes by subscription token (audience scope), then resurrects", async () => {
		db.seedAudience();
		const sub = await marketing.subscribe({
			audienceSlug: "weekly",
			email: "a@acme.test",
		});
		expect(sub.unsubscribed_at).toBeNull();

		const first = await marketing.unsubscribe(sub.unsubscribe_token);
		expect(first).toEqual({ status: "unsubscribed", scope: "audience" });
		const second = await marketing.unsubscribe(sub.unsubscribe_token);
		expect(second).toEqual({ status: "already" });

		const resurrected = await marketing.subscribe({
			audienceSlug: "weekly",
			email: "a@acme.test",
		});
		expect(resurrected.id).toBe(sub.id);
		expect(resurrected.unsubscribed_at).toBeNull();
	});

	it("unsubscribes globally by contact token, and reports unknown tokens", async () => {
		const contact = await marketing.identify({ email: "a@acme.test" });
		expect(await marketing.unsubscribe("nope")).toEqual({ status: "unknown" });
		const res = await marketing.unsubscribe(contact.unsubscribe_token);
		expect(res).toEqual({ status: "unsubscribed", scope: "global" });
	});
});

describe("sendBroadcast", () => {
	it("sends to active subscribers, excluding the globally opted-out", async () => {
		db.seedAudience();
		await marketing.subscribe({ audienceSlug: "weekly", email: "in@acme.test" });
		const out = await marketing.subscribe({
			audienceSlug: "weekly",
			email: "out@acme.test",
		});
		// Globally opt the second contact out.
		const outContact = db.contacts.find((c) => c.email === "out@acme.test");
		await marketing.unsubscribe(outContact?.unsubscribe_token ?? "");
		void out;

		const result = await marketing.sendBroadcast({
			audienceSlug: "weekly",
			subject: "What's new",
			content: "Body.",
		});
		expect(result.sentCount).toBe(1);
		expect(sendMock).toHaveBeenCalledOnce();
		const arg = sendMock.mock.calls[0]?.[0];
		expect(arg?.to).toBe("in@acme.test");
		expect(arg?.listUnsubscribe?.url).toContain(
			"/api/marketing/unsubscribe?token=",
		);
	});

	it("dedupes a re-run when campaignKey is set", async () => {
		db.seedAudience();
		await marketing.subscribe({ audienceSlug: "weekly", email: "a@acme.test" });
		const opts = {
			audienceSlug: "weekly",
			subject: "Issue 1",
			content: "Body.",
			campaignKey: "issue-1",
		};
		const first = await marketing.sendBroadcast(opts);
		const second = await marketing.sendBroadcast(opts);
		expect(first.sentCount).toBe(1);
		expect(second.sentCount).toBe(0);
		expect(second.skippedCount).toBe(1);
		expect(sendMock).toHaveBeenCalledOnce();
	});
});

describe("sendLifecycle", () => {
	const opts = {
		campaignKey: "first-invoice-nudge",
		email: "a@acme.test",
		subject: "Send your first invoice",
		content: "Get started.",
		from: { name: "Acme" },
	};

	it("sends once, then reports duplicate", async () => {
		expect(await marketing.sendLifecycle(opts)).toEqual({ status: "sent" });
		expect(await marketing.sendLifecycle(opts)).toEqual({ status: "duplicate" });
		expect(sendMock).toHaveBeenCalledOnce();
		const arg = sendMock.mock.calls[0]?.[0];
		expect(arg?.from).toBe("Acme <notifications@mail.test>");
		expect(arg?.listUnsubscribe?.url).toContain("token=");
	});

	it("suppresses a globally opted-out contact without sending", async () => {
		const contact = await marketing.identify({ email: "a@acme.test" });
		await marketing.unsubscribe(contact.unsubscribe_token);
		expect(await marketing.sendLifecycle(opts)).toEqual({ status: "suppressed" });
		expect(sendMock).not.toHaveBeenCalled();
	});

	it("releases the claim and rethrows when the send fails (so it can retry)", async () => {
		sendMock.mockRejectedValueOnce(new Error("smtp down"));
		await expect(marketing.sendLifecycle(opts)).rejects.toThrow("smtp down");
		// Claim released → a retry now goes through.
		sendMock.mockResolvedValueOnce(undefined);
		expect(await marketing.sendLifecycle(opts)).toEqual({ status: "sent" });
	});
});

describe("re-subscribe after global opt-out", () => {
	it("clears the global suppression so broadcasts reach the contact again", async () => {
		db.seedAudience();
		const contact = await marketing.identify({ email: "a@acme.test" });
		await marketing.unsubscribe(contact.unsubscribe_token); // global opt-out
		// An explicit signup afterwards is fresh consent…
		await marketing.subscribe({ audienceSlug: "weekly", email: "a@acme.test" });
		// …so the next broadcast must include them (previously: silently
		// excluded forever while subscribe() reported success).
		const result = await marketing.sendBroadcast({
			audienceSlug: "weekly",
			subject: "Issue 1",
			content: "Hello",
		});
		expect(result.sentCount).toBe(1);
		expect(sendMock).toHaveBeenCalledTimes(1);
	});
});

describe("input validation", () => {
	it("rejects junk emails with a descriptive error, not a pg constraint", async () => {
		await expect(marketing.identify({ email: "not-an-email" })).rejects.toThrow(
			/invalid email/,
		);
	});
});

describe("send logging configuration", () => {
	// The mailer config is the whole mechanism: nk-marketing renders the body
	// but only nk-email can archive it, so a value dropped here is a send that
	// is logged envelope-only with nothing in the repo to show why.
	const configFor = (overrides: Partial<Parameters<typeof createMarketing>[0]>) => {
		createMailerMock.mockClear();
		createMarketing({ db, baseUrl: "https://acme.test", ...overrides });
		return createMailerMock.mock.calls[0]?.[0] as
			| { db?: unknown; defaultKind?: string; captureBody?: boolean }
			| undefined;
	};

	it("keeps bodies out of the log unless asked", () => {
		expect(configFor({})).toMatchObject({
			defaultKind: "marketing",
			captureBody: false,
		});
	});

	it("forwards captureBody so sends archive their rendered body", () => {
		expect(configFor({ captureBody: true })).toMatchObject({
			defaultKind: "marketing",
			captureBody: true,
		});
	});

	it("builds a pass-through mailer when logSends is off", () => {
		// No db reaches the mailer, so captureBody has nothing to write to and
		// must not be forwarded as if it did.
		expect(configFor({ logSends: false, captureBody: true })).toEqual({});
	});
});
