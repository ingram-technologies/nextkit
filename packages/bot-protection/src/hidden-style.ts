import type { CSSProperties } from "react";

/**
 * Shared visually-hidden style for the honeypot trap: pushed off-screen but
 * still present and fillable in the DOM, so bots that fill every field give
 * themselves away while real users never see it. Kept in one place so the SSR
 * ({@link HoneypotField}) and client ({@link HoneypotInput}) traps can't drift.
 */
export const VISUALLY_HIDDEN: CSSProperties = {
	position: "absolute",
	left: "-9999px",
	top: "-9999px",
	width: "1px",
	height: "1px",
	overflow: "hidden",
};
