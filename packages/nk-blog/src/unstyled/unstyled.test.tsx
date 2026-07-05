import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Callout, Figure, NewsletterSubscribe, Tweet, YouTube } from "./index.js";

describe("unstyled vocabulary", () => {
	it("Callout: semantic aside with variant data attribute", () => {
		const html = renderToStaticMarkup(
			<Callout variant="warning" title="Heads up" className="x">
				Body
			</Callout>,
		);
		expect(html).toContain('data-callout="warning"');
		expect(html).toContain("Heads up");
		expect(html).toContain('class="x"');
	});

	it("Figure: lazy img with dimensions and caption", () => {
		const html = renderToStaticMarkup(
			<Figure src="/x.png" alt="X" caption="cap" width="1200" height={630} />,
		);
		expect(html).toContain('loading="lazy"');
		expect(html).toContain('width="1200"');
		expect(html).toContain("<figcaption>cap</figcaption>");
	});

	it("YouTube: nocookie host, lazy, stable aspect box", () => {
		const html = renderToStaticMarkup(<YouTube id="abc" start="30" />);
		expect(html).toContain("youtube-nocookie.com/embed/abc?start=30");
		expect(html).toContain('loading="lazy"');
		expect(html).toContain("aspect-ratio:16 / 9");
	});

	it("Tweet: progressive-enhancement blockquote", () => {
		const html = renderToStaticMarkup(<Tweet id="123" />);
		expect(html).toContain('class="twitter-tweet"');
		expect(html).toContain("twitter.com/i/status/123");
	});

	it("NewsletterSubscribe: plain form POSTing to the injected action", () => {
		const html = renderToStaticMarkup(<NewsletterSubscribe action="/api/x" />);
		expect(html).toContain('action="/api/x"');
		expect(html).toContain('type="email"');
	});
});
