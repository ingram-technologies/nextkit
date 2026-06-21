import type { CSSProperties } from "react";
import { HONEYPOT_FIELD, TOKEN_FIELD } from "./fields.js";

/**
 * Visually-hidden honeypot + signed timing token, dropped inside any <form>.
 *
 * Presentational only (no client JS), so it renders fine in server or client
 * components. Pass a `token` minted server-side with `createFormToken()`.
 *
 * Real users never see or fill the honeypot (off-screen, aria-hidden,
 * tabIndex -1, autocomplete off); bots that fill every field give themselves
 * away.
 *
 * Pass `field` to use a custom honeypot name — it must match the
 * `honeypotField` you pass to `verifyHuman()`, or the trap reads the wrong
 * field and fails open.
 */

const hidden: CSSProperties = {
	position: "absolute",
	left: "-9999px",
	top: "-9999px",
	width: "1px",
	height: "1px",
	overflow: "hidden",
};

export const HoneypotField = ({
	token,
	field = HONEYPOT_FIELD,
}: {
	token: string;
	field?: string;
}) => (
	<div aria-hidden="true" style={hidden}>
		<label>
			Leave this field empty
			{/* oxlint-disable-next-line jsx-a11y/control-has-associated-label -- aria-hidden honeypot: the wrapping <label> names it, but the trap is intentionally hidden from real users and assistive tech. */}
			<input
				type="text"
				name={field}
				tabIndex={-1}
				autoComplete="off"
				defaultValue=""
				// Belt-and-suspenders against autofill filling the trap for real
				// users: the major password managers honor these opt-outs.
				data-1p-ignore
				data-lpignore="true"
				data-form-type="other"
			/>
		</label>
		<input type="hidden" name={TOKEN_FIELD} defaultValue={token} />
	</div>
);
