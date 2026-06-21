/**
 * Browser/client entry (`@ingram-tech/nk-api/client`). Deliberately tiny and
 * free of any server imports (no `@hono/zod-openapi`, no `@hono/swagger-ui`) so
 * importing it never drags server code into the client bundle.
 *
 * ```ts
 * import { hc } from "@ingram-tech/nk-api/client";
 * import type { AppType } from "@/api/http/app"; // type-only: erased at build
 * export const api = hc<AppType>("/").api.v1;
 * ```
 */
export { hc } from "hono/client";

/**
 * Parse the JSON body of a failed response into the standard `{ error }` shape.
 * Falls back to `{}` for non-JSON / empty bodies (gateway pages, network errors).
 */
export const parseErrorBody = async (
	response: Response,
): Promise<{ error?: string }> => {
	try {
		return (await response.json()) as { error?: string };
	} catch {
		return {};
	}
};

/**
 * Assert a fetch/`hc` response succeeded, throwing a descriptive `Error`
 * otherwise. Extracts the envelope's `error` field; falls back to `fallbackMessage`.
 */
export const assertResponseOk = async (response: Response, fallbackMessage: string) => {
	if (!response.ok) {
		const body = await parseErrorBody(response);
		throw new Error(body.error || fallbackMessage);
	}
};
