import { describe, expect, it } from "vitest";
import { serializeJsonLd } from "./json-ld.js";

describe("serializeJsonLd", () => {
	it("escapes < so CMS content cannot terminate the script tag", () => {
		const out = serializeJsonLd({
			answer: '</script><script>alert("x")</script>',
		});
		expect(out).not.toContain("<");
		expect(out).toContain("\\u003c/script");
	});

	it("escapes U+2028/U+2029, which are valid JSON but not valid JS source", () => {
		const ls = String.fromCharCode(0x2028);
		const ps = String.fromCharCode(0x2029);
		const out = serializeJsonLd({ text: `a${ls}b${ps}c` });
		expect(out).toContain("\\u2028");
		expect(out).toContain("\\u2029");
		expect(out).not.toContain(ls);
		expect(out).not.toContain(ps);
	});

	it("round-trips through JSON.parse unchanged", () => {
		const data = { q: "</script>", t: `x${String.fromCharCode(0x2028)}y` };
		expect(JSON.parse(serializeJsonLd(data))).toEqual(data);
	});
});
