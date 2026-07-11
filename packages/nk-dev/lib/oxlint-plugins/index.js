// The `nextkit` oxlint JS plugin: one rule per file, merged here. This is the
// module `@ingram-tech/nk-dev/oxlint-plugin` resolves to and the shared
// oxlintrc.json loads via `jsPlugins`.

import baseUi from "./base-ui.js";
import deferredCurrentTarget from "./deferred-current-target.js";

export default {
	meta: { name: "nextkit" },
	rules: { ...baseUi.rules, ...deferredCurrentTarget.rules },
};
