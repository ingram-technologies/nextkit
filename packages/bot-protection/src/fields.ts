/**
 * Shared field names used by the honeypot component and the server verifier.
 * Kept in one place so the client and server never drift.
 */

/**
 * Default hidden field real users never fill; bots auto-complete it.
 *
 * Deliberately *not* a name browsers or password managers autofill — anything
 * containing company / url / email / name / phone / address / organization /
 * website gets filled for real users, which trips the trap and silently drops
 * legitimate submissions. If this default would collide with a real field in
 * your form (e.g. a genuine "subject"), override it: pass the same name as
 * `field` to `<HoneypotField/>` and `honeypotField` to `verifyHuman()`.
 */
export const HONEYPOT_FIELD = "contact_detail";

/** Hidden field carrying the signed timing token. */
export const TOKEN_FIELD = "_bp_token";
