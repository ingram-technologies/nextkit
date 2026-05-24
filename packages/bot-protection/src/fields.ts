/**
 * Shared field names used by the honeypot component and the server verifier.
 * Kept in one place so the client and server never drift.
 */

/** Hidden field real users never fill; bots auto-complete it. */
export const HONEYPOT_FIELD = "company_url";

/** Hidden field carrying the signed timing token. */
export const TOKEN_FIELD = "_bp_token";
