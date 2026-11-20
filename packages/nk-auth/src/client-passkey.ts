/**
 * The passkey client plugin, at "@ingram-tech/nk-auth/client/passkey" rather
 * than "./client" so a site without the optional `@better-auth/passkey` peer
 * still builds:
 *
 *   import { passkeyClient } from "@ingram-tech/nk-auth/client/passkey";
 *
 *   createAuthClient({ basePath: authBasePath, plugins: [passkeyClient()] });
 */
export { passkeyClient } from "@better-auth/passkey/client";
