import { createFormToken } from "./bot/timing-token.js";

/**
 * Ready-made GET handler that mints the signed timing token the client hook
 * fetches on mount. `createFormsHandler` wires it for you; for a standalone
 * form route, one line:
 *
 *   export { mintFormToken as GET } from "@ingram-tech/nk-forms";
 *
 * or alongside other GET logic:  `export const GET = () => mintFormToken();`
 *
 * Returns `{ token: "" }` when `BOT_PROTECTION_SECRET` is unset (the timing
 * layer is simply disabled — honeypot + BotID still run).
 */
export const mintFormToken = (): Response =>
	new Response(JSON.stringify({ token: createFormToken() }), {
		headers: { "content-type": "application/json" },
	});
