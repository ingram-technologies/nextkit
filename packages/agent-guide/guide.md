# nextkit (for AI agents)

This is a **nextkit** site — Ingram Technologies' shared Next.js foundation.
Core idea: don't reinvent shared concerns — reach for the `@ingram-tech/*`
package. Stay a thin, standard Next.js app (bun · Biome · strict TS).

## Hard rules

- **Any form that emails or stores a submission MUST use `@ingram-tech/bot-protection`**
  (server: `verifyHuman` → silently drop bots; client: honeypot + signed token).
  Never ship a form without it.
- **Send email only via `@ingram-tech/email`** — never add another mail client.
- Format/lint with **Biome** via `nk` (`@ingram-tech/nk-cli`); don't reintroduce
  ESLint, nor Prettier for code (`nk` uses Prettier only for SQL, which Biome
  can't format).

## What nextkit provides (reach for these)

- `@ingram-tech/email` — Cloudflare email: `sendEmail`, `fromAddress`
- `@ingram-tech/bot-protection` — invisible form protection (honeypot + timing + Vercel BotID)
- `@ingram-tech/newsletter` — Supabase newsletter: subscribe / send, 1-click unsubscribe
- `@ingram-tech/nk-cli` — the `nk` command: `nk dev` (Next + local Supabase), plus `nk format` / `lint` / `check` / `type-check` / `build`
- `@ingram-tech/biome-config` · `typescript-config` · `test-config` — shared config
- `@ingram-tech/git-hooks` — Biome format-on-commit

For detail on any package, read its README in `node_modules/@ingram-tech/<pkg>/`.
