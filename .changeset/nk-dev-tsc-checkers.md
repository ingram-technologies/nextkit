---
"@ingram-tech/nk-dev": patch
---

`tsconfig/nextjs.json` sets `"checkers": 1`. TypeScript 7 sizes its parallel checker pool to the CPU count, and Next.js 16 runs `tsc` against the project tsconfig during `next build`: on a real app the default pool peaked at 6.82 GB (17.9 s), enough to OOM Vercel's standard 7-8 GB build machine. One checker peaks at ~3.3 GB for ~23 s. `tsc --checkers N` on the command line still overrides it for a fast local run, and a site that already sets `checkers` in its own tsconfig keeps its value (it can drop it now).
