#!/usr/bin/env node
// Static site generator for the blog.
//
//   node scripts/build.mjs            -> builds the published site into dist/
//   node scripts/build.mjs --drafts   -> also builds drafts, into .preview/ (never committed)
//
// Sources:  posts/*.md  pages/*.md  templates/*.html  static/**  site.config.json
// Output is fully regenerated on every run (stale pages disappear) and is
// deterministic (no timestamps), so "did dist/ change?" is a meaningful question for CI.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import MarkdownIt from 'markdown-it';
import anchor from 'markdown-it-anchor';
import hljs from 'highlight.js';
import hlsl from './hlsl.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INCLUDE_DRAFTS = process.argv.includes('--drafts');
const OUT_DIR = path.join(ROOT, INCLUDE_DRAFTS ? '.preview' : 'dist');
const POSTS_DIR = 'posts';
const PAGES_DIR = 'pages';
const STATIC_DIR = 'static';
const TEMPLATES_DIR = 'templates';

const warnings = [];
const warn = (msg) => warnings.push(msg);
const fail = (msg) => {
  console.error(`build failed: ${msg}`);
  process.exit(1);
};

// ---------------------------------------------------------------- utilities

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n?/g, '\n');
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

const escapeHtml = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December'];
const formatDate = (d) => `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
const isoDay = (d) => d.toISOString().slice(0, 10);
const isoFull = (d) => d.toISOString().replace('.000Z', 'Z');

function parseDate(value, where) {
  const s = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2})?)?$/.test(s)) {
    fail(`${where}: invalid date "${s}" (use YYYY-MM-DD)`);
  }
  let iso = s.replace(' ', 'T');
  if (iso.length === 10) iso += 'T00:00:00Z';
  else if (!/(Z|[+-]\d{2}:\d{2})$/.test(iso)) iso += 'Z';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) fail(`${where}: invalid date "${s}"`);
  return d;
}

function listFiles(relDir) {
  const out = [];
  const abs = path.join(ROOT, relDir);
  if (!fs.existsSync(abs)) return out;
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = `${relDir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...listFiles(rel));
    else if (entry.isFile()) out.push(rel);
  }
  return out.sort();
}

// ------------------------------------------------------------- front matter
// A deliberately small subset of YAML: `key: value` lines, quoted or bare strings,
// true/false, inline lists `[a, b]` and block lists (`- item` lines under an empty key).

function parseScalar(raw) {
  const v = raw.trim();
  if ((v.startsWith('"') && v.endsWith('"') && v.length > 1) ||
      (v.startsWith("'") && v.endsWith("'") && v.length > 1)) {
    return v.slice(1, -1);
  }
  if (v === 'true') return true;
  if (v === 'false') return false;
  return v;
}

function parseFrontMatter(source, file) {
  if (!source.startsWith('---\n')) return { data: {}, body: source };
  const end = source.indexOf('\n---', 3);
  if (end === -1) fail(`${file}: front matter is not closed with a '---' line`);
  const afterEnd = source.indexOf('\n', end + 1);
  const body = afterEnd === -1 ? '' : source.slice(afterEnd + 1);
  const data = {};
  let listKey = null;
  for (const line of source.slice(4, end).split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const item = line.match(/^\s+-\s+(.*)$/) || line.match(/^-\s+(.*)$/);
    if (item && listKey) {
      data[listKey].push(String(parseScalar(item[1])));
      continue;
    }
    const kv = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (!kv) fail(`${file}: cannot parse front matter line: ${line}`);
    const [, key, rawValue] = kv;
    const value = rawValue.trim();
    listKey = null;
    if (value === '') {
      data[key] = [];
      listKey = key;
    } else if (value.startsWith('[') && value.endsWith(']')) {
      data[key] = value.slice(1, -1).split(',').map((v) => String(parseScalar(v))).filter(Boolean);
    } else {
      data[key] = parseScalar(value);
    }
  }
  for (const [key, value] of Object.entries(data)) {
    if (Array.isArray(value) && value.length === 0 && key !== 'tags') delete data[key];
  }
  return { data, body };
}

