/**
 * Client for Wire (wire.ingram.tech) — the central multi-tenant newsletter
 * service. A site forwards a signup to Wire with its tenant API key
 * (`WIRE_API_KEY`, server-side only); the key resolves the tenant, and the
 * signup lands on that tenant's list. Zero-dependency (global `fetch`), so any
 * consumer can call it without pulling Wire's own stack.
 *
 * Keep the send best-effort at the call site — a Wire outage must never break
 * the site's own signup flow:
 *
 *   import { subscribeToWire } from "@ingram-tech/nk-marketing";
 *   await subscribeToWire({ email, source: "ingram.tech" }).catch((e) =>
 *     console.error("Wire forward failed:", e));
 */

export interface WireSubscribeOptions {
	email: string;
	/** List slug within the tenant. Defaults to `WIRE_LIST`, then "newsletter". */
	list?: string;
	/** Attribution for where the signup came from. */
	source?: string;
	/** Hold the subscription pending an emailed confirm link (double opt-in). */
	doubleOptIn?: boolean;
	/** Tenant API key. Defaults to `process.env.WIRE_API_KEY`. */
	apiKey?: string;
	/** Wire base URL. Defaults to `WIRE_BASE_URL`, then https://wire.ingram.tech. */
	baseUrl?: string;
}

export type WireSubscribeStatus = "subscribed" | "pending" | "already";

/**
 * Forward a signup to Wire. Returns the resulting status, or `null` when no API
 * key is configured (so a site with Wire unset simply no-ops). Throws on a
 * transport/HTTP error — wrap at the call site to keep it best-effort.
 */
export async function subscribeToWire(
	opts: WireSubscribeOptions,
): Promise<WireSubscribeStatus | null> {
	const apiKey = opts.apiKey ?? process.env.WIRE_API_KEY;
	if (!apiKey) return null;
	const baseUrl =
		opts.baseUrl ?? process.env.WIRE_BASE_URL ?? "https://wire.ingram.tech";

	const res = await fetch(`${baseUrl}/api/subscribe`, {
		method: "POST",
		headers: {
			authorization: `Bearer ${apiKey}`,
			"content-type": "application/json",
		},
		body: JSON.stringify({
			email: opts.email,
			list: opts.list ?? process.env.WIRE_LIST,
			source: opts.source,
			doubleOptIn: opts.doubleOptIn,
		}),
	});
	if (!res.ok) {
		const detail = await res.text().catch(() => "");
		throw new Error(`Wire subscribe failed: ${res.status} ${detail}`.trim());
	}
	const data = (await res.json().catch(() => ({}))) as {
		status?: WireSubscribeStatus;
	};
	return data.status ?? null;
}
