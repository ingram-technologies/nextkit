---
"@ingram-tech/bot-protection": minor
---

Add a `/react` client export: `useBotProtection(tokenEndpoint)` + `HoneypotInput`, for client components that POST JSON to their own route. Replaces the hand-copied `src/lib/bot-protection.tsx` that had been duplicated across sites, keeping the honeypot field name and timing token in lockstep with the server verifier.
