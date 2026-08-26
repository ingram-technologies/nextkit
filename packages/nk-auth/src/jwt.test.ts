import { createIdRegistry, uuidv7 } from "@ingram-tech/nk-db/id";
import { describe, expect, it } from "vitest";
import { backendJwtOptions } from "./jwt.js";

const ids = createIdRegistry({ user: "usr" });

describe("backendJwtOptions", () => {
	it("mints sub and payload id in public form when given the registry helper", async () => {
		const userId = uuidv7();
		const options = backendJwtOptions({ audience: "api", ids: { user: ids.user } });
		const session = {
			user: { id: userId, email: "a@b.com" },
			session: { id: "s1", userId },
		};
		// Better Auth's hook types are wider than our fixture; the shape we pass
		// is what the hooks read.
		const jwt = options.jwt as {
			getSubject?: (s: typeof session) => unknown;
			definePayload?: (s: typeof session) => Record<string, unknown>;
		};
		expect(await jwt.getSubject?.(session)).toBe(ids.user.encode(userId));
		expect(jwt.definePayload?.(session)).toEqual({
			id: ids.user.encode(userId),
			email: "a@b.com",
		});
	});

	it("leaves Better Auth's defaults (raw uuid sub) without a registry", () => {
		const options = backendJwtOptions({ audience: "api" });
		expect(options.jwt).not.toHaveProperty("getSubject");
		expect(options.jwt).not.toHaveProperty("definePayload");
	});
});
