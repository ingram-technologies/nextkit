/**
 * Pagination primitives for list endpoints, so the offset math and the
 * `{ data, pagination }` envelope are written once instead of re-derived per
 * resource.
 *
 * ```ts
 * import { createRoute, z } from "@hono/zod-openapi";
 * import { jsonContent, paginatedResponse, paginationQuery, paginate, offsetFor } from "@ingram-tech/nk-api";
 *
 * const listRoute = createRoute({
 *   method: "get",
 *   path: "/things",
 *   request: { query: paginationQuery.extend({ type: z.string().optional() }) },
 *   responses: { 200: jsonContent(paginatedResponse(thingSchema), "Paginated things") },
 * });
 *
 * // in the handler:
 * const { page, limit } = c.req.valid("query");
 * const rows = await query.range(offsetFor({ page, limit }), offsetFor({ page, limit }) + limit - 1);
 * return c.json(paginate(rows, { page, limit, total }), 200);
 * ```
 */
import { z } from "@hono/zod-openapi";

/** Standard `page`/`limit` query params (1-based page, limit capped at 100). */
export const paginationQuery = z.object({
	page: z.coerce.number().int().min(1).default(1),
	limit: z.coerce.number().int().min(1).max(100).default(20),
});

/** The `{ page, limit, total, totalPages }` block returned alongside `data`. */
export const paginationMetaSchema = z.object({
	page: z.number().int(),
	limit: z.number().int(),
	total: z.number().int(),
	totalPages: z.number().int(),
});

/** A `{ data: item[], pagination }` response schema for a list of `item`. */
export function paginatedResponse<T extends z.ZodType>(item: T) {
	return z.object({ data: z.array(item), pagination: paginationMetaSchema });
}

/** Zero-based row offset for a `{ page, limit }` (page is 1-based). */
export function offsetFor({ page, limit }: { page: number; limit: number }): number {
	return (page - 1) * limit;
}

/** Wrap a page of rows and the total count into the `{ data, pagination }` shape. */
export function paginate<T>(
	data: T[],
	{ page, limit, total }: { page: number; limit: number; total: number },
): {
	data: T[];
	pagination: { page: number; limit: number; total: number; totalPages: number };
} {
	return {
		data,
		pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
	};
}
