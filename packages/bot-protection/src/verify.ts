import { checkBot } from "./botid.js";
import { HONEYPOT_FIELD, TOKEN_FIELD } from "./fields.js";
import { isConfigured } from "./keys.js";
import { type TokenCheck, verifyFormToken } from "./token.js";

export interface VerifyResult {
	ok: boolean;
	/** Which layer rejected: "honeypot" | token reason | "botid". */
	reason?: string;
}

export interface VerifyOptions {
	/** Submitted form data — a FormData or a plain object. */
	formData: FormData | Record<string, unknown>;
	/** Timing window for the signed token. */
	timing?: TokenCheck;
	/** Run the Vercel BotID layer (default true). Set false to skip. */
	botid?: boolean;
	/**
	 * Honeypot field name to check. Must match the `field` rendered by
	 * `<HoneypotField/>`. Defaults to {@link HONEYPOT_FIELD}.
	 */
	honeypotField?: string;
}

const getField = (formData: VerifyOptions["formData"], name: string): string => {
	const value =
		formData instanceof FormData
			? formData.get(name)
			: (formData as Record<string, unknown>)[name];
	return typeof value === "string" ? value : "";
};

/**
 * Run all configured layers in order (cheapest first):
 *   1. honeypot — the hidden field must be empty
 *   2. signed timing token — valid signature + plausible timing
 *   3. Vercel BotID — optional, invisible
 *
 * Returns `{ ok: false, reason }` on the first failure. Callers should treat a
 * failure as "silently drop" (respond 200 without acting) so bots aren't told
 * what tripped them.
 */
export const verifyHuman = async (options: VerifyOptions): Promise<VerifyResult> => {
	const honeypotField = options.honeypotField ?? HONEYPOT_FIELD;
	// trim(): whitespace-only values pass the trap on purpose — some browser
	// autofill/extension quirks insert stray spaces, and per the "never punish
	// real users" ethos that's a weaker trap, not a false positive.
	if (getField(options.formData, honeypotField).trim() !== "") {
		return { ok: false, reason: "honeypot" };
	}

	// Timing layer only applies when a secret is configured; otherwise it's
	// disabled (honeypot + BotID still run) so a misconfigured site keeps working.
	if (isConfigured()) {
		const token = verifyFormToken(
			getField(options.formData, TOKEN_FIELD),
			options.timing,
		);
		if (!token.ok) return token;
	}

	if (options.botid !== false) {
		const { isBot } = await checkBot();
		if (isBot) return { ok: false, reason: "botid" };
	}

	return { ok: true };
};
