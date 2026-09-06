---
"@ingram-tech/nk-dev": patch
---

`nextkit/base-ui-native-button` now only inspects components that actually
accept `nativeButton`: Button, PopoverTrigger, Switch and the menu items.

Keying on the `Button` / `Trigger` name suffixes was wrong twice. A
`*Trigger` builds on `useButton` internally but does not expose the prop, so
the rule demanded code that does not type-check; and a render target named
`*Button` is Base UI's own primitive or a wrapper on it, which renders a
native `<button>`, where `nativeButton={false}` earns the inverse runtime
warning. A locally defined component that merely shares the name (a
SidebarMenuButton) took no such prop either.

On one site this took the rule from 81 reports, 55 of them wrong and the rest
unfixable as suggested, to only the genuine `Button render={<Link />}` cases.
