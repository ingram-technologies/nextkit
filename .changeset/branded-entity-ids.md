---
"@ingram-tech/nk-db": minor
---

`createIdRegistry` now returns entity-branded helpers. `mint()`/`encode()` return `Id<E>` (branded by the registry key, e.g. `Id<"org">`), `decode()`/`decodeOrNull()` return a distinct `Uuid` brand, and `is()` narrows to `Id<E>`. New `Id<E>` and `Uuid` types are exported. This makes two silent bug classes compile errors: mixing ids of different entities (`org` vs `agent`), and feeding a skinned public id into a raw-uuid slot (or vice versa). The brands are erased at runtime and both are assignable to `string`, so this is backward-compatible — existing call sites keep compiling. Deliberately untyped input opts out with `x as Id<"...">` / `x as Uuid`.