// ---------------------------------------------------------------- templates
// {{name}} inserts an HTML-escaped value, {{{name}}} inserts raw HTML.

const templateCache = new Map();
function render(name, vars) {
  if (!templateCache.has(name)) templateCache.set(name, read(`${TEMPLATES_DIR}/${name}.html`));
  return templateCache.get(name).replace(/\{\{\{\s*(\w+)\s*\}\}\}|\{\{\s*(\w+)\s*\}\}/g, (_, raw, esc) => {
    const key = raw ?? esc;
    if (!(key in vars)) fail(`templates/${name}.html uses unknown variable "${key}"`);
    return raw ? String(vars[key]) : escapeHtml(vars[key]);
  });
}

// ----------------------------------------------------------------- markdown

hljs.registerLanguage('hlsl', hlsl);

function slugify(text) {
  return String(text).trim().toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s_-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'section';
}

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  highlight(code, info) {
    const lang = info.trim().split(/\s+/)[0];
    let html = escapeHtml(code);
    let label = '';
    if (lang) {
      const def = hljs.getLanguage(lang);
      if (def) {
        html = hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
        label = def.name;
      } else if (!['text', 'plain', 'txt', 'none'].includes(lang.toLowerCase())) {
        warn(`unknown code block language "${lang}" (rendered without highlighting)`);
      }
    }
    const labelAttr = label ? ` data-lang="${escapeHtml(label)}"` : '';
    return `<pre class="code"${labelAttr}><code class="hljs">${html}</code></pre>\n`;
  },
});

md.use(anchor, {
  slugify,
  tabIndex: false,
  permalink: anchor.permalink.linkInsideHeader({
    symbol: '#',
    placement: 'after',
    class: 'heading-anchor',
    renderAttrs: () => ({ 'aria-label': 'Link to this section' }),
  }),
});

// Wide tables scroll inside their own box instead of breaking the page layout.
md.renderer.rules.table_open = () => '<div class="table-wrap"><table>\n';
md.renderer.rules.table_close = () => '</table></div>\n';

// Relative URLs in Markdown are written relative to the .md file (so they also work in
// editors and on GitHub) and get rewritten here to wherever the target ends up in the site.
function rewriteUrl(url, env) {
  if (!url || /^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(url)) return url;
  if (url.startsWith('/')) {
    warn(`${env.file}: root-absolute URL "${url}" will not work under the site base path; use a relative URL`);
    return url;
  }
  const [, rawPath, suffix] = url.match(/^([^?#]*)(.*)$/);
  let decoded = rawPath;
  try { decoded = decodeURI(rawPath); } catch { /* keep as written */ }
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(env.file), decoded));
  if (resolved.startsWith('..')) {
    warn(`${env.file}: URL "${url}" points outside the repository`);
    return url;
  }
  let sitePath;
  if (resolved.endsWith('.md')) {
    sitePath = env.docs.get(resolved);
    if (sitePath === undefined) {
      warn(`${env.file}: link to "${url}" does not match a published post or page`);
      return url;
    }
  } else {
    if (!exists(resolved)) warn(`${env.file}: "${url}" does not exist (looked for ${resolved})`);
    sitePath = resolved.startsWith(`${STATIC_DIR}/`) ? resolved.slice(STATIC_DIR.length + 1) : resolved;
  }
  return env.href(encodeURI(sitePath)) + suffix;
}

const defaultRender = (tokens, idx, options, env, self) => self.renderToken(tokens, idx, options);
const baseLinkOpen = md.renderer.rules.link_open || defaultRender;
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  if (!(token.attrGet('class') || '').includes('heading-anchor')) {
    token.attrSet('href', rewriteUrl(token.attrGet('href'), env));
  }
  return baseLinkOpen(tokens, idx, options, env, self);
};
const baseImage = md.renderer.rules.image;
md.renderer.rules.image = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  token.attrSet('src', rewriteUrl(token.attrGet('src'), env));
  token.attrSet('loading', 'lazy');
  return baseImage(tokens, idx, options, env, self);
};

