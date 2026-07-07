#!/usr/bin/env bun
/**
 * Fails when a tracked file — its content OR its path — or an unpushed commit
 * message names one of Ingram's consumer websites. nextkit is a public repo
 * and must only ever describe itself — consumers are referred to generically
 * ("a consuming site"). The banned names are stored as SHA-256 hashes so this
 * checker doesn't itself leak them; on a hit it reports the file:line but not
 * the word (CI logs are public too).
 *
 * Scope: current tracked state plus commits not yet on origin/main. Names
 * already in pushed history are out of reach here (history is public the
 * moment it lands).
 *
 *   bun run scripts/check-site-names.ts
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const BANNED_TOKEN_HASHES = new Set([
	"8f6ce7348d64d26df26a97e1e29f083c6330c434967e6cf9af7bb87ed560fc8b",
	"6ae8274ee137881bef043c471e8f883b1314cb49921cbb5d07be9c61d06d49bd",
	"94c5befb4c521f59702af8ca3127ab98893fb4e460c90a37ef6d2d0448343818",
	"fc16afeb128d6edfca0b63ce88bc42f1275f5e968be451a27f37a00c5d9c44c7",
	"5d950afc0270b677e1d8417d9f27d12b579b143dfcc5d5f5edf122519db7082d",
	"030283d299c3be7ef01e63a039e3caae7449eff9330dda13b67f26d7d47229ef",
]);

const SKIP = /\.(png|jpg|jpeg|gif|ico|woff2?|wasm|lock|lockb)$/;

const sha256 = (token: string): string =>
	createHash("sha256").update(token).digest("hex");

const ls = spawnSync("git", ["ls-files"], { encoding: "utf8" });
if (ls.status !== 0) {
	console.error(ls.stderr);
	process.exit(1);
}

let failed = false;
const scanText = (text: string, where: (line: number) => string): void => {
	text.split("\n").forEach((line, i) => {
		for (const token of line.toLowerCase().match(/[a-z]+/g) ?? []) {
			if (BANNED_TOKEN_HASHES.has(sha256(token))) {
				failed = true;
				console.error(
					`${where(i + 1)}: names a consumer site (hash ${sha256(token).slice(0, 12)}…) — refer to consumers generically`,
				);
			}
		}
	});
};

for (const file of ls.stdout.split("\n").filter((f) => f && !SKIP.test(f))) {
	// A banned name in the *path* leaks just as much as one in the content.
	scanText(file, () => file);
	// ls-files lists tracked files even when deleted from the worktree
	// without `git rm` — skip those rather than crash.
	if (!existsSync(file)) continue;
	scanText(readFileSync(file, "utf8"), (line) => `${file}:${line}`);
}

// Commit messages ship to the public repo too. Scan what hasn't been pushed
// yet (origin/main..HEAD); already-pushed history is public regardless.
const range = spawnSync("git", ["log", "--format=%H%x00%B%x00", "origin/main..HEAD"], {
	encoding: "utf8",
});
if (range.status === 0) {
	const parts = range.stdout.split("\0");
	for (let i = 0; i + 1 < parts.length; i += 2) {
		const hash = parts[i]?.trim();
		const body = parts[i + 1];
		if (!hash || body === undefined) continue;
		scanText(body, () => `commit ${hash.slice(0, 12)} (message)`);
	}
}

if (failed) {
	process.exit(1);
}
console.log("check-site-names: OK");
