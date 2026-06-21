// Server entry. The honeypot component lives at "@ingram-tech/bot-protection/honeypot"
// so importing the verifier server-side never pulls in React.
export { checkBot } from "./botid.js";
export { HONEYPOT_FIELD, TOKEN_FIELD } from "./fields.js";
export { isConfigured } from "./keys.js";
export {
	createFormToken,
	type TokenCheck,
	type TokenResult,
	verifyFormToken,
} from "./token.js";
export { type VerifyOptions, type VerifyResult, verifyHuman } from "./verify.js";
