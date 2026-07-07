---
"@ingram-tech/bot-protection": minor
---

Keep the "never punish real users" promise under failure modes:

- **The `/react` hook no longer fails closed against real users.** A transiently failed token fetch left the token empty forever, so the server silently dropped a real user's submission. The fetch now validates the response shape and retries once, and the hook returns a `ready` flag so forms can gate submission on the token having resolved. `useBotProtection` also accepts `honeypotField` and `<HoneypotInput>` a `name` prop, so JSON forms can override the trap name like the server side always could.
- **The BotID degrade path is observable.** Bundler file-tracing can exclude `botid/server` from a deployed function (nothing imports it statically), and the bare `catch {}` made a permanently disabled layer 3 indistinguishable from "no bots today". The degrade now logs one warning per process, and a malformed `checkBotId` result is handled defensively.
- **Secret rotation without dropped forms.** `BOT_PROTECTION_SECRET` accepts a comma-separated list — tokens sign with the first secret and verify against all, so rotating no longer invalidates up-to-an-hour of in-flight forms (whose submissions were silently dropped).
- **README documents the static-prerender hazard.** The canonical example minted the token in a server component with no dynamic API access, so Next statically prerenders it and the timestamp is the *build* time — an hour after deploy, every legitimate submission verified as "expired" and vanished. Both the page and the token-GET examples now carry `force-dynamic` and an explanation.
