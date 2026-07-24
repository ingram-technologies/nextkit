import { describe, expect, it } from "vitest";
import {
	defineEmailCatalog,
	type EmailCatalog,
	EMAIL_CATALOG_VERSION,
	type EmailCatalogEntry,
	serializeEmailCatalog,
} from "./catalog";

const entry = (over: Partial<EmailCatalogEntry> = {}): EmailCatalogEntry => ({
	key: "welcome",
	group: "Onboarding",
	name: "Welcome",
	scenario: "Sent the moment an account is created.",
	subject: "Welcome aboard",
	html: "<p>Hi</p>",
	text: "Hi",
	...over,
});

describe("defineEmailCatalog", () => {
	it("returns a frozen copy of valid entries", () => {
		const cat = defineEmailCatalog([entry()]);
		expect(cat).toHaveLength(1);
		expect(Object.isFrozen(cat)).toBe(true);
	});

	it("rejects a malformed key", () => {
		expect(() => defineEmailCatalog([entry({ key: "Not Valid" })])).toThrow(
			/must match/,
		);
	});

	it("rejects duplicate keys", () => {
		expect(() =>
			defineEmailCatalog([entry(), entry({ name: "Welcome 2" })]),
		).toThrow(/duplicate catalog key "welcome"/);
	});

	it("rejects an entry with neither html nor text", () => {
		expect(() => defineEmailCatalog([entry({ html: "", text: "" })])).toThrow(
			/neither html nor text/,
		);
	});

	it("accepts an html-only or text-only entry", () => {
		expect(() => defineEmailCatalog([entry({ text: "" })])).not.toThrow();
		expect(() => defineEmailCatalog([entry({ html: "" })])).not.toThrow();
	});
});

describe("serializeEmailCatalog", () => {
	it("emits a versioned manifest that round-trips", () => {
		const cat = defineEmailCatalog([entry()]);
		const json = serializeEmailCatalog(cat, { product: "Acme" });
		const parsed = JSON.parse(json) as EmailCatalog;
		expect(parsed.version).toBe(EMAIL_CATALOG_VERSION);
		expect(parsed.product).toBe("Acme");
		expect(parsed.entries[0]?.key).toBe("welcome");
	});

	it("omits product when not given and can emit compact JSON", () => {
		const json = serializeEmailCatalog(defineEmailCatalog([entry()]), {
			pretty: false,
		});
		expect(json).not.toContain("\n");
		expect((JSON.parse(json) as EmailCatalog).product).toBeUndefined();
	});
});
