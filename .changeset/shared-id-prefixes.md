---
"@ingram-tech/nk-db": minor
---

`@ingram-tech/nk-db/id` exports `SHARED_ID_PREFIXES` (`{ user: "usr", organization: "org" }`), and its `createIdRegistry` now throws when a registry maps `user` or `organization` to any other prefix, so every site skins session ids the same way. Registries without those keys, or already using `usr` / `org`, are unaffected.
