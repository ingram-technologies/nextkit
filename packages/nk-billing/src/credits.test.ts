import { beforeEach, describe, expect, it } from "vitest";
import {
	getBillingSummary,
	grantCredits,
	type Queryable,
	recordSubscriptionStatus,
	refundCredits,
	requireCredits,
	spendCredits,
} from "./credits.js";

/**
 * A tiny in-memory emulator of just the statements the ledger issues. Not a
 * Postgres — it understands these specific queries by substring — but enough to
 * exercise the branch logic, the lazy trial grant, and webhook idempotency
 * without a database. The real SQL is covered by the consuming site's
 * integration tests against PGlite.
 */
interface Row {
	credits_balance: number;
	subscription_status: string | null;
	trial_started_at: string | null;
	stripe_customer_id: string | null;
}

class FakeDb implements Queryable {
	rows = new Map<string, Row>();
	events = new Set<string>();

	// eslint-disable-next-line @typescript-eslint/require-await
	async query<R = Record<string, unknown>>(
		sql: string,
		params: unknown[] = [],
	): Promise<{ rows: R[] }> {
		const s = sql.replace(/\s+/g, " ").trim();

		if (
			s.startsWith(
				"insert into billing_credits (tenant_id, credits_balance, trial_started_at)",
			)
		) {
			const [tenant, balance] = params as [string, number];
			if (!this.rows.has(tenant)) {
				this.rows.set(tenant, {
					credits_balance: balance,
					subscription_status: null,
					trial_started_at: s.includes("values ($1, $2, now())")
						? new Date().toISOString()
						: null,
					stripe_customer_id: null,
				});
			}
			return { rows: [] };
		}

		if (s.startsWith("select credits_balance")) {
			const [tenant] = params as [string];
			const row = this.rows.get(tenant);
			return { rows: row ? [{ ...row } as unknown as R] : [] };
		}

		if (
			s.startsWith(
				"update billing_credits set credits_balance = credits_balance - $2",
			)
		) {
			const [tenant, cost] = params as [string, number];
			const row = this.rows.get(tenant);
			if (row) row.credits_balance -= cost;
			return {
				rows: [{ credits_balance: row?.credits_balance ?? 0 } as unknown as R],
			};
		}

		if (
			s.startsWith(
				"update billing_credits set credits_balance = credits_balance + $2",
			)
		) {
			const [tenant, amount] = params as [string, number];
			const row = this.rows.get(tenant);
			if (row) row.credits_balance += amount;
			return { rows: [] };
		}

		if (s.startsWith("insert into billing_stripe_events")) {
			const [eventId] = params as [string];
			if (this.events.has(eventId)) return { rows: [] };
			this.events.add(eventId);
			return { rows: [{ event_id: eventId } as unknown as R] };
		}

		if (
			s.startsWith(
				"insert into billing_credits (tenant_id, credits_balance, stripe_customer_id)",
			)
		) {
			const [tenant, amount, customer] = params as [
				string,
				number,
				string | null,
			];
			const row = this.rows.get(tenant);
			if (row) {
				row.credits_balance += amount;
				row.stripe_customer_id = customer ?? row.stripe_customer_id;
			} else {
				this.rows.set(tenant, {
					credits_balance: amount,
					subscription_status: null,
					trial_started_at: null,
					stripe_customer_id: customer,
				});
			}
			return { rows: [] };
		}

		if (
			s.startsWith(
				"insert into billing_credits (tenant_id, subscription_status, stripe_customer_id)",
			)
		) {
			const [tenant, status, customer] = params as [
				string,
				string,
				string | null,
			];
			const row = this.rows.get(tenant);
			if (row) {
				row.subscription_status = status;
				row.stripe_customer_id = customer ?? row.stripe_customer_id;
			} else {
				this.rows.set(tenant, {
					credits_balance: 0,
					subscription_status: status,
					trial_started_at: null,
					stripe_customer_id: customer,
				});
			}
			return { rows: [] };
		}

		throw new Error(`unhandled query: ${s}`);
	}
}

