// Server entry. The honeypot component lives at "@ingram-tech/bot-protection/honeypot"
// so importing the verifier server-side never pulls in React.
export { checkBot } from "./botid";
export { HONEYPOT_FIELD, TOKEN_FIELD } from "./fields";
export { isConfigured } from "./keys";
export {
	createFormToken,
	type TokenCheck,
	type TokenResult,
	verifyFormToken,
} from "./token";
export { type VerifyOptions, type VerifyResult, verifyHuman } from "./verify";
