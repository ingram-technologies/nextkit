# @ingram-tech/email

## 0.1.1

### Patch Changes

- Add explicit `.js` extensions to relative re-exports in the package entry point. The package ships as `"type": "module"`, so the previous extensionless `export … from "./client"` emitted invalid ESM that Node/Bun could not resolve at runtime (`Cannot find module …/dist/client`) when consumed unbundled. Imports now resolve correctly.
