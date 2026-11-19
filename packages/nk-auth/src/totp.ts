/**
 * Everything an authenticator-app enrolment screen shows, from the `totpURI`
 * Better Auth's `twoFactor.enable` returns. A bare URI is unusable on its own:
 * phone authenticators expect a QR code, a password manager on the same device
 * opens an `otpauth://` link, and someone typing it in needs just the key.
 * Pure, so it runs in a server or client component alike.
 *
 *   const { qr, uri, secretGroups } = totpEnrollment(data.totpURI);
 *   <svg viewBox={`0 0 ${qr.size} ${qr.size}`} shapeRendering="crispEdges">
 *     <path d={qr.path} fill="currentColor" />
 *   </svg>
 *   <a href={uri}>Open in your authenticator</a>
 *   <code>{secretGroups.join(" ")}</code>
 */
import { encode } from "uqr";

export interface TotpEnrollment {
	/** The `otpauth://` URI, for an `<a href>`: authenticator apps and password managers register for the scheme. */
	uri: string;
	/** The base32 shared secret. */
	secret: string;
	/** The secret in groups of four, the way authenticator apps lay it out for typing. */
	secretGroups: string[];
	/** The issuer the app will list the entry under, when the URI names one. */
	issuer: string | null;
	/** The account label (usually the email), when the URI names one. */
	account: string | null;
	/**
	 * The QR code as one SVG path in a `size`×`size` grid, quiet zone included.
	 * Draw it dark on a light background; scanners need the contrast.
	 */
	qr: { size: number; path: string };
}

/** Parse an `otpauth://totp/…` URI into what an enrolment screen renders. */
export function totpEnrollment(uri: string): TotpEnrollment {
	const url = new URL(uri);
	if (url.protocol !== "otpauth:") {
		throw new TypeError(
			`totpEnrollment: expected an otpauth:// URI, got ${url.protocol}`,
		);
	}
	const secret = url.searchParams.get("secret") ?? "";
	const label = decodeURIComponent(url.pathname.replace(/^\//, ""));
	const colon = label.indexOf(":");
	const account = (colon === -1 ? label : label.slice(colon + 1)).trim() || null;
	const issuer =
		url.searchParams.get("issuer") ?? (colon === -1 ? null : label.slice(0, colon));

	const { size, data } = encode(uri, { ecc: "M", border: 4 });
	let path = "";
	data.forEach((row, y) => {
		row.forEach((on, x) => {
			if (on) path += `M${x} ${y}h1v1h-1z`;
		});
	});

	return {
		uri,
		secret,
		secretGroups: secret.match(/.{1,4}/g) ?? [],
		issuer,
		account,
		qr: { size, path },
	};
}
