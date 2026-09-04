import type { VerifyOptions } from "./bot/verify.js";
import {
	type FormSchema,
	handleFormSubmission,
	type RateLimitDecision,
} from "./handler.js";
import { mintFormToken } from "./token.js";

interface Loggerish {
	warn(message: string): void;
	error(message: string, error?: unknown): void;
}

/** A per-form rate-limit budget; the store and the key are the site's. */
export interface RateLimitBudget {
	/** Submissions allowed per window. */
	limit: number;
	/** Window length in milliseconds. */
	windowMs: number;
}

/** What the site's limiter is asked; it decides how to key (IP, session, …). */
export interface FormRateLimitContext extends RateLimitBudget {
	request: Request;
	/** The registry key, ready to namespace the store key ("contact:<ip>"). */
	form: string;
}

export interface FormDefinition<T> {
	/** Validates (and narrows) the submission. Zod strips bot-protection fields. */
	schema: FormSchema<T>;
	/** Deliver the validated submission: send an email, subscribe an address, … */
	onSubmit: (data: T) => void | Promise<void>;
	/** Override the handler-wide budget for this form. */
	rateLimit?: RateLimitBudget;
	/** Override the handler-wide bot-protection options for this form. */
	verify?: Omit<VerifyOptions, "formData">;
}

/**
 * An opaque registry entry. Produced by {@link defineForm}, which exists so the
 * schema's output type flows into `onSubmit` per entry — a plain object literal
 * inside a `Record` would contextually type every `onSubmit` as `unknown`.
 */
export interface FormEntry {
	/** @internal */
	run(request: Request, form: string, shared: FormsHandlerOptions): Promise<Response>;
}

export const defineForm = <T>(definition: FormDefinition<T>): FormEntry => ({
	run: (request, form, shared) => {
		const limiter = shared.rateLimit;
		const budget =
			definition.rateLimit ?? shared.rateLimitDefaults ?? DEFAULT_BUDGET;
		return handleFormSubmission(request, {
			schema: definition.schema,
			onSubmit: definition.onSubmit,
			label: form,
			logger: shared.logger,
			verify: definition.verify ?? shared.verify,
			rateLimit: limiter && (() => limiter({ request, form, ...budget })),
		});
	},
});

export type FormRegistry = Record<string, FormEntry>;

export interface FormsHandlerOptions {
	/**
	 * The site's rate limiter. nk-forms owns no store: it tells you the form,
	 * the request and the budget, and you answer with a decision keyed however
	 * you like. Omit it and no rate limiting runs.
	 */
	rateLimit?: (
		context: FormRateLimitContext,
	) => RateLimitDecision | Promise<RateLimitDecision>;
	/** Budget for forms that don't set their own. Default: 5 per 10 minutes. */
	rateLimitDefaults?: RateLimitBudget;
	/** Bot-protection options for forms that don't set their own. */
	verify?: Omit<VerifyOptions, "formData">;
	/** Where dropped/failed submissions are logged. Defaults to no logging. */
	logger?: Loggerish;
}

const DEFAULT_BUDGET: RateLimitBudget = { limit: 5, windowMs: 10 * 60 * 1000 };

const notFound = (): Response =>
	new Response(JSON.stringify({ error: "Not found." }), {
		status: 404,
		headers: { "content-type": "application/json" },
	});

/**
 * The form name is the last path segment of the request URL, so the handler
 * works from any dynamic route file without depending on how the framework
 * passes params (Next's `params` shape has changed across majors).
 */
const formNameFrom = (request: Request): string => {
	const segments = new URL(request.url).pathname.split("/").filter(Boolean);
	return decodeURIComponent(segments.at(-1) ?? "");
};

export interface FormsHandler {
	GET: (request: Request) => Response;
	POST: (request: Request) => Promise<Response>;
}

/**
 * One route file for every public form on the site. Mount it at
 * `app/internal/forms/[form]/route.ts`:
 *
 *   export const { GET, POST } = createFormsHandler(
 *     {
 *       contact: defineForm({ schema, onSubmit }),
 *       newsletter: defineForm({ schema, onSubmit, rateLimit: { limit: 3, windowMs: 3_600_000 } }),
 *     },
 *     { rateLimit, logger },
 *   );
 *
 * GET `/internal/forms/<name>` mints the timing token; POST runs
 * {@link handleFormSubmission} for that entry, with the log label and rate-limit
 * namespace derived from the name. Unknown names are 404 on both methods.
 * Adding a form is adding an entry — the client side is
 * `useFormSubmit(formEndpoint("contact"))`.
 */
export const createFormsHandler = (
	forms: FormRegistry,
	options: FormsHandlerOptions = {},
): FormsHandler => {
	const lookup = (request: Request): [string, FormEntry] | undefined => {
		const name = formNameFrom(request);
		const entry = Object.hasOwn(forms, name) ? forms[name] : undefined;
		return entry ? [name, entry] : undefined;
	};
	return {
		GET: (request) => (lookup(request) ? mintFormToken() : notFound()),
		POST: async (request) => {
			const found = lookup(request);
			if (!found) {
				options.logger?.warn(`forms: unknown form "${formNameFrom(request)}"`);
				return notFound();
			}
			const [name, entry] = found;
			return entry.run(request, name, options);
		},
	};
};
