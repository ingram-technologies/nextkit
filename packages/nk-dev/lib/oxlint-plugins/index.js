// The `nextkit` oxlint JS plugin: one rule per file, merged here. This is the
// module `@ingram-tech/nk-dev/oxlint-plugin` resolves to and the shared
// oxlintrc.json loads via `jsPlugins`.

import baseUi from "./base-ui.js";
import deferredCurrentTarget from "./deferred-current-target.js";
import lucideIconSuffix from "./lucide-icon-suffix.js";
import noCryptoRandomUuid from "./no-crypto-random-uuid.js";
import noIdCodecInAppCode from "./no-id-codec-in-app-code.js";
import noRedirectOnlyPage from "./no-redirect-only-page.js";
import noRedundantNodeCrypto from "./no-redundant-node-crypto.js";
import noServerEnvInClient from "./no-server-env-in-client.js";
import noSqlArrayCast from "./no-sql-array-cast.js";
import noUnvalidatedRequestBody from "./no-unvalidated-request-body.js";
import redundantUseStateType from "./redundant-usestate-type.js";
import satoriCss from "./satori-css.js";
import tNoPositionalArgs from "./t-no-positional-args.js";
import tRequiresValues from "./t-requires-values.js";

export default {
	meta: { name: "nextkit" },
	rules: {
		...baseUi.rules,
		...deferredCurrentTarget.rules,
		...lucideIconSuffix.rules,
		...noCryptoRandomUuid.rules,
		...noIdCodecInAppCode.rules,
		...noRedirectOnlyPage.rules,
		...noRedundantNodeCrypto.rules,
		...noServerEnvInClient.rules,
		...noSqlArrayCast.rules,
		...noUnvalidatedRequestBody.rules,
		...redundantUseStateType.rules,
		...satoriCss.rules,
		...tNoPositionalArgs.rules,
		...tRequiresValues.rules,
	},
};
