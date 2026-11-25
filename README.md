# blog

Tech blog: game development and software engineering notes.
Published at <https://alexandru-atanasiu.github.io/blog/>.

Articles are Markdown files in [`posts/`](posts). A small Node script converts them to static
HTML in [`dist/`](dist), and a GitHub Actions workflow publishes `dist/` to GitHub Pages.

## Writing a post

1. Create `posts/YYYY-MM-DD-my-post-title.md`.
2. Start it with front matter, then write Markdown:

   ```markdown
   ---
   title: "Fixing your timestep, again"
   date: 2026-12-01
   description: One or two sentences shown on the home page, in the feed and in link previews.
   tags: [gamedev, engine]
   draft: true
   ---

   Intro paragraph...

   ## First section
   ```

3. Push to `main` (remove `draft: true` first). The workflow builds and deploys it.

### File naming

The file name becomes the URL: `posts/2026-12-01-fixing-your-timestep.md` is published at
`/blog/posts/fixing-your-timestep/`. The `YYYY-MM-DD-` prefix is optional; it keeps the folder
sorted and is dropped from the URL. Use lowercase letters, digits and dashes. Renaming or
deleting the file moves or removes the page on the next build.

### Front matter

| Field         | Required | Notes                                                                                   |
| ------------- | -------- | --------------------------------------------------------------------------------------- |
| `title`       | yes      | Page title and `<h1>`. Do not repeat it as a `#` heading; start sections at `##`.         |
| `date`        | yes\*    | `YYYY-MM-DD`. \*Optional if the file name has a date prefix. Posts are listed newest first. |
| `description` | no       | Summary for the home page, feed, meta description and Open Graph. Defaults to the first paragraph. |
| `tags`        | no       | `[a, b]`, or a block list of `- a` lines.                                                |
| `draft`       | no       | `true` keeps the post out of `dist/` (and so out of the published site).                 |
| `updated`     | no       | `YYYY-MM-DD`, shown next to the date and used in the feed.                               |
| `image`       | no       | Open Graph preview image, as a path relative to the post (or a full URL).                |
| `slug`        | no       | Overrides the URL segment derived from the file name.                                    |

Front matter is a small YAML subset: one `key: value` per line, strings bare or quoted,
`true`/`false`, and lists.

### Markdown features

- Fenced code blocks are syntax-highlighted at build time: `csharp`, `cpp`, `c`, `js`, `ts`,
  `hlsl`, `glsl`, `bash`, `powershell`, `json`, `yaml`, `diff`, `rust`, `python`, `lua` and
  everything else [highlight.js supports](https://highlight.js.org/). HLSL (`hlsl`, `fx`) is
  defined in [`scripts/hlsl.mjs`](scripts/hlsl.mjs). Use `text` for a plain block.
- Tables, strikethrough, autolinks and inline HTML (`<kbd>`, `<figure>`, `<video>`, ...) work.
- Every heading gets an id and a `#` anchor link.

### Images and links

Write URLs **relative to the Markdown file**, exactly as they should work when browsing the
repository on GitHub. The build rewrites them so they work on the site, and warns about
targets that do not exist.

| What                  | Where the file lives              | In the post                                    |
| --------------------- | --------------------------------- | ---------------------------------------------- |
| Image for one post    | `posts/images/<post-name>/x.png`  | `![Alt text](images/<post-name>/x.png)`        |
| Image shared by posts | `static/images/x.png`             | `![Alt text](../static/images/x.png)`          |
| Another post          | `posts/2026-12-01-other.md`       | `[other post](2026-12-01-other.md)`            |
| A page                | `pages/about.md`                  | `[about](../pages/about.md)`                   |

Everything under `posts/` that is not a `.md` file is copied to `dist/posts/`, and everything
under `static/` is copied to the root of `dist/`. Never use root-absolute URLs like
`/images/x.png`: the site is served under `/blog/`, so they would break (the build warns).

## Building and previewing locally

Requires [Node.js](https://nodejs.org/) 20 or newer.

```bash
npm ci               # once, installs the pinned dependencies
npm run build        # regenerates dist/ from scratch
npm run preview      # builds, then serves dist/ at http://localhost:4000/blog/
npm run preview:drafts   # same, but includes drafts (built into .preview/, never committed)
```

`npm run build` is the same command CI runs. It deletes and regenerates `dist/` every time,
so its output is always exactly what the sources describe. The preview server uses the same
`/blog/` base path as GitHub Pages, so path mistakes show up locally.

You do not have to commit `dist/` yourself: the workflow rebuilds and commits it. Committing
it along with your post is fine too (the workflow then finds nothing to change).

## How publishing works

[`.github/workflows/publish.yml`](.github/workflows/publish.yml) runs on every push to `main`
that touches `posts/`, `pages/`, `templates/`, `static/`, `scripts/`, `site.config.json`,
`package*.json` or the workflow itself, and can be started by hand from the Actions tab.

1. **convert** checks out `main`, runs `npm ci && npm run build`, and if `dist/` changed,
   commits it to `main` as `github-actions[bot]`. Its output is the commit to publish: the new
   commit, or the current one when nothing changed. If `main` moved in the meantime, it
   rebuilds on top of the new tip and tries again.
2. **deploy** waits for convert, checks out exactly that commit and deploys its `dist/` to
   GitHub Pages.

The bot's commit does not start another run (pushes made with the workflow token never do,
and `dist/` is not in the trigger paths). Runs are queued one at a time. After the workflow
has committed, `git pull` before your next push.

## Layout

| Path                 | Purpose                                                              |
| -------------------- | -------------------------------------------------------------------- |
| `posts/`             | Articles (`*.md`) and their images (`posts/images/`)                 |
| `pages/`             | Standalone pages; `pages/about.md` becomes `/blog/about/`            |
| `templates/`         | HTML templates (`{{name}}` is escaped, `{{{name}}}` is raw HTML)     |
| `static/`            | Stylesheet, favicon, shared images; copied as-is to the root of `dist/` |
| `scripts/build.mjs`  | The site generator                                                   |
| `scripts/serve.mjs`  | Local preview server                                                 |
| `site.config.json`   | Site title, description, author, URL and base path                   |
| `dist/`              | Generated site. Do not edit by hand                                  |

To host the site somewhere else, change `url` and `basePath` in `site.config.json`. Pages use
relative URLs throughout; only the feed, canonical/Open Graph URLs and `404.html` use the
configured values.
