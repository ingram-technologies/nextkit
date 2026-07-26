import { createRoute } from "@hono/zod-openapi";
import { afterEach, describe, expect, it } from "vitest";
import { createApiApp } from "./app.js";
import { createRouter } from "./router.js";
import { setDefaultErrorLogger } from "./errors.js";

const crashApp = () =>
	createApiApp({ title: "T", version: "1.0.0", basePath: "/api/v1" }).route(
		"/",
		createRouter().openapi(
			createRoute({
				method: "get",
				path: "/crash",
				responses: { 200: { description: "ok" } },
			}),
			() => {
				throw new Error("kaboom");
			},
		),
	);

describe("setDefaultErrorLogger", () => {
	afterEach(() => {
		// Reset the module-level logger so this test doesn't leak into others.
		setDefaultErrorLogger((err) => console.error("[nk-api] unhandled error:", err));
	});

	it("routes unhandled crashes from a mounted router to the configured logger", async () => {
		const seen: unknown[] = [];
		setDefaultErrorLogger((err) => seen.push(err));

		const res = await crashApp().request("/api/v1/crash");
		expect(res.status).toBe(500);
		expect(await res.json()).toEqual({ error: "Internal server error" });
		expect(seen).toHaveLength(1);
		expect(seen[0]).toBeInstanceOf(Error);
	});
});
