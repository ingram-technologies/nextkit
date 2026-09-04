---
"@ingram-tech/nk-forms": minor
---

Add `createFormsHandler` + `defineForm`: one `{ GET, POST }` route for every
public form on the site, mounted at `/internal/forms/[form]`. The registry key
becomes the URL, the log label and the rate-limit namespace, so adding a form is
adding an entry instead of copying a route file. The site's limiter is a
callback receiving `{ request, form, limit, windowMs }` (per-form budgets
override a handler-wide default of 5 per 10 minutes); nk-forms still owns no
store. `formEndpoint(name)` / `FORMS_BASE_PATH` (root and `/react`) build the
client URL. Forms move out of `/api`: it is the public API contract, and a form
POST is not part of it. `handleFormSubmission` and `mintFormToken` remain for a
standalone route.
