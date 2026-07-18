---
"@ingram-tech/nk-billing": patch
---

Small consistency fixes: `getBillingSummary` now guards the `trial_started_at`
parse with `Number.isFinite` (matching `entitled()`), so an unparseable
timestamp yields `trialEndsAt: null` instead of `NaN`; `readBalance` falls back
to `DEFAULT_CURRENCY` instead of a duplicated hardcoded `"eur"`; and the `keys.ts`
docstring now describes the real `billingEnv().webhookSecret` fields rather than
non-existent `webhookSecret()` helper functions.
