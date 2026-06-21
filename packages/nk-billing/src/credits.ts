/**
 * The in-app credit ledger — the stateful half of nk-billing, for sites that
 * meter usage in abstract "credits" rather than money (integrain). It follows
 * nextkit's Django-app model: this package owns its tables and ships their
 * migration (`migrations/0001_billing.sql`), and takes the database connection by
 * **injection** so it never reaches into the consuming site's schema.
 *
 * Tenancy is the *caller's* concern, deliberately. Every function takes a
 * `Queryable` (a `pg` client / pool, or nk-db's query interface) and the caller
 * wraps the call in whatever isolation it uses — `withTenant(orgId, db => …)`
 * under RLS, or a plain transaction under app-layer filtering. That is why the
 * spend path is exposed as `spendCredits(db, …)` you call inside your own
 * transaction, mirroring how a site charges atomically with the row it inserts.
 *
 * The ledger is keyed by an opaque `tenantId` — use whatever the site bills per
 * (org id, user id). The trial grant is folded into the first spend: the first
 * touch for a tenant lazily creates its row with the trial credits and stamps the
 * trial clock, so a brand-new workspace gets its trial without a separate
 * provisioning step.
 */

import { BillingError, type DenyReason } from "./errors.js";
import { ACTIVE_SUBSCRIPTION_STATUSES } from "./status.js";

export { BillingError, type DenyReason, denyMessage } from "./errors.js";

/** The minimal database surface the ledger needs — satisfied by a `pg`
 *  Pool/PoolClient and by nk-db's query helpers. */
export interface Queryable {
	// R is intentionally unconstrained so a structural `pg` Pool/PoolClient and
	// nk-db's query helpers both satisfy this interface, and our own row types
	// (which don't carry an index signature) can be passed as R.
	query<R = Record<string, unknown>>(
		sql: string,
		params?: unknown[],
	): Promise<{ rows: R[] }>;
}

/** Trial config for the lazy first-spend grant. Omit to disable trials (a tenant
 *  with no subscription is then simply never entitled). */
export interface TrialConfig {
	/** Credits seeded on the tenant's first spend. */
	credits: number;
	/** How long the trial lasts from that first spend, in milliseconds. */
	windowMs: number;
}

export type SpendResult =
	| { ok: true; balance: number }
	| { ok: false; reason: DenyReason };

interface LedgerRow {
	credits_balance: number;
	subscription_status: string | null;
	trial_started_at: string | null;
	stripe_customer_id: string | null;
}

function entitled(
	row: Pick<LedgerRow, "subscription_status" | "trial_started_at">,
	now: number,
	trialWindowMs: number | undefined,
	activeStatuses: ReadonlySet<string>,
): boolean {
	if (row.subscription_status && activeStatuses.has(row.subscription_status)) {
		return true;
	}
	if (trialWindowMs != null && row.trial_started_at) {
		const started = new Date(row.trial_started_at).getTime();
		if (Number.isFinite(started) && now - started <= trialWindowMs) return true;
	}
	return false;
}

export interface SpendOptions {
	tenantId: string;
	/** Credits this action costs. The site keeps its own action→cost table. */
	cost: number;
	/** Enable the lazy trial grant on first spend. */
	trial?: TrialConfig;
	/** Override which subscription statuses count as entitled. */
	activeStatuses?: ReadonlySet<string>;
}

/**
 * Atomically charge `cost` credits to a tenant **within the caller's
 * transaction**. Serialised by `SELECT … FOR UPDATE` on the tenant's row so
 * concurrent spends can't both pass the balance check and overspend. Grants the
 * trial on first touch when `trial` is set. Returns the outcome — does not throw
 * — so callers can branch (use {@link requireCredits} when you want a throw).
 *
 * The caller MUST run this inside a transaction scoped to the tenant; otherwise
 * the row lock spans no surrounding work and the atomicity guarantee is weaker.
 */
export async function spendCredits(
	db: Queryable,
	opts: SpendOptions,
): Promise<SpendResult> {
	const activeStatuses = opts.activeStatuses ?? ACTIVE_SUBSCRIPTION_STATUSES;

	// First touch: seed the row (with trial credits + clock when trials are on).
	// ON CONFLICT DO NOTHING makes the trial a one-time grant.
	await db.query(
		`insert into billing_credits (tenant_id, credits_balance, trial_started_at)
		 values ($1, $2, ${opts.trial ? "now()" : "null"})
		 on conflict (tenant_id) do nothing`,
		[opts.tenantId, opts.trial?.credits ?? 0],
	);

	const { rows } = await db.query<LedgerRow>(
		`select credits_balance, subscription_status, trial_started_at, stripe_customer_id
		 from billing_credits where tenant_id = $1 for update`,
		[opts.tenantId],
	);
	const row = rows[0];
	if (!row) return { ok: false, reason: "not_entitled" };
	if (!entitled(row, Date.now(), opts.trial?.windowMs, activeStatuses)) {
		return { ok: false, reason: "not_entitled" };
	}
	if (row.credits_balance < opts.cost) {
		return { ok: false, reason: "insufficient_credits" };
	}

	const { rows: updated } = await db.query<{ credits_balance: number }>(
		`update billing_credits
		 set credits_balance = credits_balance - $2, updated_at = now()
		 where tenant_id = $1
		 returning credits_balance`,
		[opts.tenantId, opts.cost],
	);
	return { ok: true, balance: updated[0]?.credits_balance ?? 0 };
}

