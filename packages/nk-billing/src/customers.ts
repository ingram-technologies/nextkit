/**
 * Customer resolution. Every Ingram site keys its Stripe customer to a local
 * entity (an org or a user) by writing that id into the customer's `metadata`,
 * then finds it back by metadata search — no local `stripe_customer_id` column is
 * required just to locate the customer (though sites cache it for speed).
 *
 * The metadata key differs per site (`financica_organization_id`,
 * `integrain_org_id`, …), so it is always passed in explicitly via
 * {@link CustomerRef} rather than baked in here — that is the framework seam.
 */

import type Stripe from "stripe";
import { getStripe } from "./client.js";

/** Identifies a Stripe customer by a metadata tag → local entity id. */
export interface CustomerRef {
	/** The Stripe `metadata` key the local id is stored under, e.g.
	 *  "integrain_org_id". Choose one per site and use it everywhere. */
	metadataKey: string;
	/** The local entity id (org id, user id, …). */
	id: string;
}

export interface CustomerDetails {
	name?: string | null;
	email?: string | null;
	/** EU VAT number; recorded as an `eu_vat` tax id (best-effort, non-fatal). */
	vatNumber?: string | null;
	address?: {
		line1?: string | null;
		city?: string | null;
		postal_code?: string | null;
		country?: string | null;
	} | null;
}

/** The customer for `ref`, found by metadata search, or null if none exists yet.
 *  Read paths use this so merely viewing a billing page never mints an empty
 *  customer. */
export async function findCustomer(
	ref: CustomerRef,
	stripe: Stripe = getStripe(),
): Promise<Stripe.Customer | null> {
	const found = await stripe.customers.search({
		query: `metadata['${ref.metadataKey}']:'${ref.id}'`,
		limit: 1,
	});
	return found.data[0] ?? null;
}

/** Like {@link findCustomer} but creates the customer on first use (checkout).
 *  The local id is always written into metadata so {@link findCustomer} can find
 *  it back. */
export async function findOrCreateCustomer(
	ref: CustomerRef,
	details: CustomerDetails = {},
	stripe: Stripe = getStripe(),
): Promise<Stripe.Customer> {
	const existing = await findCustomer(ref, stripe);
	if (existing) return existing;

	const params: Stripe.CustomerCreateParams = {
		name: details.name ?? undefined,
		email: details.email ?? undefined,
		metadata: { [ref.metadataKey]: ref.id },
	};
	if (details.address?.line1 || details.address?.city) {
		params.address = {
			line1: details.address.line1 ?? undefined,
			city: details.address.city ?? undefined,
			postal_code: details.address.postal_code ?? undefined,
			country: details.address.country ?? undefined,
		};
	}

	const customer = await stripe.customers.create(params);

	if (details.vatNumber) {
		try {
			await stripe.customers.createTaxId(customer.id, {
				type: "eu_vat",
				value: details.vatNumber,
			});
		} catch {
			// Non-fatal: the VAT number may be in a format Stripe rejects. We don't
			// fail customer creation over a tax id we can re-attach later.
		}
	}

	return customer;
}

/** Whether a customer has a billing address on file. Stripe requires one before
 *  `tax_id_collection` can be enabled on a Checkout session. */
export async function customerHasBillingAddress(
	customerId: string,
	stripe: Stripe = getStripe(),
): Promise<boolean> {
	const customer = await stripe.customers.retrieve(customerId);
	if (customer.deleted) return false;
	return Boolean(customer.address?.line1);
}

/** Update a customer's name and billing address — used when details were missing
 *  and got collected just before checkout. */
export async function updateCustomerBillingAddress(
	customerId: string,
	opts: {
		name?: string | null;
		address: {
			line1: string;
			city: string;
			postal_code: string;
			country: string;
		};
	},
	stripe: Stripe = getStripe(),
): Promise<void> {
	await stripe.customers.update(customerId, {
		...(opts.name ? { name: opts.name } : {}),
		address: opts.address,
	});
}
