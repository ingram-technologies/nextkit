import type { FigureProps } from "../contract.js";

const toDimension = (value: number | string | undefined): number | undefined =>
	typeof value === "string" ? Number(value) : value;

/**
 * Unstyled captioned image: correct semantics (figure/figcaption), lazy
 * loading, and explicit dimensions when given (CLS). Sites wanting
 * next/image replace this wholesale.
 */
export const Figure: React.FC<FigureProps> = ({
	src,
	alt,
	caption,
	width,
	height,
	className,
}) => (
	<figure className={className}>
		<img
			src={src}
			alt={alt}
			width={toDimension(width)}
			height={toDimension(height)}
			loading="lazy"
			decoding="async"
		/>
		{caption ? <figcaption>{caption}</figcaption> : null}
	</figure>
);
