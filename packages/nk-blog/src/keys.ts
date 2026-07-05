import { z } from "zod";

/**
 * Env contract. Only the GitHub source/publisher needs anything, and callers
 * may inject the token directly instead — so everything here is optional.
 */
export const keys = () =>
	z
		.object({
			GITHUB_TOKEN: z.string().min(1).optional(),
		})
		.parse(process.env);