/** Like {@link spendCredits} but throws {@link BillingError} on a denial — use in
 *  API routes that map the error to a 402. */
export async function requireCredits(db: Queryable, opts: SpendOptions): Promise<void> {
	const result = await spendCredits(db, opts);
	if (!result.ok) throw new BillingError(result.reason);
}

/** Return previously-spent credits — call when the work a spend paid for did not
 *  run (a dedup hit, a hard failure, an aborted enqueue). No-op for non-positive
 *  amounts. */
export async function refundCredits(
	db: Queryable,
	opts: { tenantId: string; amount: number },
): Promise<void> {
	if (opts.amount <= 0) return;
	await db.query(
		`update billing_credits
		 set credits_balance = credits_balance + $2, updated_at = now()
		 where tenant_id = $1`,
		[opts.tenantId, opts.amount],
	);
}

/**
 * Mark a Stripe event processed, idempotently. Returns false if the event was
 * already claimed, so the caller skips re-applying it. Run inside the same
 * transaction as the state change it guards, so a webhook retry can never apply
 * the change twice. Backed by `billing_stripe_events`.
 */
export async function claimStripeEvent(
	db: Queryable,
	eventId: string,
	type: string,
): Promise<boolean> {
	const { rows } = await db.query(
		`insert into billing_stripe_events (event_id, type) values ($1, $2)
		 on conflict (event_id) do nothing returning event_id`,
		[eventId, type],
	);
	return rows.length > 0;
}

/** Add credits to a tenant, idempotently per Stripe event — the dedupe and the
 *  balance increment share the caller's transaction, so a webhook retry never
 *  double-credits. Returns false (no-op) if the event was already processed.
 *  Pass a synthetic `eventId` (e.g. `subgrant:<sub>:<periodStart>`) to grant a
 *  subscription's bundled credits once per billing period. */
export async function grantCredits(
	db: Queryable,
	opts: {
		tenantId: string;
		eventId: string;
		eventType: string;
		amount: number;
		stripeCustomerId?: string | null;
	},
): Promise<boolean> {
	if (!(await claimStripeEvent(db, opts.eventId, opts.eventType))) return false;
	await db.query(
		`insert into billing_credits (tenant_id, credits_balance, stripe_customer_id)
		 values ($1, $2, $3)
		 on conflict (tenant_id) do update set
		   credits_balance = billing_credits.credits_balance + excluded.credits_balance,
		   stripe_customer_id = coalesce(excluded.stripe_customer_id, billing_credits.stripe_customer_id),
		   updated_at = now()`,
		[opts.tenantId, opts.amount, opts.stripeCustomerId ?? null],
	);
	return true;
}

/** Cache a tenant's subscription status from a webhook, idempotently per event.
 *  Returns false if the event was already processed. */
export async function recordSubscriptionStatus(
	db: Queryable,
	opts: {
		tenantId: string;
		eventId: string;
		eventType: string;
		status: string;
		stripeCustomerId?: string | null;
	},
): Promise<boolean> {
	if (!(await claimStripeEvent(db, opts.eventId, opts.eventType))) return false;
	await db.query(
		`insert into billing_credits (tenant_id, subscription_status, stripe_customer_id)
		 values ($1, $2, $3)
		 on conflict (tenant_id) do update set
		   subscription_status = excluded.subscription_status,
		   stripe_customer_id = coalesce(excluded.stripe_customer_id, billing_credits.stripe_customer_id),
		   updated_at = now()`,
		[opts.tenantId, opts.status, opts.stripeCustomerId ?? null],
	);
	return true;
}

export interface BillingSummary {
	creditsBalance: number;
	subscriptionStatus: string | null;
	stripeCustomerId: string | null;
	entitled: boolean;
	/** Trial window end (epoch ms) when in trial and unsubscribed, else null. */
	trialEndsAt: number | null;
}

/** Read-only entitlement + balance snapshot for the billing UI. Does not create a
 *  row or grant the trial (that happens on the first spend). */
export async function getBillingSummary(
	db: Queryable,
	opts: {
		tenantId: string;
		trialWindowMs?: number;
		activeStatuses?: ReadonlySet<string>;
	},
): Promise<BillingSummary> {
	const activeStatuses = opts.activeStatuses ?? ACTIVE_SUBSCRIPTION_STATUSES;
	const { rows } = await db.query<LedgerRow>(
		`select credits_balance, subscription_status, trial_started_at, stripe_customer_id
		 from billing_credits where tenant_id = $1`,
		[opts.tenantId],
	);
	const row = rows[0];
	if (!row) {
		return {
			creditsBalance: 0,
			subscriptionStatus: null,
			stripeCustomerId: null,
			entitled: false,
			trialEndsAt: null,
		};
	}
	const subscribed =
		!!row.subscription_status && activeStatuses.has(row.subscription_status);
	const trialEndsAt =
		!subscribed && opts.trialWindowMs != null && row.trial_started_at
			? new Date(row.trial_started_at).getTime() + opts.trialWindowMs
			: null;
	return {
		creditsBalance: row.credits_balance,
		subscriptionStatus: row.subscription_status,
		stripeCustomerId: row.stripe_customer_id,
		entitled: entitled(row, Date.now(), opts.trialWindowMs, activeStatuses),
		trialEndsAt,
	};
}
