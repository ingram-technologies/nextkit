/**
 * Route handlers for the `/.well-known` URLs password managers look for. Each
 * resolves its target against the request, so a preview deployment points at
 * itself rather than at production.
 *
 *   // src/app/.well-known/passkey-endpoints/route.ts
 *   export const GET = passkeyEndpoints({ enroll: "/settings/security" });
 *
 *   // src/app/.well-known/change-password/route.ts
 *   export const GET = changePasswordRedirect("/settings/security");
 */

export interface PasskeyEndpointsConfig {
	/** The page where a signed-in user adds a passkey. */
	enroll: string;
	/** The page where they review and remove passkeys. Defaults to `enroll`. */
	manage?: string;
}

/**
 * `GET /.well-known/passkey-endpoints` ([W3C Passkey Endpoints](https://w3c.github.io/webappsec-passkey-endpoints/)):
 * tells Chrome, Google Password Manager, 1Password and others where to send a
 * user to create or manage a passkey for this site.
 */
export function passkeyEndpoints({ enroll, manage = enroll }: PasskeyEndpointsConfig) {
	return function GET(request: Request): Response {
		return Response.json({
			enroll: new URL(enroll, request.url).href,
			manage: new URL(manage, request.url).href,
		});
	};
}

/**
 * `GET /.well-known/change-password` ([W3C](https://w3c.github.io/webappsec-change-password-url/)):
 * a password manager that flags a weak or leaked password deep-links here.
 * Only for sites with passwords: on a passwordless site there is nothing to
 * change, so leave the URL unrouted.
 */
export function changePasswordRedirect(path: string) {
	return function GET(request: Request): Response {
		return Response.redirect(new URL(path, request.url), 302);
	};
}
