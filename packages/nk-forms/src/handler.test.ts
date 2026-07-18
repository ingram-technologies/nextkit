import { describe, expect, it, vi } from "vitest";
import { type FormSchema, handleFormSubmission } from "./handler.js";

// A minimal structural schema — proves nk-forms needs no Zod dependency.
const schema: FormSchema<{ email: string }> = {
	safeParse(input) {
		if (
			typeof input === "object" &&
			input !== null &&
			"email" in input &&
			typeof (input as { email: unknown }).email === "string"
		) {
			return {
				success: true,
				data: { email: (input as { email: string }).email },
			};
		}
		return { success: false };
	},
};

const post = (body: unknown): Request =>
	new Request("https://acme.test/api/contact", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});

describe("handleFormSubmission", () => {
	it("delivers a valid submission and returns success", async () => {
		const onSubmit = vi.fn();
		const res = await handleFormSubmission(post({ email: "a@b.test" }), {
			schema,
			onSubmit,
		});
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ success: true });
		expect(onSubmit).toHaveBeenCalledWith({ email: "a@b.test" });
	});

	it("silently drops a honeypot hit without delivering", async () => {
		const onSubmit = vi.fn();
		const res = await handleFormSubmission(
			post({ email: "a@b.test", contact_detail: "i am a bot" }),
			{ schema, onSubmit },
		);
		// Same 200 body as success — a bot must not learn it was dropped.
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ success: true });
		expect(onSubmit).not.toHaveBeenCalled();
	});

	it("rejects invalid data with 400 and does not deliver", async () => {
		const onSubmit = vi.fn();
		const res = await handleFormSubmission(post({ nope: 1 }), {
			schema,
			onSubmit,
		});
		expect(res.status).toBe(400);
		expect(onSubmit).not.toHaveBeenCalled();
	});

	it("returns 429 with Retry-After when the rate limiter rejects", async () => {
		const onSubmit = vi.fn();
		const res = await handleFormSubmission(post({ email: "a@b.test" }), {
			schema,
			onSubmit,
			rateLimit: () => ({ ok: false, retryAfterMs: 30_000 }),
		});
		expect(res.status).toBe(429);
		expect(res.headers.get("retry-after")).toBe("30");
		expect(onSubmit).not.toHaveBeenCalled();
	});

	it("returns 500 when delivery throws", async () => {
		const res = await handleFormSubmission(post({ email: "a@b.test" }), {
			schema,
			onSubmit: () => {
				throw new Error("smtp down");
			},
		});
		expect(res.status).toBe(500);
	});

	it("returns 400 on a malformed body", async () => {
		const bad = new Request("https://acme.test/api/contact", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: "{not json",
		});
		const res = await handleFormSubmission(bad, { schema, onSubmit: vi.fn() });
		expect(res.status).toBe(400);
	});
});