function excerpt(html, max = 160) {
  const firstParagraph = html.match(/<p>([\s\S]*?)<\/p>/);
  const text = (firstParagraph ? firstParagraph[1] : '')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max).replace(/\s+\S*$/, '')}…`;
}

// ------------------------------------------------------------------- inputs

const site = JSON.parse(read('site.config.json'));
for (const key of ['title', 'description', 'author', 'url', 'basePath']) {
  if (typeof site[key] !== 'string') fail(`site.config.json: missing "${key}"`);
}
site.url = site.url.replace(/\/+$/, '');
site.basePath = `/${site.basePath.replace(/^\/+|\/+$/g, '')}/`.replace('//', '/');
site.language ??= 'en';
const absoluteUrl = (sitePath) => site.url + site.basePath + sitePath;

function loadDocs(dir, kind) {
  const docs = [];
  if (!exists(dir)) return docs;
  for (const name of fs.readdirSync(path.join(ROOT, dir)).sort()) {
    if (!name.endsWith('.md')) continue;
    const file = `${dir}/${name}`;
    const { data, body } = parseFrontMatter(read(file), file);
    const base = name.slice(0, -3);
    const datePrefix = base.match(/^(\d{4}-\d{2}-\d{2})-(.+)$/);
    const slug = String(data.slug || (datePrefix ? datePrefix[2] : base));
    if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
      fail(`${file}: slug "${slug}" must be lowercase letters, digits and dashes (rename the file or set "slug")`);
    }
    if (!data.title) fail(`${file}: front matter needs a "title"`);
    const doc = {
      kind, file, slug, body,
      title: String(data.title),
      description: data.description ? String(data.description) : '',
      tags: Array.isArray(data.tags) ? data.tags : data.tags ? [String(data.tags)] : [],
      draft: data.draft === true,
      image: data.image ? String(data.image) : '',
    };
    if (kind === 'post') {
      const rawDate = data.date ?? datePrefix?.[1];
      if (!rawDate) fail(`${file}: front matter needs a "date" (YYYY-MM-DD)`);
      doc.date = parseDate(rawDate, file);
      doc.updated = data.updated ? parseDate(data.updated, file) : null;
      doc.sitePath = `posts/${slug}/`;
    } else {
      doc.sitePath = `${slug}/`;
    }
    docs.push(doc);
  }
  return docs;
}

const posts = loadDocs(POSTS_DIR, 'post')
  .filter((p) => INCLUDE_DRAFTS || !p.draft)
  .sort((a, b) => b.date - a.date || a.slug.localeCompare(b.slug));
const pages = loadDocs(PAGES_DIR, 'page').filter((p) => INCLUDE_DRAFTS || !p.draft);

const staticFiles = listFiles(STATIC_DIR).map((f) => ({ from: f, to: f.slice(STATIC_DIR.length + 1) }));
const postAssets = listFiles(POSTS_DIR).filter((f) => !f.endsWith('.md')).map((f) => ({ from: f, to: f }));

// Every output path is claimed exactly once, so collisions fail loudly instead of overwriting.
const outputs = new Map();
function claim(outPath, source, content) {
  const key = outPath.toLowerCase();
  if (outputs.has(key)) fail(`${source} and ${outputs.get(key).source} both produce ${outPath}`);
  outputs.set(key, { outPath, source, content });
}

const docs = new Map([...posts, ...pages].map((d) => [d.file, d.sitePath]));

// ------------------------------------------------------------------ renders

// `href` turns a site path ("posts/foo/", "css/style.css", "" for home) into a URL that
// works from the page being rendered. Normal pages use relative URLs so the site works
// under any base path; the 404 page and the feed need absolute ones.
const relativeTo = (pagePath) => {
  const depth = pagePath.split('/').length - 1;
  const prefix = '../'.repeat(depth);
  return (sitePath) => prefix + sitePath || './';
};
const basePathHref = (sitePath) => site.basePath + sitePath;

function tagList(tags) {
  if (!tags.length) return '';
  return `<ul class="tags">${tags.map((t) => `<li>${escapeHtml(t)}</li>`).join('')}</ul>`;
}

function layout({ href, sitePath, title, description, content, ogType = 'website', image = '', published = null, noindex = false }) {
  const fullTitle = title ? `${title} · ${site.title}` : site.title;
  const head = [];
  if (noindex) head.push('<meta name="robots" content="noindex">');
  else head.push(`<link rel="canonical" href="${escapeHtml(absoluteUrl(sitePath))}">`);
  if (!noindex) head.push(`<meta property="og:url" content="${escapeHtml(absoluteUrl(sitePath))}">`);
  const ogImage = image || site.defaultImage || '';
  if (ogImage) {
    const imageUrl = /^[a-z][a-z0-9+.-]*:/i.test(ogImage) ? ogImage : absoluteUrl(ogImage);
    head.push(`<meta property="og:image" content="${escapeHtml(imageUrl)}">`);
    head.push('<meta name="twitter:card" content="summary_large_image">');
  } else {
    head.push('<meta name="twitter:card" content="summary">');
  }
  if (published) head.push(`<meta property="article:published_time" content="${isoFull(published)}">`);
  return render('layout', {
    lang: site.language,
    fullTitle,
    ogTitle: title || site.title,
    description: description || site.description,
    ogType,
    siteTitle: site.title,
    siteTagline: site.description,
    author: site.author,
    headExtra: head.join('\n  '),
    homeUrl: href(''),
    aboutUrl: href('about/'),
    feedUrl: href('feed.xml'),
    cssUrl: href('css/style.css'),
    faviconUrl: href('favicon.svg'),
    content,
  });
}

function resolveImage(doc) {
  if (!doc.image || /^[a-z][a-z0-9+.-]*:/i.test(doc.image)) return doc.image;
  return rewriteUrl(doc.image, { file: doc.file, docs, href: (p) => p });
}

for (const post of posts) {
  if (post.slug === 'images') fail(`${post.file}: "images" is reserved for the shared post image folder`);
  const pagePath = `${post.sitePath}index.html`;
  const href = relativeTo(pagePath);
  post.html = md.render(post.body, { file: post.file, docs, href });
  post.feedHtml = md.render(post.body, { file: post.file, docs, href: absoluteUrl })
    .replace(/ <a class="heading-anchor"[^>]*>#<\/a>/g, '');
  post.description ||= excerpt(post.html);
  const words = post.body.split(/\s+/).filter(Boolean).length;
  const meta = [`<time datetime="${isoDay(post.date)}">${formatDate(post.date)}</time>`];
  if (post.updated) meta.push(`updated <time datetime="${isoDay(post.updated)}">${formatDate(post.updated)}</time>`);
  meta.push(`${Math.max(1, Math.round(words / 220))} min read`);
  if (post.draft) meta.push('<strong class="draft">DRAFT</strong>');
  const content = render('post', {
    title: post.title,
    meta: meta.join(' <span aria-hidden="true">·</span> '),
    tags: tagList(post.tags),
    content: post.html,
    homeUrl: href(''),
  });
  claim(pagePath, post.file, layout({
    href, sitePath: post.sitePath, title: post.title, description: post.description, content,
    ogType: 'article', image: resolveImage(post), published: post.date,
  }));
}

for (const page of pages) {
  const pagePath = `${page.sitePath}index.html`;
  const href = relativeTo(pagePath);
  const html = md.render(page.body, { file: page.file, docs, href });
  const content = render('page', { title: page.title, content: html });
  claim(pagePath, page.file, layout({
    href, sitePath: page.sitePath, title: page.title,
    description: page.description || excerpt(html), content, image: resolveImage(page),
  }));
}

function postList(href) {
  if (!posts.length) return '<p class="empty">No posts yet.</p>';
  const items = posts.map((post) => render('post-item', {
    url: href(post.sitePath),
    title: post.title,
    description: post.description,
    isoDate: isoDay(post.date),
    date: formatDate(post.date),
    tags: tagList(post.tags),
    draft: post.draft ? ' <strong class="draft">DRAFT</strong>' : '',
  }));
  return `<ol class="post-list">\n${items.join('\n')}\n</ol>`;
}

{
  const href = relativeTo('index.html');
  const content = render('home', {
    siteTitle: site.title,
    siteTagline: site.description,
    posts: postList(href),
    feedUrl: href('feed.xml'),
  });
  claim('index.html', 'templates/home.html', layout({ href, sitePath: '', title: '', description: site.description, content }));
}

claim('404.html', 'templates/404.html', layout({
  href: basePathHref, sitePath: '404.html', title: 'Page not found', noindex: true,
  description: 'Page not found',
  content: render('404', { homeUrl: basePathHref('') }),
}));

// Atom feed
{
  const lastUpdated = posts.reduce((max, p) => Math.max(max, p.updated ?? p.date), 0);
  const entries = posts.map((post) => `  <entry>
    <title>${escapeHtml(post.title)}</title>
    <link rel="alternate" type="text/html" href="${escapeHtml(absoluteUrl(post.sitePath))}"/>
    <id>${escapeHtml(absoluteUrl(post.sitePath))}</id>
    <published>${isoFull(post.date)}</published>
    <updated>${isoFull(post.updated ?? post.date)}</updated>
