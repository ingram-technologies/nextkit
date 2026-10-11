---
"@ingram-tech/nk-dev": patch
---

oxlint plugin fixes:

- `nextkit/no-crypto-random-uuid` now flags `randomUUID()` called on the
  node:crypto module imported whole (`import crypto from "node:crypto"`,
  `import * as c from "crypto"`). These were treated as a local `crypto`
  shadowing the global and skipped.
- `nextkit/no-sql-array-cast` now catches the cast with whitespace before
  `::` (`${ids} ::uuid[]`).
- `nextkit/no-server-env-in-client` now flags non-public names destructured
  from `process.env` in a `"use client"` file
  (`const { STRIPE_SECRET_KEY } = process.env`).
- `nextkit/base-ui-native-button` now matches Base UI's namespace form, so
  `<Popover.Trigger render={<a />} />` is checked like `PopoverTrigger`. It no
  longer reports `MenuItem` or `Switch`: in Base UI their `nativeButton`
  defaults to `false`, so rendering a non-button through them was already
  correct.
