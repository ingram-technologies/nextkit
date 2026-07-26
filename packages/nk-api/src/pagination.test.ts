import { z } from "@hono/zod-openapi";
import { describe, expect, it } from "vitest";
import {
	offsetFor,
	paginate,
	paginatedResponse,
	paginationQuery,
} from "./pagination.js";

describe("pagination", () => {
	it("offsetFor is zero-based from a 1-based page", () => {
		expect(offsetFor({ page: 1, limit: 20 })).toBe(0);
		expect(offsetFor({ page: 3, limit: 20 })).toBe(40);
	});

	it("paginate wraps rows and ceils totalPages", () => {
		expect(
			paginate([{ id: "a" }, { id: "b" }], { page: 1, limit: 20, total: 21 }),
		).toEqual({
			data: [{ id: "a" }, { id: "b" }],
			pagination: { page: 1, limit: 20, total: 21, totalPages: 2 },
		});
	});

	it("paginationQuery applies defaults and coerces string params", () => {
		expect(paginationQuery.parse({})).toEqual({ page: 1, limit: 20 });
		expect(paginationQuery.parse({ page: "2", limit: "5" })).toEqual({
			page: 2,
			limit: 5,
		});
	});

	it("paginationQuery rejects a limit above the cap", () => {
		expect(paginationQuery.safeParse({ limit: "1000" }).success).toBe(false);
	});

	it("paginatedResponse validates the { data, pagination } envelope", () => {
		const schema = paginatedResponse(z.object({ id: z.string() }));
		const parsed = schema.parse({
			data: [{ id: "a" }],
			pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
		});
		expect(parsed.data[0]?.id).toBe("a");
	});
});
