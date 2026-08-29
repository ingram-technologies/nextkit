# `@ingram-tech/nk-api`

A thin layer over [Hono](https://hono.dev) +
[`@hono/zod-openapi`](https://github.com/honojs/middleware/tree/main/packages/zod-openapi)
for hand-authored HTTP APIs. Routes are declared with Zod schemas that double as
request validation and an emitted OpenAPI document, behind one error envelope
(`{ error, details? }`) and one auth contract.

## What it gives you

- **`createApiApp(options)`** — the root `OpenAPIHono`, wired once: validation
  envelope, `onError`, `notFound`, the OpenAPI document, Swagger UI, and a health
  check, all under your `basePath`. You chain route modules onto it.
- **`createRouter(options?)`** — the `OpenAPIHono` a route module should use
  instead of `new OpenAPIHono()`. It bakes in the standard `defaultHook` **and**
  its own `onError` — load-bearing, because a mounted `OpenAPIHono` does **not**
  bubble thrown errors to the parent's `onError` (without this, every thrown
  `HttpError` renders as a bare 500).
- **`HttpError` + `handleError`** — throw `HttpError(status, message, details?)`
  from anywhere; it renders to `{ error, details? }`. `createErrorHandler(logger)`
  lets you wire crash reporting (Sentry/GlitchTip) for the non-`HttpError` 500s.
- **`createRequireAuth(resolveUser)`** — auth middleware parameterized by an
  identity resolver, so the API is decoupled from *how* the user is resolved.
- **`createResourceScope(options)`** — the sibling of `createRequireAuth` for
  multi-tenant routes: validate the resource id in the path, resolve the caller's
  role (your lookup, under RLS), enforce a minimum role, and expose the id + role
  on the context. Returns a `scope(minRole?)` you put in route middleware. If it
  runs without `requireAuth` before it, it 401s instead of crashing on an
  undefined user.
- **`setDefaultErrorLogger(logger)`** — set the crash logger once at startup so
  `createApiApp` and every `createRouter` report unhandled 500s the same way,
  without threading a custom `onError` into each (mounted routers don't bubble).
- **Pagination** — `paginationQuery` (the `page`/`limit` schema),
  `paginatedResponse(itemSchema)` (the `{ data, pagination }` response schema),
  `offsetFor()` and `paginate()` so list endpoints don't re-derive the math.
- **Helpers** — `jsonContent`, `jsonBody`, `errorResponse`, `errorResponses`,
  `ErrorSchema` for terse, uniform `createRoute` definitions.
- **`@ingram-tech/nk-api/next`** — `createNextHandlers(app)` for a Next.js
  catch-all route.
- **`@ingram-tech/nk-api/client`** — `hc` (the typed RPC client), `unwrap`
  (await a typed call and get its success body or throw the envelope error), plus
  `assertResponseOk` / `parseErrorBody`. Import-safe in the browser: it pulls no
  server code.

`hono` and `@hono/zod-openapi` are peer dependencies so your app controls (and
shares) a single copy: duplicate Hono instances break type inference and
`instanceof`. (`@hono/swagger-ui` is a normal dependency, used only inside
nk-api, so consumers never install or import it.)

## Usage (Next.js)

```ts
// src/api/http/auth.ts — bind auth to your identity + env once
import { createRequireAuth, type AuthEnv } from "@ingram-tech/nk-api";
import { getCurrentUser, type AuthUser } from "@/lib/auth/session";

export const requireAuth = createRequireAuth(getCurrentUser);
export type AppEnv = AuthEnv<AuthUser>;
```

```ts
// src/api/http/routes/account.ts — a route module
import { createRoute, z } from "@hono/zod-openapi";
import { createRouter, errorResponse, jsonContent } from "@ingram-tech/nk-api";
import { requireAuth, type AppEnv } from "../auth";

const meRoute = createRoute({
	method: "get",
	path: "/me",
	middleware: [requireAuth] as const,
	responses: {
		200: jsonContent(z.object({ id: z.string() }), "The current user"),
		401: errorResponse("Unauthenticated"),
	},
});

export const accountRoutes = createRouter<AppEnv>().openapi(meRoute, (c) =>
	c.json({ id: c.get("user").id }, 200),
);
```

```ts
// src/api/http/app.ts — assemble. Chaining .route() here (not inside the
// factory) is what lets the route types flow into AppType for the typed client.
import { createApiApp } from "@ingram-tech/nk-api";
import { accountRoutes } from "./routes/account";

const app = createApiApp({ title: "My API", version: "1.0.0", basePath: "/api/v1" })
	.route("/", accountRoutes);

export { app };
export type AppType = typeof app;
```

```ts
// src/app/api/v1/[[...route]]/route.ts
import { createNextHandlers } from "@ingram-tech/nk-api/next";
import { app } from "@/api/http/app";

export const { GET, POST, PATCH, PUT, DELETE, OPTIONS } = createNextHandlers(app);
```

```ts
// src/api/client/http.ts — the browser-safe typed client
import { hc } from "@ingram-tech/nk-api/client";
import type { AppType } from "@/api/http/app"; // type-only: erased at build

export const api = hc<AppType>("/").api.v1;
```

> **Client type-depth ceiling.** A single merged `hc<AppType>` works for a small
> app, but past roughly a dozen routes TypeScript hits its instantiation-depth
> limit (TS2589). When that happens, type the client **per route module** from
> each module's exported route type and compose them into one facade — each tree
> stays shallow:
>
> ```ts
> const profileClient = hc<ProfileRoutes>(BASE);
> const orgClient = hc<OrganizationRoutes>(BASE);
> export const api = {
>   me: profileClient.me,
>   organizations: orgClient.organizations,
> };
> ```

## Org-scoped routes (`createResourceScope`)

Bind the scope once to your role lookup, then gate routes with `scope(minRole?)`.
Always list `requireAuth` before it:

```ts
// src/api/http/org.ts
import { createResourceScope } from "@ingram-tech/nk-api";
import { z } from "@hono/zod-openapi";

export const orgScope = createResourceScope({
  param: "organizationId",
  resolveRole: (user, id) => getOrgRole(user.id, id), // your RPC, under RLS
  hierarchy: ["read_only", "member", "admin", "owner"],
  validate: (v) => z.uuid().safeParse(v).success,
});

// in a route: middleware: [requireAuth, orgScope("admin")] as const
// handler reads c.get("organizationId") and c.get("role")
```

## List endpoints (pagination)

```ts
import { jsonContent, offsetFor, paginate, paginatedResponse, paginationQuery } from "@ingram-tech/nk-api";

const listRoute = createRoute({
  method: "get",
  path: "/things",
  request: { query: paginationQuery.extend({ type: z.string().optional() }) },
  responses: { 200: jsonContent(paginatedResponse(thingSchema), "Paginated things") },
});

// handler:
const { page, limit } = c.req.valid("query");
const rows = await q.range(offsetFor({ page, limit }), offsetFor({ page, limit }) + limit - 1);
return c.json(paginate(rows, { page, limit, total }), 200);
```

## Rate limiting (`rateLimit`)

A zero-dependency, per-instance fixed-window limiter, for cutting off
single-client abuse without Redis. On a multi-replica deploy each replica keeps
its own counter, so the effective limit is `limit * replica_count`; swap in a
shared store if that matters.

```ts
import { getClientKey, rateLimit } from "@ingram-tech/nk-api";

// Per client IP. Exhausting the window short-circuits with the standard 429
// envelope plus Retry-After / X-RateLimit-* headers.
app.use("/api/v1/support", rateLimit({ limit: 5, windowMs: 60_000 }));

// Scope by user/tenant instead of IP. Always fall back to the client IP:
// without it, every unauthenticated request shares one bucket.
app.use(
  "/api/v1/*",
  rateLimit({
    limit: 100,
    windowMs: 60_000,
    key: (c) => c.get("userId") ?? getClientKey(c.req.raw.headers),
  }),
);
```

The primitives `checkRateLimit({ key, limit, windowMs })` and
`getClientKey(headers)` are exported for use outside the middleware.

## Webhook signatures (`verifyHmacSha256`)

Length-checked, constant-time HMAC-SHA256 verification for inbound webhook
routes. Verify against the **raw** body, before any JSON round-trip. (Stripe is
the exception: use its SDK's `constructEvent`, via `@ingram-tech/nk-billing`.)

```ts
import { verifyHmacSha256, HttpError } from "@ingram-tech/nk-api";

const raw = await c.req.text();
const { valid } = verifyHmacSha256({
  payload: raw,
  signature: c.req.header("x-hub-signature-256") ?? "", // `sha256=…` prefix is stripped
  secret: env.WEBHOOK_SECRET,
});
if (!valid) throw new HttpError(401, "Invalid webhook signature");
```

## Consuming the API (`unwrap`)

`unwrap` awaits a typed call and returns its success body, or throws the
envelope's `error`. Use `assertResponseOk` for calls with no body (e.g. a 204):

```ts
import { unwrap } from "@ingram-tech/nk-api/client";

const created = await unwrap(api.things.$post({ json }), "Failed to create thing");
// `created` is the 2xx body, fully typed
```

## Consistent crash logging (`setDefaultErrorLogger`)

```ts
// src/api/http/app.ts (or instrumentation) — once at startup
import { setDefaultErrorLogger } from "@ingram-tech/nk-api";
setDefaultErrorLogger((err) => captureException(err)); // Sentry/GlitchTip/your logger
```

## Usage (standalone, e.g. `@hono/node-server`)

The core entry is framework-agnostic; skip `/next` and serve `app.fetch`:

```ts
import { serve } from "@hono/node-server";
import { app } from "./app";
serve({ fetch: app.fetch, port: 8787 });
```
