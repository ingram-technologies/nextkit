---
"@ingram-tech/nk-dev": patch
---

oxfmt 0.72. Its one breaking change moves Markdown to oxc's native formatter;
the shipped oxfmtrc ignores `*.md`/`*.mdx`, so sites see no reformat. The
rest is formatter fixes, mostly embedded CSS.
