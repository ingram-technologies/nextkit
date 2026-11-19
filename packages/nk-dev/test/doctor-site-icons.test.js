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
		write("src/app/icon.svg", '<svg><path d="M0 0h1v1z"/></svg>');
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

	it("warns on a PNG renamed to .ico, and errors on WebP", () => {
		complete();
		write("src/app/favicon.ico", Buffer.from("89504e470d0a1a0a0000", "hex"));
		expect(ids()).toEqual(["icons:favicon-not-ico"]);
		write(
			"src/app/favicon.ico",
			Buffer.from("52494646000000005745425056503820", "hex"),
		);
		const f = findings(dir).find((x) => x.id === "icons:favicon-invalid");
		expect(f?.level).toBe("error");
		expect(f?.message).toMatch(/webp/);
	});

	it("errors on an icon.svg that draws nothing", () => {
		complete();
		write(
			"src/app/icon.svg",
			'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"></svg>',
		);
		expect(ids()).toEqual(["icons:icon-svg-blank"]);
	});

	it("checks every Next site of a workspace from its root", () => {
		writeFileSync(
			join(dir, "package.json"),
			JSON.stringify({ name: "mono", workspaces: ["apps/*", "tools"] }),
		);
		rmSync(join(dir, "src"), { recursive: true });
		const site = JSON.stringify({ name: "s", dependencies: { next: "16.0.0" } });
		write("apps/web/package.json", site);
		write("apps/web/src/app/favicon.ico", ICO);
		write("apps/web/src/app/apple-icon.png", "png");
		write("apps/web/src/app/manifest.ts", "");
		write("apps/plan/package.json", site);
		write("apps/plan/src/app/page.tsx", "");
		write("tools/package.json", JSON.stringify({ name: "tools" }));
		expect(ids()).toEqual([
			"icons:favicon-missing:apps/plan",
			"icons:apple-icon-missing:apps/plan",
			"icons:manifest-missing:apps/plan",
		]);
		expect(findings(dir)[0]?.message).toBeDefined();
		expect(
			findings(dir).find((f) => f.id === "icons:favicon-missing:apps/plan")
				?.message,
		).toMatch(/^apps\/plan: /);
	});

	it("is silent on a package that is not a Next site", () => {
		writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "lib" }));
		expect(ids()).toEqual([]);
	});
});
