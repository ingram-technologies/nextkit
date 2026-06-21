import { createRoute, z } from "@hono/zod-openapi";
import { describe, expect, it } from "vitest";
import { createApiApp } from "./app";
import { HttpError, jsonBody, jsonContent } from "./errors";
import { createRouter } from "./router";
import { assertResponseOk, hc, unwrap } from "./client";

const routes = createRouter()
	.openapi(
		createRoute({
			method: "post",
			path: "/things",
			request: { body: jsonBody(z.object({ name: z.string() })) },
			responses: {
				201: jsonContent(
					z.object({ id: z.string(), name: z.string() }),
					"created",
				),
				400: jsonContent(z.object({ error: z.string() }), "bad"),
			},
		}),
		(c) => {
			const { name } = c.req.valid("json");
			if (!name) throw new HttpError(400, "name required");
			return c.json({ id: "t1", name }, 201);
		},
	)
	.openapi(
		createRoute({
			method: "delete",
			path: "/things/{id}",
			request: {
				params: z.object({
					id: z.string().openapi({ param: { name: "id", in: "path" } }),
				}),
			},
			responses: {
				204: { description: "gone" },
				404: { description: "missing" },
			},
		}),
		(c) => {
			if (c.req.valid("param").id === "missing") {
				throw new HttpError(404, "no such thing");
			}
			return c.body(null, 204);
		},
	);

const app = createApiApp({ title: "T", version: "1.0.0", basePath: "/api/v1" }).route(
	"/",
	routes,
);
const client = hc<typeof app>("http://local", {
	fetch: (input: RequestInfo | URL, init?: RequestInit) => app.request(input, init),
});

describe("unwrap", () => {
	it("returns the typed success body", async () => {
		const created = await unwrap(
			client.api.v1.things.$post({ json: { name: "Widget" } }),
			"Failed to create thing",
		);
		// Type-level: `created` is the 201 body, so `.name` is a string.
		const name: string = created.name;
		expect(created).toEqual({ id: "t1", name: "Widget" });
		expect(name).toBe("Widget");
	});

	it("throws the envelope error message on a non-ok response", async () => {
		await expect(
			unwrap(
				client.api.v1.things.$post({ json: { name: "" } }),
				"Failed to create thing",
			),
		).rejects.toThrow("name required");
	});

	it("falls back to the provided message when the body has no error field", async () => {
		const bare = { ok: false, json: () => Promise.resolve({}) };
		await expect(unwrap(bare, "Fallback message")).rejects.toThrow(
			"Fallback message",
		);
	});
});

describe("assertResponseOk", () => {
	it("accepts a typed hc response and throws the envelope error", async () => {
		const res = await client.api.v1.things[":id"].$delete({
			param: { id: "missing" },
		});
		await expect(assertResponseOk(res, "Failed to delete")).rejects.toThrow(
			"no such thing",
		);
	});

	it("does not throw on a 204", async () => {
		const res = await client.api.v1.things[":id"].$delete({
			param: { id: "present" },
		});
		await expect(
			assertResponseOk(res, "Failed to delete"),
		).resolves.toBeUndefined();
	});
});