const TENANT = "org_1";
const TRIAL = { credits: 100, windowMs: 14 * 24 * 60 * 60 * 1000 };

describe("spendCredits", () => {
	let db: FakeDb;
	beforeEach(() => {
		db = new FakeDb();
	});

	it("grants the trial on first spend and charges it", async () => {
		const r = await spendCredits(db, { tenantId: TENANT, cost: 10, trial: TRIAL });
		expect(r).toEqual({ ok: true, balance: 90 });
	});

	it("denies when not entitled (no trial config, no subscription)", async () => {
		const r = await spendCredits(db, { tenantId: TENANT, cost: 10 });
		expect(r).toEqual({ ok: false, reason: "not_entitled" });
	});

	it("denies when out of credits even though entitled", async () => {
		await spendCredits(db, { tenantId: TENANT, cost: 95, trial: TRIAL }); // 100 → 5
		const r = await spendCredits(db, { tenantId: TENANT, cost: 10, trial: TRIAL });
		expect(r).toEqual({ ok: false, reason: "insufficient_credits" });
	});

	it("stays entitled past the trial window once subscribed", async () => {
		// Seed an expired trial, then mark active via a webhook.
		await spendCredits(db, { tenantId: TENANT, cost: 0, trial: TRIAL });
		const row = db.rows.get(TENANT);
		if (row)
			row.trial_started_at = new Date(
				Date.now() - TRIAL.windowMs - 1000,
			).toISOString();
		await recordSubscriptionStatus(db, {
			tenantId: TENANT,
			eventId: "evt_sub",
			eventType: "customer.subscription.updated",
			status: "active",
		});
		const r = await spendCredits(db, { tenantId: TENANT, cost: 10, trial: TRIAL });
		expect(r.ok).toBe(true);
	});

	it("requireCredits throws BillingError on denial", async () => {
		await expect(
			requireCredits(db, { tenantId: TENANT, cost: 10 }),
		).rejects.toMatchObject({ name: "BillingError", reason: "not_entitled" });
	});

	it("refundCredits returns spent credits", async () => {
		await spendCredits(db, { tenantId: TENANT, cost: 30, trial: TRIAL }); // → 70
		await refundCredits(db, { tenantId: TENANT, amount: 30 }); // → 100
		expect(db.rows.get(TENANT)?.credits_balance).toBe(100);
	});
});

describe("grantCredits idempotency", () => {
	it("applies once and no-ops on a repeated event id", async () => {
		const db = new FakeDb();
		const opts = {
			tenantId: TENANT,
			eventId: "evt_pack",
			eventType: "checkout.session.completed",
			amount: 1000,
		};
		expect(await grantCredits(db, opts)).toBe(true);
		expect(await grantCredits(db, opts)).toBe(false); // retry → no double-grant
		expect(db.rows.get(TENANT)?.credits_balance).toBe(1000);
	});
});

describe("getBillingSummary", () => {
	it("reports zeros for an unknown tenant without creating a row", async () => {
		const db = new FakeDb();
		const summary = await getBillingSummary(db, { tenantId: TENANT });
		expect(summary).toEqual({
			creditsBalance: 0,
			subscriptionStatus: null,
			stripeCustomerId: null,
			entitled: false,
			trialEndsAt: null,
		});
		expect(db.rows.size).toBe(0);
	});

	it("reports entitlement and trial end while in trial", async () => {
		const db = new FakeDb();
		await spendCredits(db, { tenantId: TENANT, cost: 10, trial: TRIAL }); // seeds trial
		const summary = await getBillingSummary(db, {
			tenantId: TENANT,
			trialWindowMs: TRIAL.windowMs,
		});
		expect(summary.creditsBalance).toBe(90);
		expect(summary.entitled).toBe(true);
		expect(summary.trialEndsAt).not.toBeNull();
	});
});
