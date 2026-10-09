#!/usr/bin/env node
// يولّد graphics/assets/fonts.css (base64 داخل @font-face) ويحقنه داخل graphics/index.html وthumbnail.html بين العلامتين.
// لا روابط خارجية ولا local() ولا خطوط نظام.  الإعداد: fonts.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(ROOT);
const cfg = JSON.parse(fs.readFileSync('fonts.json', 'utf8').replace(/^﻿/, ''));
const MIME = { woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf', otf: 'font/otf' };
const FMT = { woff2: 'woff2', woff: 'woff', ttf: 'truetype', otf: 'opentype' };
let css = '/* مولَّد آليًا — tools/make-fonts.mjs. الخطوط مضمّنة base64. */\n', n = 0;
for (const f of cfg.faces ?? []) {
  const p = path.join(cfg.dir, f.file);
  if (!fs.existsSync(p)) throw new Error(`ملف الخط غير موجود: ${p}`);
  const ext = path.extname(f.file).slice(1).toLowerCase();
  css += `@font-face{font-family:'${f.family}';font-style:${f.style ?? 'normal'};font-weight:${f.weight ?? 400};font-display:block;src:url(data:${MIME[ext]};base64,${fs.readFileSync(p).toString('base64')}) format('${FMT[ext]}')${f.unicodeRange ? `;unicode-range:${f.unicodeRange}` : ''}}\n`;
  n++;
}
if (!n) console.warn('⚠ لا توجد خطوط في fonts.json — سيستخدم المتصفح خطوط النظام (غير مسموح للمطابقة التامة).');
fs.mkdirSync('graphics/assets', { recursive: true });
fs.writeFileSync('graphics/assets/fonts.css', css);
console.log('faces:', n, '| KB:', Math.round(css.length / 1024));
const START = '/*FONTS:START*/', END = '/*FONTS:END*/';
for (const f of ['graphics/index.html', 'graphics/thumbnail.html']) {
  if (!fs.existsSync(f)) continue;
  const h = fs.readFileSync(f, 'utf8'); const i = h.indexOf(START), j = h.indexOf(END);
  if (i < 0 || j < 0) { console.log('تخطي (لا علامات):', f); continue; }
  fs.writeFileSync(f, h.slice(0, i) + START + '\n' + css + h.slice(j));
  console.log('حُقنت الخطوط في', f);
}
