/**
 * Thin wrapper around Vercel BotID's server check.
 *
 * `botid` is an optional peer dependency, and BotID only does real work on
 * Vercel. We import it dynamically via a non-literal specifier so:
 *   - the package builds without `botid` installed, and
 *   - if it isn't installed (or the call throws off-Vercel/in dev), we degrade
 *     to "not a bot" rather than blocking real users.
 *
 * App-side wiring (per site, not in this package): add `withBotId(nextConfig)`
 * in next.config and `initBotId({ protect: [...] })` in instrumentation-client.
 */

export const checkBot = async (): Promise<{ isBot: boolean }> => {
	try {
		// Non-literal specifier: keeps tsc from requiring `botid` at build time.
		const specifier = "botid/server";
		const mod = (await import(specifier)) as {
			checkBotId: () => Promise<{ isBot: boolean }>;
		};
		return await mod.checkBotId();
	} catch {
		return { isBot: false };
	}
};
