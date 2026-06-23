# @ingram-tech/nk-email

> Versions `0.1.0`–`0.1.2` below were published under the old package name
> `@ingram-tech/email`, which is now deprecated.

## 0.1.2

### Patch Changes

- 568ea58: `keys()` now narrows the validated env vars with a combined guard instead of
  `as string` casts — no behavior change, but it follows the house "no `as` on
  external input" rule that the package documents.

## 0.1.1

### Patch Changes

- Add explicit `.js` extensions to relative re-exports in the package entry point. The package ships as `"type": "module"`, so the previous extensionless `export … from "./client"` emitted invalid ESM that Node/Bun could not resolve at runtime (`Cannot find module …/dist/client`) when consumed unbundled. Imports now resolve correctly.
