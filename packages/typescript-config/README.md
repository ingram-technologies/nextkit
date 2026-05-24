# @ingram-tech/typescript-config

Shared TypeScript configurations for Ingram Technologies projects. Strict by
default.

## Install

```bash
bun add -d @ingram-tech/typescript-config typescript
```

## Use

**A Next.js app** — `tsconfig.json`:

```json
{
	"extends": "@ingram-tech/typescript-config/nextjs.json",
	"include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
	"exclude": ["node_modules"]
}
```

**A library package** — `tsconfig.json`:

```json
{
	"extends": "@ingram-tech/typescript-config/base.json",
	"compilerOptions": { "outDir": "dist", "rootDir": "src" },
	"include": ["src"]
}
```

## What it enforces

- `strict: true` **and** `noUncheckedIndexedAccess: true` — array/object index
  access is typed as possibly-`undefined`, which catches a whole class of bugs.
- `moduleResolution: "bundler"`, `isolatedModules`, `esModuleInterop` — the
  modern, bundler-friendly baseline.
- The base config emits declarations + sourcemaps (for publishable packages);
  the Next.js preset turns emit off (`noEmit`) since Next handles compilation.
