# prtmxio.github.io

Static portfolio site for `prtmxio.github.io`.

The site is intentionally buildless: GitHub Pages can serve it directly as HTML, CSS, JavaScript, JSON, Markdown, images, and PDFs. Runtime rendering is handled in the browser.

## Structure

```text
.
├── index.html              # page shell, reader shell, external CDN scripts
├── css/styles.css          # layout, themes, reader, responsive behavior
├── js/
│   ├── main.js             # bootstraps data, rendering, theme, contact form
│   ├── data.js             # loads JSON content
│   ├── render.js           # renders about, experience, projects, blog cards
│   ├── nav.js              # hash navigation
│   ├── blog.js             # markdown reader, TOC, read time, progress
│   ├── theme.js            # global and reader theme persistence
│   └── boot.js             # startup overlay
└── res/
    ├── bio.json            # profile, bio, experience, social links
    ├── projects.json       # project cards
    ├── blog.json           # post metadata and markdown paths
    ├── blogs/*.md          # long-form posts
    └── *.pdf / *.jpeg      # resume and profile assets
```

## Runtime Behavior

- `res/bio.json`, `res/projects.json`, and `res/blog.json` are fetched at startup.
- Blog posts are Markdown files loaded on demand from `res/blogs/`.
- Hash routes drive navigation:
  - `#about`
  - `#experience`
  - `#projects`
  - `#blog`
  - `#blog/<slug>`
  - `#contact`
- The blog reader generates a table of contents from `h2` and `h3` headings.
- Math rendering uses MathJax.
- Code highlighting uses Prism.
- Theme state is stored in `localStorage`.
- The contact form uses `mailto:` and does not require a backend.

## Local Development

Run a static server from the repository root:

```sh
python3 -m http.server 4173
```

Open:

```text
http://localhost:4173/
```

Do not open `index.html` directly from the filesystem for normal testing. The site fetches JSON and Markdown content, so it should be served over HTTP.

## Content Editing

### Profile and Experience

Edit:

```text
res/bio.json
```

The experience array is rendered in order. Put the current or most important role first.

### Projects

Edit:

```text
res/projects.json
```

Projects are sorted by `priority`.

### Blog Posts

Add a Markdown file under:

```text
res/blogs/
```

Then add metadata to:

```text
res/blog.json
```

Required fields:

```json
{
  "date": "2026-03-17",
  "title": "Post title",
  "content": "Short summary shown in the blog list.",
  "tags": ["systems", "embedded"],
  "read_me": "./blogs/post.md"
}
```

Slugs are generated from titles unless a future `slug` field is added.

## Verification

Basic checks used during development:

```sh
node --check js/main.js
node --check js/blog.js
node --check js/nav.js
node --check js/render.js
node --check js/theme.js
git diff --check
```

For UI changes, verify both global themes and both reader themes, then test at mobile and desktop widths.
