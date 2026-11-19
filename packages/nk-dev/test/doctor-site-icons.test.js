import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findings } from "../lib/doctor.js";

const ICO = Buffer.from([0, 0, 1, 0, 1, 0, 16, 16, 0, 0]);

describe("nk doctor: site icons", () => {
	let dir;
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), "nk-doctor-icons-"));
		writeFileSync(
			join(dir, "package.json"),
			JSON.stringify({ name: "site", dependencies: { next: "16.0.0" } }),
		);
		mkdirSync(join(dir, "src/app"), { recursive: true });
	});
	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	const write = (rel, content = "") => {
		const full = join(dir, rel);
		mkdirSync(dirname(full), { recursive: true });
		writeFileSync(full, content);
	};
	const ids = () =>
		findings(dir)
			.filter((f) => f.id.startsWith("icons:"))
			.map((f) => f.id);
	const complete = () => {
		write("src/app/favicon.ico", ICO);
		write("src/app/icon.svg", "<svg/>");
		write("src/app/apple-icon.png", "png");
		write("src/app/manifest.ts", "export default () => ({});");
	};

	it("passes the full set", () => {
		complete();
		write("src/app/layout.tsx", 'export const metadata = { title: "Acme" };');
		expect(ids()).toEqual([]);
	});

	it("flags an empty favicon.ico as an error, in src/app or public", () => {
		complete();
		write("src/app/favicon.ico", "");
		expect(findings(dir).find((f) => f.id === "icons:favicon-invalid")?.level).toBe(
			"error",
		);
		rmSync(join(dir, "src/app/favicon.ico"));
		write("public/favicon.ico", "<svg/>");
		expect(ids()).toEqual(["icons:favicon-invalid"]);
	});

	it("warns on each missing piece", () => {
		write("src/app/page.tsx", "export default () => null;");
		expect(ids()).toEqual([
			"icons:favicon-missing",
			"icons:apple-icon-missing",
			"icons:manifest-missing",
		]);
	});

	it("accepts the legacy public/ apple-touch-icon and a generated apple-icon", () => {
		complete();
		rmSync(join(dir, "src/app/apple-icon.png"));
		write("public/apple-touch-icon.png", "png");
		expect(ids()).toEqual([]);
		rmSync(join(dir, "public/apple-touch-icon.png"));
		write("src/app/apple-icon.tsx", "export default () => null;");
		expect(ids()).toEqual([]);
	});

	it("flags metadata.icons beside icon files", () => {
		complete();
		write(
			"src/app/layout.tsx",
			'export const metadata = { icons: { icon: [{ url: "/favicon.ico" }] } };',
		);
		expect(ids()).toEqual(["icons:metadata-duplicates-files"]);
	});

	it("leaves metadata.icons alone when there are no icon files to duplicate", () => {
		write("src/app/apple-icon.png", "png");
		write("src/app/manifest.ts", "export default () => ({});");
		write("public/favicon.ico", ICO);
		write(
			"src/app/layout.tsx",
			'export const metadata = { icons: { icon: "/x.png" } };',
		);
		expect(ids()).toEqual([]);
	});

	it("is silent on a package that is not a Next site", () => {
		writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "lib" }));
		expect(ids()).toEqual([]);
	});
});
