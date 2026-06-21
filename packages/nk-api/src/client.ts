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

// Structural minimum so both a fetch `Response` and a typed `hc` `ClientResponse`
// (which is not declared as a `Response` subtype) are accepted.
type JsonReadable = { json(): Promise<unknown> };

/**
 * Parse the JSON body of a failed response into the standard `{ error }` shape.
 * Falls back to `{}` for non-JSON / empty bodies (gateway pages, network errors).
 */
export const parseErrorBody = async (
	response: JsonReadable,
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
 * Use this for responses you don't read a body from (e.g. a 204 delete); use
 * {@link unwrap} when you want the success body back.
 */
export const assertResponseOk = async (
	response: { ok: boolean } & JsonReadable,
	fallbackMessage: string,
) => {
	if (!response.ok) {
		const body = await parseErrorBody(response);
		throw new Error(body.error || fallbackMessage);
	}
};

// The success-body type of a typed `hc` response union: `ClientResponse.ok` is
// literally `true` only for 2xx members, and `json()` resolves to that member's
// body, so this picks exactly the 2xx body out of the union.
type UnwrapBody<R> = R extends { ok: true; json: () => Promise<infer T> } ? T : never;

/**
 * Await a typed `hc` call and return its success body, or throw a descriptive
 * `Error` built from the `{ error }` envelope when the response is not ok. This
 * collapses the `if (res.ok) { … } else throw` narrowing dance that every
 * body-returning typed-client call would otherwise repeat:
 *
 * ```ts
 * const created = await unwrap(
 *   api.things.$post({ json }),
 *   "Failed to create thing",
 * );
 * // `created` is the 2xx body, fully typed.
 * ```
 *
 * Accepts the response or a promise of it, so you can pass the `$post(...)` call
 * directly without awaiting first.
 */
export async function unwrap<R extends { ok: boolean } & JsonReadable>(
	response: R | Promise<R>,
	fallbackMessage: string,
): Promise<UnwrapBody<R>> {
	const res = await response;
	if (!res.ok) {
		const body = await parseErrorBody(res);
		throw new Error(body.error || fallbackMessage);
	}
	return (await res.json()) as UnwrapBody<R>;
}
