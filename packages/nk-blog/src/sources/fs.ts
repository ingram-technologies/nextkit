import fs from "node:fs/promises";
import path from "node:path";
import type { BlogSource, RawPostFile } from "../blog.js";

/**
 * Build-time filesystem source. The blog contract is full SSG: call this from
 * `generateStaticParams`-driven pages (with `dynamicParams = false`), sitemap
 * and RSS route handlers — all of which run at build. It must NOT be relied on
 * at request time on serverless hosts: output file tracing does not follow
 * `fs` reads made inside a published package, so the content directory may be
 * absent from the deployed function (`outputFileTracingIncludes` is the escape
 * hatch if you truly need runtime reads).
 */
export function fsSource(dir: string): BlogSource {
	const root = path.isAbsolute(dir) ? dir : path.join(process.cwd(), dir);

	return {
		async load(): Promise<RawPostFile[]> {
			let entries;
			try {
				entries = await fs.readdir(root, { withFileTypes: true });
			} catch (error) {
				if (
					error instanceof Error &&
					"code" in error &&
					error.code === "ENOENT"
				) {
					return [];
				}
				throw error;
			}

			const names: string[] = [];
			for (const entry of entries) {
				if (entry.isFile() && /\.mdx?$/.test(entry.name)) {
					names.push(entry.name);
				} else if (entry.isDirectory()) {
					// Folder post: <slug>/index.md(x) with colocated assets/code.
					for (const index of ["index.mdx", "index.md"]) {
						try {
							await fs.access(path.join(root, entry.name, index));
							names.push(`${entry.name}/${index}`);
							break;
						} catch {
							// keep looking
						}
					}
				}
			}

			return Promise.all(
				names.map(async (name) => ({
					name,
					content: await fs.readFile(path.join(root, name), "utf8"),
				})),
			);
		},
	};
}
