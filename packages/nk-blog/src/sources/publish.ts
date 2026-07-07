import matter from "gray-matter";
import { z } from "zod";
import {
	blogFrontmatterSchema,
	type BlogFrontmatterInput,
	slugPattern,
} from "../schema.js";
import type { PostFormat } from "../types.js";
import { assertResponseOk } from "../http.js";
import { githubHeaders, type GitHubRepoConfig } from "./github.js";

const API = "https://api.github.com";

/** Canonical on-disk form of a post: YAML frontmatter + body, one trailing \n. */
export function serializePost(frontmatter: BlogFrontmatterInput, body: string): string {
	// Validate before serializing so admin can never commit a file the sites'
	// readers would reject at build time.
	blogFrontmatterSchema.parse(frontmatter);
	return `${matter.stringify(`\n${body.trim()}\n`, frontmatter).trim()}\n`;
}

export interface PublishPostInput {
	slug: string;
	frontmatter: BlogFrontmatterInput;
	body: string;
	/** Admin's automated path emits "md" (data, never code) — the default. */
	format?: PostFormat;
	message?: string;
	/** Commit to this branch (e.g. for a draft/preview PR) instead of the ref. */
	branch?: string;
	/** Update an existing post instead of failing the slug-collision check. */
	overwrite?: boolean;
}

const putResponseSchema = z.object({
	content: z.object({ path: z.string(), sha: z.string() }),
	commit: z.object({ sha: z.string(), html_url: z.string().optional() }),
});

export type PublishedPost = z.infer<typeof putResponseSchema>;

/**
 * Publish a post by committing one content file to the target repo — the
 * entire replacement for admin's buildPostsJson/buildMdx machinery.
 */
export async function publishPost(
	target: GitHubRepoConfig,
	input: PublishPostInput,
): Promise<PublishedPost> {
	if (!slugPattern.test(input.slug)) {
		// The slug lands in a repo file path — anything looser is a traversal
		// vector (`../.github/workflows/x`) and breaks routes/RSS URLs anyway.
		throw new Error(`nk-blog: invalid slug "${input.slug}"`);
	}
	const frontmatterSlug = input.frontmatter.slug;
	if (frontmatterSlug !== undefined && frontmatterSlug !== input.slug) {
		// The reader routes by the frontmatter override, so a mismatch defeats
		// the filename-based collision check below and can break the target
		// site's build with a duplicate-slug error.
		throw new Error(
			`nk-blog: frontmatter slug "${frontmatterSlug}" does not match publish slug "${input.slug}"`,
		);
	}
	const headers = githubHeaders(target.token);
	const base = `${API}/repos/${target.owner}/${target.repo}`;
	const filePath = `${target.dir.replace(/\/$/, "")}/${input.slug}.${
		input.format ?? "md"
	}`;
	const branch = input.branch ?? target.ref;
	const refQuery = branch ? `?ref=${encodeURIComponent(branch)}` : "";

	// Slug-collision check (and the sha needed when overwriting).
	const existing = await fetch(`${base}/contents/${filePath}${refQuery}`, {
		headers,
	});
	let existingSha: string | undefined;
	if (existing.ok) {
		if (!input.overwrite) {
			throw new Error(
				`nk-blog: ${filePath} already exists in ${target.owner}/${target.repo}`,
			);
		}
		existingSha = z.object({ sha: z.string() }).parse(await existing.json()).sha;
	} else if (existing.status !== 404) {
		await assertResponseOk(existing, `nk-blog: checking ${filePath}`);
	}

	const response = await fetch(`${base}/contents/${filePath}`, {
		method: "PUT",
		headers: { ...headers, "content-type": "application/json" },
		body: JSON.stringify({
			message: input.message ?? `content: publish ${input.slug}`,
			content: Buffer.from(
				serializePost(input.frontmatter, input.body),
				"utf8",
			).toString("base64"),
			...(branch ? { branch } : {}),
			...(existingSha ? { sha: existingSha } : {}),
		}),
	});
	await assertResponseOk(response, `nk-blog: publishing ${filePath}`);
	return putResponseSchema.parse(await response.json());
}
