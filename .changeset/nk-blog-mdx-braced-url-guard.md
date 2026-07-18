---
"@ingram-tech/nk-blog": patch
---

Close a `javascript:`/`data:` URL bypass in the limited-MDX sandbox. A braced
string-literal URL attribute (`<a href={"javascript:…"}>`) took the
attribute-expression branch, which only checked that the value was a literal and
never re-ran the scheme guard — so it slipped past the check that the
plain-string (`href="javascript:…"`) and markdown-link forms both enforce.
Braced literals on URL attributes now clear the same `isSafeUrl` guard.
