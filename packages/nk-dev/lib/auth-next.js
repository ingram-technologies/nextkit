import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";

// `next` preservation in nk-auth is split across two layers: a proxy sets the
// `x-nk-auth-path` request header (via `createAuthMiddleware` or
// `withAuthPathHeader`), and `createAuthHelpers`' guards read it to build
// `?next=` when they redirect to sign-in. A site that binds the helpers but
// never sets the header loses `next` with no error: every "sign in to see this
// page" lands on the default page. The runtime warns once outside production;
// this check catches it before the site is even run. Textual, like the
// endpoint-shadow check: we grep the site's sources, never execute them.

const SOURCE_DIRS = ["src", "lib", "proxy.ts", "middleware.ts"];
const SOURCE_FILES = /\.(ts|tsx|js|jsx|mjs)$/;
const SKIP_DIRS = new Set(["node_modules", ".next", "dist", "build"]);

/** Every source file under the site's app-code roots, relative to `cwd`. */
function sourceFiles(cwd) {
	const out = [];
	const walk = (dir) => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			if (entry.isDirectory()) {
				if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith("."))
					walk(join(dir, entry.name));
			} else if (SOURCE_FILES.test(entry.name) && !/\.test\./.test(entry.name)) {
				out.push(relative(cwd, join(dir, entry.name)));
			}
		}
	};
	for (const root of SOURCE_DIRS) {
		const full = resolve(cwd, root);
		if (!existsSync(full)) continue;
		if (SOURCE_FILES.test(root)) out.push(root);
		else walk(full);
	}
	return out;
}

/**
 * The "helpers bound, header never set" finding, or nothing. Silent on sites
 * without `createAuthHelpers`, since they have no guard to lose `next` from.
 */
export function authNextFindings(cwd) {
	let boundIn = null;
	let wired = false;
	for (const file of sourceFiles(cwd)) {
		const src = readFileSync(resolve(cwd, file), "utf8");
		if (!boundIn && /\bcreateAuthHelpers\s*\(/.test(src)) boundIn = file;
		if (/\b(createAuthMiddleware|withAuthPathHeader)\s*\(/.test(src)) wired = true;
		if (boundIn && wired) return [];
	}
	if (!boundIn) return [];
	return [
		{
			id: "auth:next-unwired",
			level: "warn",
			message: `\`${boundIn}\` binds createAuthHelpers, but nothing sets the x-nk-auth-path header — its guards redirect to the bare sign-in path and \`next\` is lost. Mount createAuthMiddleware, or call withAuthPathHeader(request, requestHeaders) from "@ingram-tech/nk-auth/middleware" in your proxy.`,
		},
	];
}

/** Whether a source renews the session: `renewSession(…)`, or a
 *  `createAuthMiddleware({ … })` call given `auth`. */
function renews(src) {
	if (/\brenewSession\s*\(/.test(src)) return true;
	for (const match of src.matchAll(/\bcreateAuthMiddleware\s*\(/g)) {
		const call = src.slice(match.index, match.index + 1000);
		const end = call.indexOf("})");
		if (/\bauth\b\s*[,:}\n]/.test(end === -1 ? call : call.slice(0, end)))
			return true;
	}
	return false;
}

/**
 * The "helpers bound, session never renewed" finding, or nothing.
 *
 * nk-auth's server guards read the session without refreshing it, because a
 * server component cannot set the cookie a refresh re-issues. Something that
 * can must do it, or every sign-in ends `session.expiresIn` after it began
 * however active the person is: aidefencesummit.eu signed its users out weekly
 * for a month before anyone noticed. The proxy does it, once per `updateAge`.
 */
export function authRenewalFindings(cwd) {
	let boundIn = null;
	for (const file of sourceFiles(cwd)) {
		const src = readFileSync(resolve(cwd, file), "utf8");
		if (!boundIn && /\bcreateAuthHelpers\s*\(/.test(src)) boundIn = file;
		if (renews(src)) return [];
	}
	if (!boundIn) return [];
	return [
		{
			id: "auth:session-unrenewed",
			level: "error",
			message: `\`${boundIn}\` binds createAuthHelpers, but nothing renews the session, so every sign-in ends \`session.expiresIn\` after it began however active the person is. Pass \`auth\` to createAuthMiddleware, or call renewSession(request, response, auth) from "@ingram-tech/nk-auth/middleware" in your proxy.`,
		},
	];
}
