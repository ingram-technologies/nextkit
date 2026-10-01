---
"@ingram-tech/nk-dev": minor
---

Type-aware lint with no setup: nk-dev depends on `oxlint-tsgolint`, and `nk lint` and `nk check` hand its native binary to oxlint through `OXLINT_TSGOLINT_PATH` (a path you set wins). Turn the rules on with `"options": { "typeAware": true }` in `.oxlintrc.json`; without it, lint is unchanged.

The agent-guide gate in `nk check`, the `nk doctor` finding and `nk init` accept the guide import from any `CLAUDE.md` between the working directory and the repository root. A workspace member's own `CLAUDE.md` no longer fails the gate, and `doctor --fix` and `init` no longer add a second import.
