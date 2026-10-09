#!/usr/bin/env node
// يتحقق من نظام التصميم رياضيًا: نسب التباين (WCAG) + حدود الأحجام + المنطقة الآمنة.
// الاستخدام: node tools/check-tokens.mjs [design-tokens.json | presets/*.json ...]
import fs from 'node:fs';
import path from 'node:path';

const lum = (h) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
export const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// أزواج (لون النص، لون الخلفية، الحدّ الأدنى، الوصف)
const RULES = (c) => [
  [c.text, c.bg, 7, 'نص أساسي على الخلفية'],
  [c.text2, c.bg, 7, 'نص ثانوي على الخلفية'],
  [c.muted, c.bg, 4.5, 'نص خافت على الخلفية'],
  [c.accent, c.bg, 4.5, 'لون التمييز على الخلفية'],
  [c.onAccent, c.accent, 4.5, 'نص فوق لون التمييز'],
  [c.text, c.surface, 7, 'نص أساسي على البطاقة'],
  [c.before.text, c.before.card, 4.5, 'نص «قبل» على بطاقته'],
  [c.before.num, c.before.card, 3, 'رقم «قبل» (كبير) على بطاقته'],
];

export function check(tokens, label = '') {
  const c = tokens.color; let fails = 0; const rows = [];
  for (const [fg, bg, min, what] of RULES(c)) {
    const r = contrast(fg, bg); const ok = r >= min; if (!ok) fails++;
    rows.push(`${ok ? '✅' : '❌'} ${r.toFixed(2).padStart(5)}:1  (≥${min})  ${what}  ${fg} على ${bg}`);
  }
  const t = tokens.type;
  if (t) {
    const chk = (cond, msg) => { if (!cond) { fails++; rows.push('❌ ' + msg); } else rows.push('✅ ' + msg.replace('يجب', 'تحقق')); };
    chk(t.title >= t.minTitle, `يجب أن يكون العنوان ≥ ${t.minTitle}px (الحالي ${t.title})`);
    chk(t.tag >= t.minSecondary && t.sub >= t.minSecondary && t.subSmall >= t.minSecondary && t.credit >= t.minSecondary, `يجب أن تكون كل النصوص الثانوية ≥ ${t.minSecondary}px`);
  }
  console.log(`\n── ${label || tokens.meta?.name || 'tokens'} ──\n` + rows.join('\n') + `\n${fails ? '❌ ' + fails + ' مخالفة' : '✅ مطابق'}`);
  return fails;
}

import { fileURLToPath } from 'node:url';
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = process.argv.slice(2);
  let total = 0;
  for (const f of files) { const j = JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); total += check(j, path.basename(f)); }
  process.exit(total ? 1 : 0);
}
