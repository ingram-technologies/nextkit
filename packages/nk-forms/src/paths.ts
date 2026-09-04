/**
 * Where a site mounts its forms. Forms are plumbing the app owns, not part of
 * its public API contract, so they live under `/internal` (see the nk-dev
 * guide, "Route & URL conventions") — anonymous and bot-gated, never behind
 * the worker secret the rest of `/internal` uses.
 */
export const FORMS_BASE_PATH = "/internal/forms";

/**
 * The endpoint for one named form in the registry: the client hook fetches its
 * token from and posts to `formEndpoint("contact")` → `/internal/forms/contact`.
 */
export const formEndpoint = (name: string, basePath = FORMS_BASE_PATH): string =>
	`${basePath}/${encodeURIComponent(name)}`;
