import { describe, expect, it } from "vitest";
import { totpEnrollment } from "./totp.js";

const URI =
	"otpauth://totp/Acme%20Analytics:ada%40example.org?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PX&issuer=Acme%20Analytics&digits=6&period=30";

describe("totpEnrollment", () => {
	it("splits out the key, issuer and account", () => {
		const e = totpEnrollment(URI);
		expect(e.uri).toBe(URI);
		expect(e.secret).toBe("JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PX");
		expect(e.secretGroups).toEqual([
			"JBSW",
			"Y3DP",
			"EHPK",
			"3PXP",
			"JBSW",
			"Y3DP",
			"EHPK",
			"3PX",
		]);
		expect(e.issuer).toBe("Acme Analytics");
		expect(e.account).toBe("ada@example.org");
	});

	it("falls back to the label prefix for the issuer, and copes with a bare label", () => {
		expect(totpEnrollment("otpauth://totp/Acme:ada?secret=AB").issuer).toBe("Acme");
		const bare = totpEnrollment("otpauth://totp/ada?secret=AB");
		expect(bare.issuer).toBeNull();
		expect(bare.account).toBe("ada");
	});

	it("draws a square QR with the standard quiet zone", () => {
		const { qr } = totpEnrollment(URI);
		// A version-N code is 17 + 4N modules; plus 4 modules of border each side.
		expect((qr.size - 8 - 17) % 4).toBe(0);
		expect(qr.path).toMatch(/^(M\d+ \d+h1v1h-1z)+$/);
		// Nothing is drawn inside the quiet zone.
		const xs = [...qr.path.matchAll(/M(\d+) (\d+)/g)].flatMap((m) => [
			Number(m[1]),
			Number(m[2]),
		]);
		expect(Math.min(...xs)).toBe(4);
		expect(Math.max(...xs)).toBe(qr.size - 5);
	});

	it("rejects anything but an otpauth URI", () => {
		expect(() => totpEnrollment("https://example.org")).toThrow(/otpauth/);
	});
});
