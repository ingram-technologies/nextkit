---
"@ingram-tech/nk-dev": patch
---

Guide: Better Auth on uuid columns takes `generateId: "uuid"`, never `false`. With `false`, the deterministic single-use ids (magic-link and email-OTP reservations) are base64url and the uuid `verification.id` rejects them, so those sign-ins 500.
