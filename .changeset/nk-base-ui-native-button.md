---
"@ingram-tech/nk-dev": minor
---

New oxlint rule `nextkit/base-ui-native-button` (error): a Base UI button-like
component rendered as something other than a `<button>` needs
`nativeButton={false}`. `useButton` defaults the prop to true, so
`render={<Link />}` on a `Button` or a `*Trigger` makes Base UI skip the
keyboard, role and form-participation shims the non-native element needs, and
log an error at runtime. The types cannot see it. The rule only inspects a JSX
element literal in `render`, so a variable or call falls out for free, and it
is inert on projects that do not depend on `@base-ui/react`.
