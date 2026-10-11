import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HreflangLinks } from "./hreflang.js";

// next/headers is the request boundary: outside a Next request scope it throws,
// so it is the one thing worth mocking here.
const request = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock("next/headers", () => ({
	headers: () => Promise.resolve(request.headers),
}));

const config = { baseUrl: "https://acme.test", locales: ["en", "fr"] };

/** Every `<link>`'s props in the rendered tree, in order. */
const linksOf = (node: ReactNode): Record<string, unknown>[] => {
	if (Array.isArray(node)) return node.flatMap(linksOf);
	if (!isValidElement<{ children?: ReactNode }>(node)) return [];
	if (node.type === "link") return [node.props];
	return linksOf(node.props.children);
};

describe("HreflangLinks", () => {
	beforeEach(() => {
		request.headers = new Headers();
	});

	it("throws rather than canonicalizing every page to the homepage", async () => {
		await expect(HreflangLinks(config)).rejects.toThrow(/x-pathname/);
	});

	it("reads the path from the x-pathname request header", async () => {
		request.headers.set("x-pathname", "/about");
		const links = linksOf(await HreflangLinks(config));
		expect(links.find((link) => link.rel === "canonical")?.href).toBe(
			"https://acme.test/about",
		);
		expect(links.filter((link) => link.rel === "alternate")).toHaveLength(3);
	});

	it("emits no canonical when canonical={false}, keeping the alternates", async () => {
		const links = linksOf(
			await HreflangLinks({ ...config, pathname: "/about", canonical: false }),
		);
		expect(links.some((link) => link.rel === "canonical")).toBe(false);
		expect(links.map((link) => link.hrefLang)).toEqual(["en", "fr", "x-default"]);
	});
});
