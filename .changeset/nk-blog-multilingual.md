---
"@ingram-tech/nk-blog": minor
---

Multilingual blogs. Set `defaultLang` on `createBlog` and the reserved `lang`
frontmatter becomes the post's language: slugs are unique per language, and a
new `translationKey` (defaulting to the slug) groups a post with its
translations. `posts`, `previews`, `post`, `slugs` and `featured` take an
optional `{ lang }` filter, and `blog.translations(post)` returns every
published version. On the SEO side, `BlogSeoConfig.defaultLang` puts other
languages under `/<lang><basePath>`, `blogPostAlternates` builds the canonical
and hreflang map (`x-default` on the default language, nothing for an
untranslated post), `blogIndexUrl` gives each language's index, and
`blogPostArticle` sets `inLanguage`. A blog without `defaultLang` behaves
exactly as before.
