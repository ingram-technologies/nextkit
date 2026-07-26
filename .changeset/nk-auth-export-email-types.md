---
"@ingram-tech/nk-auth": patch
---

Export `AuthEmailKind`, `AuthEmailMessage` and `AuthEmailUser` from the package
root. `makeEmailSenders` gained them in 0.13.0 but they were only reachable by
deep-importing `./options.js`, so a site could not name the `kind` it switches on.
