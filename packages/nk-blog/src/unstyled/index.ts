import { defineBlogComponents } from "../contract.js";
import { Callout } from "./callout.js";
import { Figure } from "./figure.js";
import { NewsletterSubscribe } from "./newsletter-subscribe.js";
import { Tweet } from "./tweet.js";
import { YouTube } from "./youtube.js";

export { Callout, Figure, NewsletterSubscribe, Tweet, YouTube };

/**
 * The complete default registry. A site's whole obligation is:
 *
 *   export const blogComponents = defineBlogComponents({
 *       ...unstyled,
 *       Callout: BrandCallout, // replaced wholesale where the brand cares
 *   });
 */
export const unstyled = defineBlogComponents({
	Callout,
	Figure,
	YouTube,
	Tweet,
	NewsletterSubscribe,
});
