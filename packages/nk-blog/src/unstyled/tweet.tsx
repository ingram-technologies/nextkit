import type { TweetProps } from "../contract.js";

/**
 * Zero-JS default: the standard `twitter-tweet` blockquote, progressively
 * enhanced if the site loads the platform widget script — otherwise it
 * degrades to a plain link. No data fetching in the package.
 */
export const Tweet: React.FC<TweetProps> = ({ id, className }) => (
	<blockquote className={["twitter-tweet", className].filter(Boolean).join(" ")}>
		<a href={`https://twitter.com/i/status/${encodeURIComponent(id)}`}>View post</a>
	</blockquote>
);
