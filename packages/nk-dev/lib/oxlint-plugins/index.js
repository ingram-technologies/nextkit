// The `nextkit` oxlint JS plugin: one rule per file, merged here. This is the
// module `@ingram-tech/nk-dev/oxlint-plugin` resolves to and the shared
// oxlintrc.json loads via `jsPlugins`.

import baseUi from "./base-ui.js";
import deferredCurrentTarget from "./deferred-current-target.js";
import lucideIconSuffix from "./lucide-icon-suffix.js";
import noCryptoRandomUuid from "./no-crypto-random-uuid.js";
import noRedirectOnlyPage from "./no-redirect-only-page.js";
import redundantUseStateType from "./redundant-usestate-type.js";
import tNoPositionalArgs from "./t-no-positional-args.js";
import tRequiresValues from "./t-requires-values.js";

export default {
	meta: { name: "nextkit" },
	rules: {
		...baseUi.rules,
		...deferredCurrentTarget.rules,
		...lucideIconSuffix.rules,
		...noCryptoRandomUuid.rules,
		...noRedirectOnlyPage.rules,
		...redundantUseStateType.rules,
		...tNoPositionalArgs.rules,
		...tRequiresValues.rules,
	},
};
