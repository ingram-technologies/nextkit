import type { CalloutProps } from "../contract.js";

/**
 * Unstyled default. Semantic structure only — style it from the site via the
 * data attributes, or replace it wholesale. No visual props beyond className,
 * ever (the bright line that keeps "unstyled" from eroding into a theme).
 */
export const Callout: React.FC<CalloutProps> = ({
	variant = "note",
	title,
	className,
	children,
}) => (
	<aside data-callout={variant} className={className}>
		{title ? <p data-callout-title>{title}</p> : null}
		<div data-callout-body>{children}</div>
	</aside>
);
