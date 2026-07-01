import { describe, expect, it } from "vitest";
import {
	article,
	breadcrumbList,
	createSeo,
	event,
	faqPage,
	localBusiness,
	organization,
	person,
	softwareApplication,
	website,
} from "./schema.js";

describe("faqPage", () => {
	it("wraps each pair as a Question/Answer node", () => {
		expect(faqPage([{ question: "Q1?", answer: "A1." }])).toEqual({
			"@context": "https://schema.org",
			"@type": "FAQPage",
			mainEntity: [
				{
					"@type": "Question",
					name: "Q1?",
					acceptedAnswer: { "@type": "Answer", text: "A1." },
				},
			],
		});
	});
});

describe("breadcrumbList", () => {
	it("numbers items from position 1", () => {
		const result = breadcrumbList([
			{ name: "Home", url: "https://x.test/" },
			{ name: "Blog", url: "https://x.test/blog" },
		]);
		expect(result).toMatchObject({
			"@type": "BreadcrumbList",
			itemListElement: [
				{ position: 1, name: "Home", item: "https://x.test/" },
				{ position: 2, name: "Blog", item: "https://x.test/blog" },
			],
		});
	});
});

describe("softwareApplication", () => {
	it("emits an AggregateOffer when low/high prices are given", () => {
		const result = softwareApplication({
			name: "App",
			applicationCategory: "BusinessApplication",
			operatingSystem: "Web",
			offers: {
				priceCurrency: "EUR",
				lowPrice: 59,
				highPrice: 299,
				offerCount: 2,
				url: "https://x.test/pricing",
			},
		});
		expect(result.offers).toEqual({
			"@type": "AggregateOffer",
			priceCurrency: "EUR",
			lowPrice: "59",
			highPrice: "299",
			offerCount: "2",
			url: "https://x.test/pricing",
		});
	});

	it("emits a single Offer when only price is given", () => {
		const result = softwareApplication({
			name: "App",
			offers: { priceCurrency: "EUR", price: 0 },
		});
		expect(result.offers).toEqual({
			"@type": "Offer",
			priceCurrency: "EUR",
			price: "0",
		});
	});

	it("omits optional fields that were not provided", () => {
		const result = softwareApplication({ name: "App" });
		expect(result).not.toHaveProperty("offers");
		expect(result).not.toHaveProperty("operatingSystem");
	});
});

describe("article", () => {
	it("defaults dateModified to datePublished and sets mainEntityOfPage", () => {
		const result = article({
			headline: "Hello",
			url: "https://x.test/blog/hello",
			datePublished: "2026-01-02",
			authors: [{ name: "Jane", url: "https://x.test/jane" }],
			publisher: { name: "Acme", logo: "https://x.test/logo.png" },
		});
		expect(result).toMatchObject({
			"@type": "Article",
			headline: "Hello",
			mainEntityOfPage: "https://x.test/blog/hello",
			datePublished: "2026-01-02",
			dateModified: "2026-01-02",
			author: [{ "@type": "Person", name: "Jane", url: "https://x.test/jane" }],
			publisher: {
				"@type": "Organization",
				name: "Acme",
				logo: { "@type": "ImageObject", url: "https://x.test/logo.png" },
			},
		});
	});

	it("honors an explicit dateModified and article subtype", () => {
		const result = article({
			headline: "H",
			url: "https://x.test/p",
			type: "BlogPosting",
			datePublished: "2026-01-01",
			dateModified: "2026-02-01",
		});
		expect(result["@type"]).toBe("BlogPosting");
		expect(result.dateModified).toBe("2026-02-01");
	});
});

describe("organization / website", () => {
	it("embeds the publisher as a nested Organization without its own @context", () => {
		const result = website({
			name: "Site",
			url: "https://x.test",
			publisher: { name: "Acme" },
		});
		expect(result.publisher).toEqual({ "@type": "Organization", name: "Acme" });
	});

	it("keeps @context on a top-level organization", () => {
		expect(organization({ name: "Acme" })["@context"]).toBe("https://schema.org");
	});

	it("nests a postal address and telephone when provided", () => {
		const result = organization({
			name: "Acme",
			telephone: "+32 2 000 00 00",
			address: {
				streetAddress: "Rue X 1",
				postalCode: "1000",
				addressCountry: "BE",
			},
		});
		expect(result).toMatchObject({
			telephone: "+32 2 000 00 00",
			address: {
				"@type": "PostalAddress",
				streetAddress: "Rue X 1",
				postalCode: "1000",
				addressCountry: "BE",
			},
		});
	});
});

