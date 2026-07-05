import type { NewsletterSubscribeProps } from "../contract.js";

/**
 * Plain HTML form POSTing to the injected endpoint — works with zero client
 * JS. The package never bakes in a newsletter backend.
 */
export const NewsletterSubscribe: React.FC<NewsletterSubscribeProps> = ({
	action,
	placeholder,
	buttonLabel,
	className,
}) => (
	<form action={action} method="post" className={className}>
		<input
			type="email"
			name="email"
			required
			placeholder={placeholder ?? "you@example.com"}
			aria-label="Email address"
		/>
		<button type="submit">{buttonLabel ?? "Subscribe"}</button>
	</form>
);
