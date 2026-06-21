/**
 * Next.js adapter — kept in its own entry (`@ingram-tech/nk-api/next`) so the
 * core stays framework-agnostic (a standalone `@hono/node-server` service uses
 * `app.fetch` directly and never pulls `hono/vercel`).
 *
 * ```ts
 * // app/api/v1/[[...route]]/route.ts
 * import { createNextHandlers } from "@ingram-tech/nk-api/next";
 * import { app } from "@/api/http/app";
 * export const { GET, POST, PATCH, PUT, DELETE, OPTIONS } = createNextHandlers(app);
 * ```
 */
import { handle } from "hono/vercel";

/** Wrap a Hono app into the per-verb handlers a Next catch-all route exports.
 *  The app declares its own base path, so the catch-all just forwards. */
export function createNextHandlers(app: Parameters<typeof handle>[0]) {
	const h = handle(app);
	return { GET: h, POST: h, PATCH: h, PUT: h, DELETE: h, OPTIONS: h, HEAD: h };
}