describe("person", () => {
	it("maps a string worksFor to an Organization node and wraps homeLocation as a Place", () => {
		const result = person({
			name: "Jane Doe",
			jobTitle: "Founder",
			worksFor: "Acme",
			homeLocation: "Brussels, Belgium",
		});
		expect(result).toMatchObject({
			"@type": "Person",
			name: "Jane Doe",
			jobTitle: "Founder",
			worksFor: { "@type": "Organization", name: "Acme" },
			homeLocation: { "@type": "Place", name: "Brussels, Belgium" },
		});
	});
});

describe("localBusiness", () => {
	it("nests address/geo/rating and normalises a single image to an array", () => {
		const result = localBusiness({
			name: "Studio",
			type: "ArtGallery",
			image: "https://x.test/cover.jpg",
			address: {
				streetAddress: "Rue X 1",
				postalCode: "1000",
				addressCountry: "BE",
			},
			geo: { latitude: 50.8, longitude: 4.3 },
			aggregateRating: { ratingValue: "5.0", reviewCount: 14 },
		});
		expect(result).toMatchObject({
			"@type": "ArtGallery",
			image: ["https://x.test/cover.jpg"],
			address: {
				"@type": "PostalAddress",
				streetAddress: "Rue X 1",
				postalCode: "1000",
				addressCountry: "BE",
			},
			geo: { "@type": "GeoCoordinates", latitude: 50.8, longitude: 4.3 },
			aggregateRating: {
				"@type": "AggregateRating",
				ratingValue: "5.0",
				reviewCount: "14",
			},
		});
	});
});

describe("event", () => {
	it("defaults endDate/status and encodes the attendance mode + place", () => {
		const result = event({
			name: "Summit",
			startDate: "2026-09-30",
			attendanceMode: "offline",
			location: { name: "Venue", address: "Brussels" },
		});
		expect(result).toMatchObject({
			"@type": "Event",
			startDate: "2026-09-30",
			endDate: "2026-09-30",
			eventStatus: "https://schema.org/EventScheduled",
			eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
			location: { "@type": "Place", name: "Venue", address: "Brussels" },
		});
	});

	it("emits a VirtualLocation for online events", () => {
		const result = event({
			name: "Webinar",
			startDate: "2026-01-01",
			location: { online: true, url: "https://x.test/join" },
		});
		expect(result.location).toEqual({
			"@type": "VirtualLocation",
			url: "https://x.test/join",
		});
	});
});

describe("createSeo", () => {
	const seo = createSeo({
		baseUrl: "https://x.test",
		organization: { name: "Acme", logo: "https://x.test/logo.png" },
	});

	it("resolves relative paths against the base URL", () => {
		expect(seo.absolute("/pricing")).toBe("https://x.test/pricing");
	});

	it("passes absolute URLs through untouched", () => {
		expect(seo.absolute("https://other.test/x")).toBe("https://other.test/x");
	});

	it("resolves breadcrumb paths to absolute item URLs", () => {
		const result = seo.breadcrumbs([
			{ name: "Home", path: "/" },
			{ name: "Pricing", path: "/pricing" },
		]);
		expect(result).toMatchObject({
			itemListElement: [
				{ position: 1, item: "https://x.test/" },
				{ position: 2, item: "https://x.test/pricing" },
			],
		});
	});

	it("injects the configured organization as the article publisher", () => {
		const result = seo.article({
			path: "/blog/x",
			headline: "X",
			image: "/cover.png",
			datePublished: "2026-01-01",
		});
		expect(result.url).toBe("https://x.test/blog/x");
		expect(result.image).toBe("https://x.test/cover.png");
		expect(result.publisher).toMatchObject({ name: "Acme" });
	});

	it("throws if organization() is called without configured org", () => {
		const bare = createSeo({ baseUrl: "https://x.test" });
		expect(() => bare.organization()).toThrow(/organization/);
	});
});
