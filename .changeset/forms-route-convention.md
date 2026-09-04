---
"@ingram-tech/nk-dev": patch
---

guide: forms live at `/internal/forms/<name>` via nk-forms' `createFormsHandler`,
never under `/api`. The `/api` vs `/internal` rule is now about contract, not
caller: `/api` is what someone could build on; `/internal` is everything the app
owns, including its own browser-called forms, which are bot-gated rather than
worker-secret-gated.
