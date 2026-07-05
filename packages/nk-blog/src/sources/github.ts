import { z } from "zod";
import type { BlogSource, RawPostFile } from "../blog.js";
import { assertResponseOk } from "../http.js";
import { keys } from "../keys.js";

export interface GitHubRepoConfig {
	owner: string;
	repo: string;
	/** Branch, tag, or commit; defaults to the repo's default branch. */
	ref?: string;
	/** Content directory inside the repo, e.g. "content/blog". */
	dir: string;
	/** Falls back to the GITHUB_TOKEN env var. */
	token?: string;
}

const API = "https://api.github.com";

export function githubHeaders(token: string | undefined): Record<string, string> {
	const resolved = token ?? keys().GITHUB_TOKEN;
	return {
		accept: "application/vnd.github+json",
		"x-github-api-version": "2022-11-28",
		"user-agent": "nk-blog",
		...(resolved ? { authorization: `Bearer ${resolved}` } : {}),
	};
}

const treeSchema = z.object({
	truncated: z.boolean(),
	tree: z.array(
		z.object({
			path: z.string(),
			type: z.string(),
			sha: z.string(),
		}),
	),
});

const blobSchema = z.object({
	content: z.string(),
	encoding: z.literal("base64"),
});

/**
 * Read a repo's posts over the GitHub API — the admin publisher's read path
 * (list a target's real posts; reconcile instead of blind-append). One Trees
 * call for the listing, then batched blob fetches: never per-file `contents`
 * round-trips.
 */
export function githubSource(config: GitHubRepoConfig): BlogSource {
	return {
		async load(): Promise<RawPostFile[]> {
			const headers = githubHeaders(config.token);
			const base = `${API}/repos/${config.owner}/${config.repo}`;
			const ref = config.ref ?? "HEAD";

			const treeResponse = await fetch(
				`${base}/git/trees/${encodeURIComponent(ref)}?recursive=1`,
				{ headers },
			);
			await assertResponseOk(
				treeResponse,
				`nk-blog: listing ${config.owner}/${config.repo}@${ref}`,
			);
			const { tree, truncated } = treeSchema.parse(await treeResponse.json());
			if (truncated) {
				throw new Error(
					`nk-blog: git tree for ${config.owner}/${config.repo} is truncated; narrow \`dir\``,
				);
			}

			const prefix = `${config.dir.replace(/\/$/, "")}/`;
			const files = tree.filter(
				(entry) =>
					entry.type === "blob" &&
					entry.path.startsWith(prefix) &&
					/\.mdx?$/.test(entry.path),
			);

			return Promise.all(
				files.map(async (entry) => {
					const blobResponse = await fetch(`${base}/git/blobs/${entry.sha}`, {
						headers,
					});
					await assertResponseOk(
						blobResponse,
						`nk-blog: reading ${entry.path}`,
					);
					const blob = blobSchema.parse(await blobResponse.json());
					return {
						name: entry.path.slice(prefix.length),
						content: Buffer.from(blob.content, "base64").toString("utf8"),
					};
				}),
			);
		},
	};
}
