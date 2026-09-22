import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findings } from "../lib/doctor.js";

/**
 * A segment's own `openGraph` object replaces the inherited one, and a file
 * image attaches only to its own segment, so a metadata object declaring a
 * card without `images` emits no `og:image` unless the file sits beside it.
 * `nk doctor` reads the declaration textually and flags the blank card.
 */
describe("nk doctor: Open Graph card without an image", () => {
	let dir;
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), "nk-doctor-og-"));
		writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "site" }));
	});
	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	const write = (rel, content = "") => {
		const full = join(dir, rel);
		mkdirSync(dirname(full), { recursive: true });
		writeFileSync(full, content);
	};

	const CARD = 'export const metadata = { openGraph: { title: "Acme" } };';
	const CARD_WITH_IMAGES =
		'export const metadata = { openGraph: { title: "Acme", images } };';
	const ogFindings = () => findings(dir).filter((f) => f.id.startsWith("og:"));

	it("flags a root layout card with no image anywhere", () => {
		write("src/app/layout.tsx", CARD);
		const f = ogFindings().find((x) => x.id === "og:image-missing:/");
		expect(f).toBeDefined();
		expect(f.level).toBe("error");
		expect(f.message).toMatch(/src\/app\/layout\.tsx/);
		expect(f.message).toMatch(/app root/);
	});

	it("flags the root layout when the only image lives under a route group", () => {
		write("src/app/layout.tsx", CARD);
		write("src/app/(landing)/opengraph-image.tsx", "export default () => {};");
		write("src/app/(landing)/page.tsx", CARD);
		write("src/app/auth/login/page.tsx", "export default () => null;");
		expect(ogFindings().map((f) => f.id)).toEqual(["og:image-missing:/"]);
	});

	it("passes a root layout with the image beside it", () => {
		write("src/app/layout.tsx", CARD);
		write("src/app/opengraph-image.tsx", "export default () => {};");
		write("src/app/auth/login/page.tsx", "export default () => null;");
		expect(ogFindings()).toEqual([]);
	});

	it("flags a page whose own card drops an ancestor's file image", () => {
		write("src/app/layout.tsx", CARD);
		write("src/app/opengraph-image.tsx", "export default () => {};");
		write("src/app/(landing)/docs/page.tsx", CARD);
		const f = ogFindings().find((x) => x.id === "og:image-missing:/docs");
		expect(f).toBeDefined();
		expect(f.message).toMatch(/src\/app\/opengraph-image\.tsx/);
		expect(f.message).toMatch(/replaces/);
	});

	it("passes a page card that spreads images, or sits beside its own image", () => {
		write("src/app/layout.tsx", CARD);
		write("src/app/opengraph-image.tsx", "export default () => {};");
		write("src/app/docs/page.tsx", CARD_WITH_IMAGES);
		write("src/app/tools/page.tsx", CARD);
		write("src/app/tools/opengraph-image.png");
		write("src/app/blog/page.tsx", "return ogImageMetadata({ baseUrl });");
		expect(ogFindings()).toEqual([]);
	});

	it("treats a twitter declaration as a card too", () => {
		write(
			"src/app/layout.tsx",
			'export const metadata = { twitter: { card: "summary_large_image" } };',
		);
		expect(ogFindings().map((f) => f.id)).toEqual(["og:image-missing:/"]);
	});

	it("leaves pages that declare no card alone", () => {
		write("src/app/layout.tsx", 'export const metadata = { title: "Acme" };');
		write("src/app/about/page.tsx", "export default () => null;");
		expect(ogFindings()).toEqual([]);
	});

	it("skips _private folders and @slot trees", () => {
		write("src/app/layout.tsx", CARD);
		write("src/app/opengraph-image.tsx", "export default () => {};");
		write("src/app/_components/page.tsx", CARD);
		write("src/app/@modal/page.tsx", CARD);
		expect(ogFindings()).toEqual([]);
	});

	it("handles a bare app/ directory and keeps dynamic segments in the route", () => {
		write("app/layout.tsx", CARD);
		write("app/opengraph-image.tsx", "export default () => {};");
		write("app/blog/[slug]/page.tsx", CARD);
		expect(ogFindings().map((f) => f.id)).toEqual([
			"og:image-missing:/blog/[slug]",
		]);
	});

	it("is silent on a site without an app directory", () => {
		write("src/index.ts", CARD);
		expect(ogFindings()).toEqual([]);
	});
});
