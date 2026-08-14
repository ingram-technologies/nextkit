/**
 * Where Better Auth mounts in an Ingram site: **`/auth`**, not the framework
 * default `/api/auth`. Auth is a first-class user-facing surface — sign-in,
 * OAuth callbacks, the JWKS — not an internal machine API, so it lives at the
 * site root alongside the other pages.
 *
 * Use it on both ends so server and client agree:
 *
 *   betterAuth({ basePath: authBasePath, ... })
 *   createAuthClient({ baseURL, basePath: authBasePath, ... })
 *
 * and mount the catch-all at `app/auth/[...all]/route.ts`. OAuth redirect URIs
 * then become `<site>/auth/callback/<provider>` and the JWKS `<site>/auth/jwks`.
 *
 * Sign-in pages share this namespace, and a page whose path matches a Better
 * Auth endpoint shadows it (static segments beat the catch-all) — `nk doctor`
 * flags such collisions.
 */
export const authBasePath = "/auth";
