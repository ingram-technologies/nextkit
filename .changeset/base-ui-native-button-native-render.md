---
"@ingram-tech/nk-dev": patch
---

`nextkit/base-ui-native-button` no longer reports a render target that is
itself a button. Only the lowercase intrinsic counted as native, so
`<DropdownMenuTrigger render={<Button />} />` was flagged even though the
design-system Button is Base UI's own primitive and renders a native
`<button>`. Adding `nativeButton={false}` there is wrong twice over: the
element is native, and Base UI logs the inverse warning when the prop lies
about it. A component named `*Button` is now treated as native, which on one
site turned 81 reports into the 26 real ones.
