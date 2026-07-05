import type { YouTubeProps } from "../contract.js";

/**
 * Privacy-enhanced (youtube-nocookie), lazy-loaded embed with a stable 16:9
 * box (CLS). The inline aspect-ratio is behavior, not styling.
 */
export const YouTube: React.FC<YouTubeProps> = ({ id, title, start, className }) => {
	const startSeconds = typeof start === "string" ? Number(start) : start;
	const src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}${
		startSeconds ? `?start=${startSeconds}` : ""
	}`;
	return (
		<iframe
			src={src}
			title={title ?? "YouTube video"}
			loading="lazy"
			allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
			allowFullScreen
			referrerPolicy="strict-origin-when-cross-origin"
			className={className}
			style={{ aspectRatio: "16 / 9", width: "100%", border: 0 }}
		/>
	);
};
