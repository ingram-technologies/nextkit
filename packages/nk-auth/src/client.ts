/**
 * Browser auth re-exports, at "@ingram-tech/nk-auth/client" so the server entry
 * never pulls in React. A site builds its own client to preserve full plugin
 * type inference:
 *
 *   "use client";
 *   import {
 *     createAuthClient, jwtClient, passkeyClient,
 *   } from "@ingram-tech/nk-auth/client";
 *
 *   export const authClient = createAuthClient({
 *     baseURL: process.env.NEXT_PUBLIC_SITE_URL,
 *     plugins: [jwtClient(), passkeyClient()],
 *   });
 *
 * This exposes the client auth call surface:
 *   signUp.email / signIn.email / signIn.social / signOut / useSession,
 *   plus passkey.* (register / authenticate).
 */
export { passkeyClient } from "@better-auth/passkey/client";
export { jwtClient } from "better-auth/client/plugins";
export { createAuthClient } from "better-auth/react";
// Re-exported here too so the client can set `basePath` without a server import.
export { authBasePath } from "./paths.js";
