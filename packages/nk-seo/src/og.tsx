import { ImageResponse } from "next/og";

type ImageResponseOptions = NonNullable<ConstructorParameters<typeof ImageResponse>[1]>;

/**
 * A branded Open Graph / Twitter card built with `next/og`. Lives on its own
 * entry (`@ingram-tech/nk-seo/og`) because it imports `next/og` (satori + the
 * resvg wasm) — the package root and `/components` stay free of it.
 *
 * Satori gotcha this template encodes so you don't have to: **every element
 * with more than one child must set `display: "flex"`**, and you may not mix a
 * text node and an element as siblings. The layout below keeps each region a
 * single text node, so titles stay plain strings and the accent is carried by
 * the mark — never by a coloured `<span>` inside the headline.
 */
export interface OgImageOptions {
	/** The headline. Kept a single text node (no inline markup) for Satori. */
	title: string;
	/** Secondary line under the title. */
	subtitle?: string;
	/** Small label above the title (e.g. a section or category). */
	eyebrow?: string;
	/** Bottom-left footer, e.g. the bare domain. */
	footer?: string;
	/** Brand name shown next to the mark, top-left. */
	wordmark?: string;
	/**
	 * Logo image rendered as the top-left mark instead of the accent square.
	 * Absolute URL or data URI (Satori fetches it at render time).
	 */
	logo?: string;
	/** Accent colour — the mark, and the eyebrow if present. Default indigo. */
	accent?: string;
	background?: string;
	/** Primary text colour. */
	ink?: string;
	/** Secondary text colour (subtitle, footer). */
	muted?: string;
	size?: { width: number; height: number };
	/**
	 * Custom fonts, passed through to `ImageResponse` (Satori accepts raw
	 * TTF/OTF/WOFF data). Pair with `fontFamily` to actually use them.
	 */
	fonts?: ImageResponseOptions["fonts"];
	/** Font family for the whole card. Default "sans-serif". */
	fontFamily?: string;
}

const DEFAULTS = {
	accent: "#565ac9",
	background: "#ffffff",
	ink: "#171717",
	muted: "#8a8a8a",
	size: { width: 1200, height: 630 },
};

/**
 * Returns an `ImageResponse` for use as the body of an `opengraph-image` /
 * `twitter-image` route.
 *
 * @example
 * // app/opengraph-image.tsx
 * import { ogImageResponse } from "@ingram-tech/nk-seo/og";
 * export const size = { width: 1200, height: 630 };
 * export const contentType = "image/png";
 * export default () =>
 *   ogImageResponse({
 *     title: "Ship faster with Acme",
 *     subtitle: "The all-in-one platform for modern teams.",
 *     wordmark: "Acme",
 *     footer: "example.com",
 *   });
 */
export function ogImageResponse(options: OgImageOptions): ImageResponse {
	const accent = options.accent ?? DEFAULTS.accent;
	const background = options.background ?? DEFAULTS.background;
	const ink = options.ink ?? DEFAULTS.ink;
	const muted = options.muted ?? DEFAULTS.muted;
	const size = options.size ?? DEFAULTS.size;

	return new ImageResponse(
		<div
			style={{
				width: "100%",
				height: "100%",
				display: "flex",
				flexDirection: "column",
				justifyContent: "space-between",
				background,
				padding: "80px",
				fontFamily: options.fontFamily ?? "sans-serif",
			}}
		>
			<div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
				{options.logo ? (
					<img src={options.logo} width={44} height={44} alt="" />
				) : (
					<div
						style={{
							width: "44px",
							height: "44px",
							borderRadius: "12px",
							background: accent,
						}}
					/>
				)}
				{options.wordmark ? (
					<div style={{ fontSize: "40px", fontWeight: 600, color: ink }}>
						{options.wordmark}
					</div>
				) : null}
			</div>

			<div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
				{options.eyebrow ? (
					<div
						style={{
							fontSize: "28px",
							fontWeight: 600,
							letterSpacing: "0.04em",
							textTransform: "uppercase",
							color: accent,
						}}
					>
						{options.eyebrow}
					</div>
				) : null}
				<div
					style={{
						fontSize: "76px",
						fontWeight: 700,
						lineHeight: 1.05,
						letterSpacing: "-0.02em",
						color: ink,
						maxWidth: "1000px",
					}}
				>
					{options.title}
				</div>
				{options.subtitle ? (
					<div style={{ fontSize: "34px", color: muted, maxWidth: "900px" }}>
						{options.subtitle}
					</div>
				) : null}
			</div>

			{options.footer ? (
				<div style={{ fontSize: "30px", color: muted }}>{options.footer}</div>
			) : (
				<div style={{ display: "flex" }} />
			)}
		</div>,
		{ ...size, ...(options.fonts ? { fonts: options.fonts } : {}) },
	);
}
