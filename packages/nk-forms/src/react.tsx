"use client";

import { useState } from "react";
import { useBotProtection } from "@ingram-tech/bot-protection/react";

// Re-export the primitives so a form component needs a single import.
export { HoneypotInput, useBotProtection } from "@ingram-tech/bot-protection/react";

export type FormSubmitStatus = "idle" | "submitting" | "success" | "error";

export interface FormSubmitResult {
	ok: boolean;
	data?: unknown;
}

const getErrorMessage = (data: unknown): string | null => {
	if (
		typeof data === "object" &&
		data !== null &&
		"error" in data &&
		typeof (data as { error: unknown }).error === "string"
	) {
		return (data as { error: string }).error;
	}
	return null;
};

/**
 * One-import client wiring for a form that POSTs JSON to `endpoint`.
 *
 * Wraps {@link useBotProtection} (timing token + honeypot ref) and owns submit
 * status so the component only renders markup. The route's GET mints the token
 * (`mintFormToken`) and its POST runs `handleFormSubmission`.
 *
 * @example
 * const { honeypotRef, submit, status, error } = useFormSubmit("/api/contact");
 * // in the form:  <HoneypotInput inputRef={honeypotRef} />
 * // on submit:    const res = await submit({ name, email, message });
 * //               if (res.ok) setSent(true);
 */
export function useFormSubmit(endpoint: string, options?: { honeypotField?: string }) {
	const { honeypotRef, botFields, ready } = useBotProtection(endpoint, options);
	const [status, setStatus] = useState<FormSubmitStatus>("idle");
	const [error, setError] = useState<string | null>(null);

	const submit = async (
		values: Record<string, unknown>,
	): Promise<FormSubmitResult> => {
		setStatus("submitting");
		setError(null);
		try {
			const res = await fetch(endpoint, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ ...values, ...botFields() }),
			});
			const data: unknown = await res.json().catch(() => ({}));
			if (!res.ok) {
				throw new Error(
					getErrorMessage(data) ?? "Something went wrong. Please try again.",
				);
			}
			setStatus("success");
			return { ok: true, data };
		} catch (submitError) {
			setStatus("error");
			setError(
				submitError instanceof Error
					? submitError.message
					: "Something went wrong. Please try again.",
			);
			return { ok: false };
		}
	};

	return { honeypotRef, botFields, ready, status, error, submit };
}
