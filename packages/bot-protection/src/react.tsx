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
 *
 * @example
 * const { honeypotRef, botFields } = useBotProtection("/api/contact");
 * // ...in the form:  <HoneypotInput inputRef={honeypotRef} />
 * // ...on submit:    body: JSON.stringify({ ...values, ...botFields() })
 */
export function useBotProtection(tokenEndpoint: string) {
	const [token, setToken] = useState("");
	const honeypotRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		fetch(tokenEndpoint)
			.then((res) => res.json())
			.then((data: { token?: string }) => setToken(data.token ?? ""))
			.catch(() => {});
	}, [tokenEndpoint]);

	const botFields = (): Record<string, string> => ({
		[HONEYPOT_FIELD]: honeypotRef.current?.value ?? "",
		[TOKEN_FIELD]: token,
	});

	return { honeypotRef, botFields };
}

/**
 * Visually-hidden honeypot input for {@link useBotProtection}. Real users never
 * see or fill it (off-screen, aria-hidden, tabIndex -1, autofill opted out);
 * bots that fill every field give themselves away.
 */
export function HoneypotInput({
	inputRef,
}: {
	inputRef: RefObject<HTMLInputElement | null>;
}) {
	return (
		<input
			ref={inputRef}
			type="text"
			name={HONEYPOT_FIELD}
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
