import type { CSSProperties } from "react";
import { HONEYPOT_FIELD, TOKEN_FIELD } from "./fields";

/**
 * Visually-hidden honeypot + signed timing token, dropped inside any <form>.
 *
 * Presentational only (no client JS), so it renders fine in server or client
 * components. Pass a `token` minted server-side with `createFormToken()`.
 *
 * Real users never see or fill the honeypot (off-screen, aria-hidden,
 * tabIndex -1, autocomplete off); bots that fill every field give themselves
 * away.
 */

const hidden: CSSProperties = {
	position: "absolute",
	left: "-9999px",
	top: "-9999px",
	width: "1px",
	height: "1px",
	overflow: "hidden",
};

export const HoneypotField = ({ token }: { token: string }) => (
	<div aria-hidden="true" style={hidden}>
		<label>
			Leave this field empty
			<input
				type="text"
				name={HONEYPOT_FIELD}
				tabIndex={-1}
				autoComplete="off"
				defaultValue=""
			/>
		</label>
		<input type="hidden" name={TOKEN_FIELD} defaultValue={token} />
	</div>
);
