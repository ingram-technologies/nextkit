"use client";

import { type RefObject, useEffect, useRef, useState } from "react";
import { HONEYPOT_FIELD, TOKEN_FIELD } from "./fields.js";

/**
 * Client-side bot protection for forms that POST JSON to your own route.
 *
 * Fetches a signed timing token from `tokenEndpoint` on mount — the route's GET
 * handler should return `{ token: createFormToken() }` — then exposes a honeypot
 * ref plus a `botFields()` helper returning the fields to spread into the
 * request body. The matching POST handler calls `verifyHuman({ formData: body })`.
 *
 * Pair with {@link HoneypotInput}, which renders the trap and wires the ref.
 *
 * @param tokenEndpoint - GET route that mints the token (e.g. "/api/contact").
 * @param options.honeypotField - Override the trap field name; must match the
 *   server's `verifyHuman({ honeypotField })` and the `<HoneypotInput name>`.
 *
 * @example
 * const { honeypotRef, botFields, ready } = useBotProtection("/api/contact");
 * // ...in the form:  <HoneypotInput inputRef={honeypotRef} />
 * // ...on submit:    body: JSON.stringify({ ...values, ...botFields() })
 * // Optionally gate the submit button on `ready` — an empty token is
 * // silently dropped server-side, so submitting before the token resolves
 * // loses the message.
 */
export function useBotProtection(
	tokenEndpoint: string,
	options?: { honeypotField?: string },
) {
	const [token, setToken] = useState("");
	const honeypotField = options?.honeypotField ?? HONEYPOT_FIELD;
	const honeypotRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		let cancelled = false;
		const load = async (): Promise<void> => {
			// One retry: a transiently failed fetch would otherwise leave the token
			// empty forever, and the server then silently drops a REAL user's
			// submission — the exact failure mode this package promises to avoid.
			for (let attempt = 0; attempt < 2 && !cancelled; attempt++) {
				try {
					const res = await fetch(tokenEndpoint);
					if (!res.ok) throw new Error(`HTTP ${res.status}`);
					const data: unknown = await res.json();
					if (
						typeof data === "object" &&
						data !== null &&
						"token" in data &&
						typeof data.token === "string" &&
						data.token !== ""
					) {
						if (!cancelled) setToken(data.token);
						return;
					}
				} catch {
					// fall through to retry
				}
			}
		};
		void load();
		return () => {
			cancelled = true;
		};
	}, [tokenEndpoint]);

	const botFields = (): Record<string, string> => ({
		[honeypotField]: honeypotRef.current?.value ?? "",
		[TOKEN_FIELD]: token,
	});

	// `ready` = the timing token resolved. Not required — the server treats a
	// missing token as bot-ish — but lets forms wait instead of losing input.
	return { honeypotRef, botFields, ready: token !== "" };
}

/**
 * Visually-hidden honeypot input for {@link useBotProtection}. Real users never
 * see or fill it (off-screen, aria-hidden, tabIndex -1, autofill opted out);
 * bots that fill every field give themselves away.
 */
export function HoneypotInput({
	inputRef,
	name = HONEYPOT_FIELD,
}: {
	inputRef: RefObject<HTMLInputElement | null>;
	/** Must match `useBotProtection`'s `honeypotField` when overridden. */
	name?: string;
}) {
	return (
		<input
			ref={inputRef}
			type="text"
			name={name}
			tabIndex={-1}
			autoComplete="off"
			aria-hidden="true"
			defaultValue=""
			// Major password managers honor these — keeps autofill out of the trap.
			data-1p-ignore
			data-lpignore="true"
			data-form-type="other"
			style={{
				position: "absolute",
				left: "-9999px",
				width: "1px",
				height: "1px",
				overflow: "hidden",
			}}
		/>
	);
}