${post.tags.map((t) => `    <category term="${escapeHtml(t)}"/>\n`).join('')}    <summary>${escapeHtml(post.description)}</summary>
    <content type="html">${escapeHtml(post.feedHtml)}</content>
  </entry>`);
  claim('feed.xml', 'feed', `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="${escapeHtml(site.language)}">
  <title>${escapeHtml(site.title)}</title>
  <subtitle>${escapeHtml(site.description)}</subtitle>
  <link rel="self" type="application/atom+xml" href="${escapeHtml(absoluteUrl('feed.xml'))}"/>
  <link rel="alternate" type="text/html" href="${escapeHtml(absoluteUrl(''))}"/>
  <id>${escapeHtml(absoluteUrl(''))}</id>
  <updated>${isoFull(new Date(lastUpdated))}</updated>
  <author><name>${escapeHtml(site.author)}</name></author>
${entries.join('\n')}
</feed>
`);
}

// Sitemap
{
  const urls = ['', ...pages.map((p) => p.sitePath), ...posts.map((p) => p.sitePath)];
  claim('sitemap.xml', 'sitemap', `<?xml version="1.0" encoding="utf-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${escapeHtml(absoluteUrl(u))}</loc></url>`).join('\n')}
</urlset>
`);
}

for (const asset of [...staticFiles, ...postAssets]) claim(asset.to, asset.from, null);

// -------------------------------------------------------------------- write

fs.rmSync(OUT_DIR, { recursive: true, force: true });
for (const { outPath, source, content } of outputs.values()) {
  const target = path.join(OUT_DIR, outPath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (content === null) fs.copyFileSync(path.join(ROOT, source), target);
  else fs.writeFileSync(target, content);
}

for (const message of [...new Set(warnings)]) console.warn(`warning: ${message}`);
const skipped = INCLUDE_DRAFTS ? '' : ' (drafts skipped)';
console.log(`Built ${posts.length} post(s), ${pages.length} page(s), ${outputs.size} files -> ${path.relative(ROOT, OUT_DIR)}/${skipped}`);
