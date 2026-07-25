---
"@ingram-tech/nk-email": minor
---

`EmailCatalogEntry.html` and `.text` are now optional, matching what
`defineEmailCatalog` has always validated at runtime (an entry needs one *or*
the other) and what real senders do — a message may carry only one MIME part.

Previously both were typed as required `string`, so a builder returning
`{ subject, html }` for an HTML-only mail (e.g. an invoice with a PDF attached)
could not be spread into a catalog entry without a placeholder `text: ""`. The
type now says what the module means. Existing catalogs are unaffected.
