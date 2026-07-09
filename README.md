# prtmxio.github.io

Personal portfolio site hosted on GitHub Pages. Buildless by design, utilizing no bundler and no framework. GitHub Pages serves the static files directly, and all rendering happens in the browser.

## Structure

```
.
├── index.html              # page shell, CDN script tags
├── css/styles.css          # layout, themes, responsive styles
├── js/
│   ├── bg.js               # Three.js 3D particle background
│   ├── main.js             # bootstraps data, rendering, theme, contact form
│   ├── data.js             # fetches JSON content
│   ├── render.js           # renders about, experience, projects, blog cards
│   ├── nav.js              # hash-based navigation
│   ├── blog.js             # markdown reader, TOC, read time, scroll progress
│   ├── theme.js            # theme persistence via localStorage
│   ├── terminal.js         # interactive command-line simulation
│   └── boot.js             # startup overlay
└── res/
    ├── bio.json            # profile, bio, experience, social links
    ├── projects.json       # project cards
    ├── blog.json           # post metadata and markdown paths
    ├── blogs/*.md          # blog post content
    └── *.pdf / *.jpeg      # resume and profile assets
```

## Local Development

Serve from the repository root over HTTP. The site fetches JSON and Markdown at runtime, so opening `index.html` directly from the filesystem will not work.

```sh
python3 -m http.server 4173
```

Then open `http://localhost:4173/`.

## Content Editing

**Profile and experience**: edit `res/bio.json`. The experience array renders in order. Put the current role first.

**Projects**: edit `res/projects.json`. Cards are sorted by `priority`.

**Blog posts**: add a Markdown file under `res/blogs/`, then register it in `res/blog.json` with the following fields:

```json
{
  "date": "2026-03-17",
  "title": "Post title",
  "content": "Short summary shown in the blog list.",
  "tags": ["systems", "embedded"],
  "read_me": "./blogs/post.md"
}
```

## Navigation

Hash routes used by the site:

| Route | Section |
|---|---|
| `#about` | About |
| `#experience` | Experience |
| `#projects` | Projects |
| `#blog` | Blog list |
| `#blog/<slug>` | Blog post reader |
| `#contact` | Contact |

## Verification

```sh
node --check js/main.js
node --check js/blog.js
node --check js/nav.js
node --check js/render.js
node --check js/theme.js
node --check js/bg.js
node --check js/terminal.js
git diff --check
```

For UI changes, test both themes at mobile and desktop widths.
