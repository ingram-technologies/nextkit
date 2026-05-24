import { checkBot } from "./botid";
import { HONEYPOT_FIELD, TOKEN_FIELD } from "./fields";
import { type TokenCheck, verifyFormToken } from "./token";

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
	if (getField(options.formData, HONEYPOT_FIELD).trim() !== "") {
		return { ok: false, reason: "honeypot" };
	}

	const token = verifyFormToken(
		getField(options.formData, TOKEN_FIELD),
		options.timing,
	);
	if (!token.ok) return token;

	if (options.botid !== false) {
		const { isBot } = await checkBot();
		if (isBot) return { ok: false, reason: "botid" };
	}

	return { ok: true };
};
