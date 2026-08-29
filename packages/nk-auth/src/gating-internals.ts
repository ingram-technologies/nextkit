/**
 * Internal helpers shared by the server helpers and the middleware. Kept in a
 * zero-`next` module so neither subpath imports the other (server pulls
 * next/navigation, middleware pulls next/server — mixing them breaks the
 * respective runtimes). Not a public export.
 */

/**
 * Request header the middleware sets to the originally-requested path so a
 * server-component guard — which Next.js otherwise gives no way to learn its own
 * URL — can preserve it as a `next` param when it redirects to sign-in.
 */
export const NK_AUTH_PATH_HEADER = "x-nk-auth-path";

/**
 * Accept only an internal, non-protocol-relative path as a post-login redirect,
 * so `next` can never be turned into an open redirect to another origin.
 *
 * Beyond the `//` check, backslashes and ASCII controls must also be rejected:
 * browsers treat `\` as `/` in http(s) URLs (so `/\evil.com` resolves to
 * `https://evil.com/`) and the URL parser strips tab/newline (so an encoded
 * `/\t/evil.com` collapses to `//evil.com`).
 */
export function safeNextParam(value: string | null | undefined): string | null {
	if (!value) return null;
	if (!value.startsWith("/") || value.startsWith("//")) return null;
	// oxlint-disable-next-line no-control-regex -- rejecting control chars is the point
	if (/[\\\u0000-\u001f\u007f]/.test(value)) return null;
	return value;
}

/**
 * How a site names and validates its post-login redirect param. Shared by the
 * middleware (which writes it for the cookie-less case) and the server helpers
 * (which write it for the cookie-present-but-invalid case), so both halves agree
 * on the one contract the sign-in page reads.
 */
export interface NextParamOptions {
	/** Query param carrying the post-login destination. Default `next`. */
	nextParam?: string;
	/**
	 * Validate a candidate destination: return the value to redirect to, or null
	 * to drop it. Default {@link safeNextParam}, which admits only internal
	 * paths. A site with an existing trusted-origin allow-list plugs its own
	 * validator in here rather than forking the URL builder; whatever it admits
	 * is what its sign-in page will redirect to, so keep it as strict as
	 * `safeNextParam` on everything but the origins you own.
	 */
	isSafeNext?: (value: string) => string | null;
}

/**
 * Build a sign-in URL: `signInPath`, plus the next param (when safe) so the user
 * returns to where they were headed, plus a `stale=1` marker when a session
 * cookie is present but invalid — the signal the middleware uses to clear the
 * dead cookie.
 */
export function signInUrl(
	signInPath: string,
	opts: { next?: string | null; stale?: boolean } & NextParamOptions,
): string {
	const params = new URLSearchParams();
	const validate = opts.isSafeNext ?? safeNextParam;
	const next = opts.next ? validate(opts.next) : null;
	if (next) params.set(opts.nextParam ?? "next", next);
	if (opts.stale) params.set("stale", "1");
	const qs = params.toString();
	return qs ? `${signInPath}?${qs}` : signInPath;
}
