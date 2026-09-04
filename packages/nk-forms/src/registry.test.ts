import { describe, expect, it, vi } from "vitest";
import { type FormSchema } from "./handler.js";
import { formEndpoint } from "./paths.js";
import { createFormsHandler, defineForm } from "./registry.js";

const emailSchema: FormSchema<{ email: string }> = {
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

const post = (path: string, body: unknown): Request =>
	new Request(`https://acme.test${path}`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});

const get = (path: string): Request => new Request(`https://acme.test${path}`);

describe("createFormsHandler", () => {
	it("routes a POST to the entry named by the last path segment", async () => {
		const contact = vi.fn();
		const newsletter = vi.fn();
		const { POST } = createFormsHandler({
			contact: defineForm({ schema: emailSchema, onSubmit: contact }),
			newsletter: defineForm({ schema: emailSchema, onSubmit: newsletter }),
		});
		const res = await POST(post(formEndpoint("newsletter"), { email: "a@b.test" }));
		expect(res.status).toBe(200);
		expect(newsletter).toHaveBeenCalledWith({ email: "a@b.test" });
		expect(contact).not.toHaveBeenCalled();
	});

	it("tolerates a trailing slash", async () => {
		const onSubmit = vi.fn();
		const { POST } = createFormsHandler({
			contact: defineForm({ schema: emailSchema, onSubmit }),
		});
		const res = await POST(post("/internal/forms/contact/", { email: "a@b.test" }));
		expect(res.status).toBe(200);
		expect(onSubmit).toHaveBeenCalled();
	});

	it("returns 404 for an unknown form on both methods, without delivering", async () => {
		const onSubmit = vi.fn();
		const logger = { warn: vi.fn(), error: vi.fn() };
		const { GET, POST } = createFormsHandler(
			{ contact: defineForm({ schema: emailSchema, onSubmit }) },
			{ logger },
		);
		expect(GET(get("/internal/forms/nope")).status).toBe(404);
		const res = await POST(post("/internal/forms/nope", { email: "a@b.test" }));
		expect(res.status).toBe(404);
		expect(onSubmit).not.toHaveBeenCalled();
		expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('"nope"'));
	});

	it("does not treat Object.prototype keys as forms", async () => {
		const { GET } = createFormsHandler({});
		expect(GET(get("/internal/forms/constructor")).status).toBe(404);
	});

	it("mints a token on GET for a known form", async () => {
		const { GET } = createFormsHandler({
			contact: defineForm({ schema: emailSchema, onSubmit: () => {} }),
		});
		const res = GET(get(formEndpoint("contact")));
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ token: expect.any(String) });
	});

	it("asks the site limiter with the form name and its budget", async () => {
		const rateLimit = vi
			.fn()
			.mockResolvedValue({ ok: false, retryAfterMs: 30_000 });
		const onSubmit = vi.fn();
		const { POST } = createFormsHandler(
			{
				contact: defineForm({ schema: emailSchema, onSubmit }),
				waitlist: defineForm({
					schema: emailSchema,
					onSubmit,
					rateLimit: { limit: 1, windowMs: 1000 },
				}),
			},
			{ rateLimit },
		);

		const blocked = await POST(
			post(formEndpoint("contact"), { email: "a@b.test" }),
		);
		expect(blocked.status).toBe(429);
		expect(blocked.headers.get("retry-after")).toBe("30");
		expect(onSubmit).not.toHaveBeenCalled();
		expect(rateLimit).toHaveBeenCalledWith(
			expect.objectContaining({ form: "contact", limit: 5, windowMs: 600_000 }),
		);

		await POST(post(formEndpoint("waitlist"), { email: "a@b.test" }));
		expect(rateLimit).toHaveBeenLastCalledWith(
			expect.objectContaining({ form: "waitlist", limit: 1, windowMs: 1000 }),
		);
	});

	it("labels log lines with the form name", async () => {
		const logger = { warn: vi.fn(), error: vi.fn() };
		const { POST } = createFormsHandler(
			{ contact: defineForm({ schema: emailSchema, onSubmit: () => {} }) },
			{ logger },
		);
		await POST(
			post(formEndpoint("contact"), { email: "a@b.test", contact_detail: "bot" }),
		);
		expect(logger.warn).toHaveBeenCalledWith(expect.stringMatching(/^contact: /));
	});
});

describe("formEndpoint", () => {
	it("builds the default path and honours a base override", () => {
		expect(formEndpoint("contact")).toBe("/internal/forms/contact");
		expect(formEndpoint("contact", "/forms")).toBe("/forms/contact");
	});
});
