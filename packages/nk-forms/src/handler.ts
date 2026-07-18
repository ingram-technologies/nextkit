import { verifyHuman, type VerifyOptions } from "@ingram-tech/bot-protection";

/**
 * Decision returned by a caller-supplied rate limiter. nk-forms owns no store —
 * you plug in your own (per-IP, per-user, Redis, in-memory) and just tell the
 * handler whether this request may proceed.
 */
export interface RateLimitDecision {
	ok: boolean;
	/** Milliseconds until the caller may retry; surfaced as a Retry-After header. */
	retryAfterMs?: number;
}

/**
 * The one method the handler needs from a validator. Any Zod schema satisfies
 * this structurally, so nk-forms never depends on (or pins) a Zod version.
 */
export interface FormSchema<T> {
	safeParse(input: unknown): { success: true; data: T } | { success: false };
}

interface Loggerish {
	warn(message: string): void;
	error(message: string, error?: unknown): void;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null;

export interface FormHandlerOptions<T> {
	/** Validates (and narrows) the submission. Zod strips bot-protection fields. */
	schema: FormSchema<T>;
	/** Deliver the validated submission: send an email, subscribe an address, … */
	onSubmit: (data: T) => void | Promise<void>;
	/** Optional gate run before the body is read. Return `ok: false` to 429. */
	rateLimit?: () => RateLimitDecision | Promise<RateLimitDecision>;
	/** Bot-protection layers, forwarded to `verifyHuman` (minus `formData`). */
	verify?: Omit<VerifyOptions, "formData">;
	/** Where dropped/failed submissions are logged. Defaults to no logging. */
	logger?: Loggerish;
	/** Label used in log lines (e.g. "contact", "newsletter"). */
	label?: string;
}

const json = (data: unknown, status = 200): Response =>
	new Response(JSON.stringify(data), {
		status,
		headers: { "content-type": "application/json" },
	});

// Bot hits and honest submissions return the SAME 200 body — a dropped bot must
// never be able to tell it was dropped, and a real user is never shown an error.
const SUCCESS = { success: true } as const;

/**
 * The contact/signup submission pipeline, in fixed order:
 *
 *   1. rate limit      → 429 (optional; cheapest, no body needed)
 *   2. parse JSON body → 400 on malformed input
 *   3. bot gate        → silent 200 (honeypot + timing token + Vercel BotID)
 *   4. schema validate → 400 on invalid fields
 *   5. deliver         → 500 if `onSubmit` throws
 *   6. success         → 200 { success: true }
 *
 * Returns a web-standard `Response`, which Next.js route handlers accept
 * directly — nk-forms takes no `next` dependency. Pair with `mintFormToken` as
 * the route's GET and `useFormSubmit`/`useBotProtection` on the client.
 */
export const handleFormSubmission = async <T>(
	request: Request,
	options: FormHandlerOptions<T>,
): Promise<Response> => {
	const label = options.label ?? "form";
	const log = options.logger;

	// 1. Rate limit — before touching the body so floods are cheap to reject.
	if (options.rateLimit) {
		const decision = await options.rateLimit();
		if (!decision.ok) {
			const headers: Record<string, string> = {
				"content-type": "application/json",
			};
			if (decision.retryAfterMs !== undefined) {
				headers["retry-after"] = Math.ceil(
					decision.retryAfterMs / 1000,
				).toString();
			}
			return new Response(
				JSON.stringify({
					error: "Too many requests. Please try again later.",
				}),
				{ status: 429, headers },
			);
		}
	}

	// 2. Read the JSON body.
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: "Invalid request." }, 400);
	}
	if (!isRecord(body)) {
		return json({ error: "Invalid request." }, 400);
	}

	// 3. Bot gate. On failure, *pretend success* — never tell a bot what tripped
	//    it, never punish a real user with a visible error.
	const verdict = await verifyHuman({
		...options.verify,
		formData: body,
	});
	if (!verdict.ok) {
		log?.warn(`${label}: dropped by bot protection (${verdict.reason})`);
		return json(SUCCESS);
	}

	// 4. Validate. A well-behaved schema strips the bot-protection fields.
	const parsed = options.schema.safeParse(body);
	if (!parsed.success) {
		return json({ error: "Invalid form data. Please check your input." }, 400);
	}

	// 5. Deliver.
	try {
		await options.onSubmit(parsed.data);
	} catch (error) {
		log?.error(`${label}: delivery failed`, error);
		return json({ error: "Failed to submit. Please try again later." }, 500);
	}

	return json(SUCCESS);
};
