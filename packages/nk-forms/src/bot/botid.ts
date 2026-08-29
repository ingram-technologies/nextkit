/**
 * Thin wrapper around Vercel BotID's server check.
 *
 * `botid` is an optional peer dependency, and BotID only does real work on
 * Vercel. We import it dynamically via a non-literal specifier so:
 *   - the package builds without `botid` installed, and
 *   - if it isn't installed (or the call throws off-Vercel/in dev), we degrade
 *     to "not a bot" rather than blocking real users.
 *
 * The degrade is logged once per process: bundler file-tracing can exclude
 * `botid/server` from a deployed function even when the package is installed
 * (nothing imports it statically), and a silently disabled layer 3 is
 * otherwise indistinguishable from "no bots today".
 *
 * App-side wiring (per site, not in this package): add `withBotId(nextConfig)`
 * in next.config and `initBotId({ protect: [...] })` in instrumentation-client.
 */

let warnedUnavailable = false;

const warnOnce = (detail: string): void => {
	if (warnedUnavailable) return;
	warnedUnavailable = true;
	console.warn(
		`@ingram-tech/nk-forms: BotID layer unavailable, degrading to "not a bot" (${detail}).`,
	);
};

export const checkBot = async (): Promise<{ isBot: boolean }> => {
	try {
		// Non-literal specifier: keeps tsc from requiring `botid` at build time.
		const specifier = "botid/server";
		// Shape-checked below rather than trusted — the cast only names what we
		// probe for.
		const mod = (await import(specifier)) as {
			checkBotId?: () => Promise<{ isBot?: boolean } | null | undefined>;
		};
		if (typeof mod.checkBotId !== "function") {
			warnOnce("botid/server has no checkBotId export");
			return { isBot: false };
		}
		const result = await mod.checkBotId();
		return { isBot: result?.isBot === true };
	} catch (error) {
		warnOnce(error instanceof Error ? error.message : String(error));
		return { isBot: false };
	}
};
