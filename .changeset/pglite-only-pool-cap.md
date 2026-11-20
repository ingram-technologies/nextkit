---
"@ingram-tech/nk-db": minor
---

`createPool` caps only the PGlite socket at `max: 1`, recognized by the `application_name=nk-pglite` the harness now puts on its URL (`PGLITE_APPLICATION_NAME`). A real local Postgres keeps a normal pool and honors `DATABASE_POOL_MAX`. A harness that builds its own `PGLiteSocketServer` URL appends `?application_name=${PGLITE_APPLICATION_NAME}` (or passes `max: 1`) to keep the cap.
