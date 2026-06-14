# @ingram-tech/git-hooks

Shared git hooks for Ingram Technologies projects. Zero-runtime-dependency: a
**format-only pre-commit** that runs oxfmt on staged files and re-stages them.
Linting stays in CI; commits stay fast.

We deliberately avoid husky/lefthook — git's native `core.hooksPath` plus a
committed hook script is enough, and adds no dependency.

## Install

```bash
bun add -d @ingram-tech/git-hooks
```

## Set up

1. Add a committed hook at `.githooks/pre-commit`:

   ```sh
   #!/bin/sh
   set -eu
   exec bunx --bun nextkit-format-staged
   ```

   ```bash
   chmod +x .githooks/pre-commit
   ```

2. Point git at it via a `prepare` script (runs on `bun install`):

   ```json
   {
   	"scripts": {
   		"prepare": "git config core.hooksPath .githooks || true"
   	}
   }
   ```

That's it. The formatting logic lives in this package, so a version bump updates
the behavior across every repo without editing their hook scripts.
