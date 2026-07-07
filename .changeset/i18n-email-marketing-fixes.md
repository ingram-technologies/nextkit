---
"@ingram-tech/nk-i18n": patch
"@ingram-tech/nk-email": patch
"@ingram-tech/nk-marketing": patch
---

nk-i18n:

- `negotiateAcceptLanguage` honors q-values per RFC 9110: the highest quality wins instead of raw header order, and a `q=0` (explicit rejection) can no longer be selected.
- `t()` no longer throws at request time on a malformed catalog entry, a missing placeholder value, or an invalid locale tag — it degrades to the raw message and warns once per key. Previously one bad `fr` entry 500'd every French page rendering it, invisible to base-locale testing.
- The ICU formatter cache is bounded (an unvalidated user-controlled locale could grow it without limit), and `MissingKeysPolicy` is documented as reserved/not-yet-consumed.

nk-email:

- `fromAddress` validates the local part with the same header-injection guard as the display name (it was interpolated raw into the address).
- `buildListUnsubscribeHeaders` rejects values containing control characters, angle brackets, or commas, which would silently corrupt the RFC 8058 header pair.
- `DEFAULT_TIMEOUT_MS` is exported from the package root (it was referenced by public JSDoc but unimportable).

nk-marketing:

- **`subscribe()` clears a global opt-out** — an explicit re-subscribe is fresh consent. Previously a contact who globally unsubscribed and later signed up again got a "successful" subscription but was silently excluded from every broadcast forever, with no code path able to detect it.
- `identify`/`subscribe` validate the email up front with a descriptive error (mirroring the migration's check constraint) instead of surfacing a raw Postgres constraint violation.
- A failing `releaseDelivery` can no longer abort the rest of a broadcast batch or mask the original send error in `sendLifecycle`.
- Inbox preview text is sliced by code points, so a cut can't land inside an emoji's surrogate pair.
