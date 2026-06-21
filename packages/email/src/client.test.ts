import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fromAddress, sendEmail } from "./client";
import { isConfigured, keys } from "./keys";

const ORIGINAL_ENV = { ...process.env };

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

describe("fromAddress", () => {
	it("builds a Name <local@domain> address from EMAIL_FROM_DOMAIN", () => {
		expect(fromAddress("Malina More", "hello")).toBe(
			"Malina More <hello@mail.example.com>",
		);
	});

	it("defaults the local part to notifications", () => {
		expect(fromAddress("Ingram")).toBe("Ingram <notifications@mail.example.com>");
	});

	it("throws when EMAIL_FROM_DOMAIN is missing", () => {
		process.env.EMAIL_FROM_DOMAIN = undefined;
		expect(() => fromAddress("Ingram")).toThrow(/EMAIL_FROM_DOMAIN/);
	});

	it("RFC 5322-quotes a name containing specials", () => {
		expect(fromAddress("Ingram, Inc.")).toBe(
			'"Ingram, Inc." <notifications@mail.example.com>',
		);
	});

	it("escapes quotes and backslashes inside a quoted name", () => {
		expect(fromAddress('A "B" \\C')).toBe(
			'"A \\"B\\" \\\\C" <notifications@mail.example.com>',
		);
	});

	it("rejects a name with a newline (header-injection guard)", () => {
		expect(() => fromAddress("Evil\r\nBcc: victim@example.com")).toThrow(
			/control characters or newlines/,
		);
	});
});

describe("keys", () => {
	it("returns validated credentials when all vars are present", () => {
		expect(keys()).toEqual({
			accountId: "acct_123",
			apiToken: "token_abc",
			fromDomain: "mail.example.com",
		});
	});

	it("lists every missing variable in one error", () => {
		process.env.CLOUDFLARE_ACCOUNT_ID = undefined;
		process.env.EMAIL_FROM_DOMAIN = undefined;
		expect(() => keys()).toThrow(/CLOUDFLARE_ACCOUNT_ID, EMAIL_FROM_DOMAIN/);
	});

	it("isConfigured reflects presence of all three vars", () => {
		expect(isConfigured()).toBe(true);
		process.env.CLOUDFLARE_EMAIL_API_TOKEN = undefined;
		expect(isConfigured()).toBe(false);
	});
});

describe("sendEmail", () => {
	it("posts a well-formed payload to the Cloudflare endpoint", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(new Response(null, { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);

		await sendEmail({
			to: "a@example.com",
			from: fromAddress("Ingram"),
			subject: "Hi",
			html: "<p>Hi</p>",
			replyTo: "reply@example.com",
			cc: "cc@example.com",
			headers: { "List-Unsubscribe": "<https://example.com/u>" },
		});

		expect(fetchMock).toHaveBeenCalledOnce();
		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toContain("/accounts/acct_123/email/sending/send");
		expect((init.headers as Record<string, string>).Authorization).toBe(
			"Bearer token_abc",
		);
		const payload = JSON.parse(init.body as string);
		expect(payload).toMatchObject({
			to: "a@example.com",
			subject: "Hi",
			html: "<p>Hi</p>",
			reply_to: "reply@example.com",
			cc: "cc@example.com",
			headers: { "List-Unsubscribe": "<https://example.com/u>" },
		});
	});

	it("throws when no credentials are configured", async () => {
		process.env.CLOUDFLARE_ACCOUNT_ID = undefined;
		await expect(
			sendEmail({
				to: "a@example.com",
				from: "x@y.com",
				subject: "s",
				text: "t",
			}),
		).rejects.toThrow(/credentials not configured/);
	});

	it("throws when neither text nor html is provided", async () => {
		await expect(
			sendEmail({ to: "a@example.com", from: "x@y.com", subject: "s" }),
		).rejects.toThrow(/text or html/);
	});

	it("wraps a request timeout in a clear error", async () => {
		const fetchMock = vi
			.fn()
			.mockRejectedValue(new DOMException("aborted", "TimeoutError"));
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			sendEmail({
				to: "a@example.com",
				from: "x@y.com",
				subject: "s",
				text: "t",
				timeoutMs: 5,
			}),
		).rejects.toThrow(/timed out after 5ms/);
	});

	it("surfaces Cloudflare API errors", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(new Response("nope", { status: 422 }));
		vi.stubGlobal("fetch", fetchMock);
		vi.spyOn(console, "error").mockImplementation(() => {});

		await expect(
			sendEmail({
				to: "a@example.com",
				from: "x@y.com",
				subject: "s",
				text: "t",
			}),
		).rejects.toThrow(/returned 422/);
	});
});
