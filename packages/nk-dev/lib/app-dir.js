import { statSync } from "node:fs";
import { resolve } from "node:path";

// A Next site keeps its routes in `src/app/`, never a root `app/`. Next accepts
// both and silently prefers the root one when both exist, so a stray `app/`
// shadows the whole `src/app/` tree. nk's checks and lint rules (the endpoint
// shadow check, the OG image check, `no-redirect-only-page`, ...) only look in
// `src/app/`, so a root-`app/` site would also pass them without being checked.

const isDirectory = (path) => {
	try {
		return statSync(path).isDirectory();
	} catch {
		return false;
	}
};

const dependsOnNext = (pkg) =>
	Boolean(pkg.dependencies?.next ?? pkg.devDependencies?.next);

/** The "routes live in a root app/" finding, or nothing. */
export function appDirFindings(cwd, pkg) {
	if (!dependsOnNext(pkg) || !isDirectory(resolve(cwd, "app"))) return [];
	const both = isDirectory(resolve(cwd, "src/app"));
	return [
		{
			id: "layout:root-app-dir",
			level: "error",
			message: both
				? "`app/` and `src/app/` both exist — Next serves `app/` and ignores `src/app/` entirely. Merge the routes into `src/app/` and delete `app/`."
				: "routes live in a root `app/` — nextkit sites keep them in `src/app/`, the only place nk's checks and lint rules look. Move `app/` to `src/app/` and update tsconfig `paths` that point into it.",
		},
	];
}
