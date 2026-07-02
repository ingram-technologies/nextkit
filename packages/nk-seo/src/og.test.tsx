// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ogImageResponse } from "./og.js";

/**
 * Renders the card through the real next/og pipeline (satori + resvg). No
 * linter or type-check validates satori-supported CSS — unsupported layout,
 * a multi-child node missing `display: flex`, or mixed text/element siblings
 * only fail at render time — so rendering *is* the validation.
 */

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// 1×1 transparent PNG, so the logo path needs no network.
const LOGO_DATA_URI =
	"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

async function renderedPng(minimal: boolean): Promise<Buffer> {
	const response = ogImageResponse(
		minimal
			? { title: "Hello" }
			: {
					title: "Ship faster with Acme",
					subtitle: "The all-in-one platform.",
					eyebrow: "Product",
					footer: "example.com",
					wordmark: "Acme",
					logo: LOGO_DATA_URI,
					accent: "#565ac9",
				},
	);
	return Buffer.from(await response.arrayBuffer());
}

describe("ogImageResponse", () => {
	it("renders a minimal card to a valid 1200×630 PNG", async () => {
		const png = await renderedPng(true);
		expect(png.subarray(0, 8)).toEqual(PNG_MAGIC);
		// IHDR width/height live at byte offsets 16/20.
		expect(png.readUInt32BE(16)).toBe(1200);
		expect(png.readUInt32BE(20)).toBe(630);
	});

	it("renders a card exercising every option (logo, eyebrow, footer, wordmark)", async () => {
		const png = await renderedPng(false);
		expect(png.subarray(0, 8)).toEqual(PNG_MAGIC);
	});
});
