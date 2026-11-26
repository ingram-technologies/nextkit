import type Stripe from "stripe";
import { describe, expect, it } from "vitest";
import {
	findCustomer,
	findOrCreateCustomer,
	updateCustomerBillingAddress,
} from "./customers.js";

/** Records the search query; the escaping is the unit under test. */
function recordingStripe() {
	const queries: string[] = [];
	const stripe = {
		customers: {
			search: (params: { query: string }) => {
				queries.push(params.query);
				return Promise.resolve({ data: [] });
			},
		},
	};
	// Structural fake of the one surface under test.
	return { queries, stripe: stripe as unknown as Stripe };
}

/** Stripe search's grammar for one metadata clause: two single-quoted values,
 *  backslash escaping. Returns the unescaped key and value, or null when the
 *  query is anything other than exactly one such clause. */
const parseClause = (query: string): { key: string; value: string } | null => {
	const quoted = String.raw`'((?:\\.|[^'\\])*)'`;
	const match = new RegExp(String.raw`^metadata\[${quoted}\]:${quoted}$`).exec(query);
	if (!match) return null;
	const unescape = (s: string | undefined) => (s ?? "").replace(/\\(.)/g, "$1");
	return { key: unescape(match[1]), value: unescape(match[2]) };
};

describe("findCustomer", () => {
	it.each([
		["a plain id", "org_1"],
		["an injected OR clause", "' OR metadata['x']:'y"],
		["a trailing backslash", "org\\"],
		["a backslash before a quote", "\\' OR metadata['x']:'y"],
	])("searches for exactly one clause matching %s", async (_label, id) => {
		const { queries, stripe } = recordingStripe();
		await findCustomer({ metadataKey: "acme_org_id", id }, stripe);
		expect(queries).toHaveLength(1);
		expect(parseClause(queries[0] ?? "")).toEqual({
			key: "acme_org_id",
			value: id,
		});
	});
});

/** Records the create and update params; their address is the unit under test. */
function addressStripe() {
	const created: Stripe.CustomerCreateParams[] = [];
	const updated: Stripe.CustomerUpdateParams[] = [];
	const stripe = {
		customers: {
			search: () => Promise.resolve({ data: [] }),
			create: (params: Stripe.CustomerCreateParams) => {
				created.push(params);
				return Promise.resolve({ id: "cus_1" });
			},
			update: (_id: string, params: Stripe.CustomerUpdateParams) => {
				updated.push(params);
				return Promise.resolve({ id: "cus_1" });
			},
		},
	};
	// Structural fake of the one surface under test.
	return { created, updated, stripe: stripe as unknown as Stripe };
}

const brussels = { city: "Ixelles", postal_code: "1050", country: "BE" };

describe("the second address line", () => {
	it.each([
		["sends it", "Boîte 3", { line2: "Boîte 3" }],
		["omits an empty one", "", {}],
		["omits a missing one", null, {}],
	])("findOrCreateCustomer %s", async (_label, line2, expected) => {
		const { created, stripe } = addressStripe();
		await findOrCreateCustomer(
			{ metadataKey: "acme_org_id", id: "org_1" },
			{
				name: "Acme",
				address: { line1: "Avenue Louise 250", line2, ...brussels },
			},
			stripe,
		);
		expect(created[0]?.address).toEqual({
			line1: "Avenue Louise 250",
			...expected,
			...brussels,
		});
	});

	it.each([
		["sends it", "Boîte 3", { line2: "Boîte 3" }],
		["omits an empty one", "", {}],
		["omits a missing one", undefined, {}],
	])("updateCustomerBillingAddress %s", async (_label, line2, expected) => {
		const { updated, stripe } = addressStripe();
		await updateCustomerBillingAddress(
			"cus_1",
			{ address: { line1: "Avenue Louise 250", line2, ...brussels } },
			stripe,
		);
		expect(updated[0]?.address).toEqual({
			line1: "Avenue Louise 250",
			...expected,
			...brussels,
		});
	});
});
