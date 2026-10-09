#!/usr/bin/env node
// خادم ملفات ثابتة محلي (للقراءة فقط) لتسجيل مواد ويب:  node tools/serve.mjs <مجلد-المادة> [المنفذ=5173]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] ?? '.'), port = +(process.argv[3] ?? process.env.PORT ?? 5173);
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.mp4': 'video/mp4', '.pdf': 'application/pdf' };
http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('404'); }
  res.writeHead(200, { 'Content-Type': mime[path.extname(f).toLowerCase()] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(f).pipe(res);
}).listen(port, () => console.log(`http://localhost:${port}  ←  ${root}`));
