#!/usr/bin/env node
// Local preview server. Serves the built site under the same base path as GitHub Pages
// (e.g. http://localhost:4000/blog/) so base-path mistakes show up before publishing.
//
//   node scripts/serve.mjs [dir] [--port 4000]

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const portFlag = args.indexOf('--port');
const port = portFlag === -1 ? 4000 : Number(args[portFlag + 1]);
const dirArg = args.find((a, i) => !a.startsWith('--') && i !== portFlag + 1) ?? 'dist';
const dir = path.resolve(ROOT, dirArg);
const site = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'), 'utf8'));
const base = `/${site.basePath.replace(/^\/+|\/+$/g, '')}/`.replace('//', '/');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.xml': 'application/xml; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.avif': 'image/avif', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.mp4': 'video/mp4',
  '.webm': 'video/webm', '.txt': 'text/plain; charset=utf-8',
};

function send(res, status, file) {
  res.writeHead(status, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch { pathname = url.pathname; }
  const notFound = () => {
    const page = path.join(dir, '404.html');
    if (fs.existsSync(page)) return send(res, 404, page);
    res.writeHead(404).end('Not found');
  };
  if (pathname === base.slice(0, -1)) return res.writeHead(301, { Location: base }).end();
  if (!pathname.startsWith(base)) {
    if (pathname === '/') return res.writeHead(302, { Location: base }).end();
    return notFound();
  }
  const file = path.join(dir, pathname.slice(base.length));
  if (file !== dir && !file.startsWith(dir + path.sep)) return notFound();
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
    if (!pathname.endsWith('/')) return res.writeHead(301, { Location: `${pathname}/${url.search}` }).end();
    const index = path.join(file, 'index.html');
    return fs.existsSync(index) ? send(res, 200, index) : notFound();
  }
  return fs.existsSync(file) ? send(res, 200, file) : notFound();
}).listen(port, () => {
  console.log(`Serving ${path.relative(ROOT, dir) || '.'}/ at http://localhost:${port}${base}  (Ctrl+C to stop)`);
});
