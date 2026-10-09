#!/usr/bin/env node
// مراجعة آلية للفيديو النهائي: المدة والأبعاد والجهارة وفحص منطقة الأمان (كل نصف ثانية).
// يقرأ الهوامش والأبعاد من design-tokens.json، والملف من project.json (output.video).
// الاستخدام: node tools/review.mjs [فيديو] [--threshold 110] [--expect-duration 60]
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJSON = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/^\uFEFF/, ''));
const T = readJSON('design-tokens.json'), P = readJSON('project.json');
const a = process.argv.slice(2);
const opt = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : undefined; };
const file = path.resolve(ROOT, a.find((x, i) => !x.startsWith('--') && !String(a[i - 1] ?? '').startsWith('--')) ?? P.output.video);
const { w: W, h: H } = T.canvas, { top, bottom, side } = T.safe;
const bg = [1, 3, 5].map((i) => parseInt(T.color.bg.slice(i, i + 2), 16));
const bgY = 0.299 * bg[0] + 0.587 * bg[1] + 0.114 * bg[2], dark = bgY < 128;
const TH = +(opt('--threshold') ?? (dark ? 110 : Math.round(bgY - 95)));   // داكن: سطوع أعلى من العتبة = عنصر | فاتح: سطوع أقل من العتبة = حبر
const EXPECT = opt('--expect-duration') ? +opt('--expect-duration') : P.duration;

const run = (cmd, args) => { const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 1 << 28 }); return (r.stdout ?? '') + (r.stderr ?? ''); };   // ffmpeg يكتب إلى stderr
let fail = 0; const ok = (c, m) => { console.log((c ? '✅ ' : '❌ ') + m); if (!c) fail++; };

const pr = JSON.parse(run('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file]));
const v = pr.streams.find((s) => s.codec_type === 'video'), hasA = pr.streams.some((s) => s.codec_type === 'audio'), dur = +pr.format.duration;
ok(v.width === W && v.height === H, `الأبعاد ${v.width}×${v.height} (المطلوب ${W}×${H})`);
ok(Math.abs(dur - EXPECT) <= 0.1, `المدة ${dur.toFixed(2)}s (المطلوب ${EXPECT}s ±0.1)`);
ok(hasA, `الصوت: ${hasA ? 'موجود' : 'غير موجود'}`);
const e = run('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-']);
const lufs = +[...e.matchAll(/\n\s+I:\s+(-?[\d.]+) LUFS/g)].pop()?.[1], peak = +[...e.matchAll(/\n\s+Peak:\s+(-?[\d.]+) dBFS/g)].pop()?.[1];
ok(Math.abs(lufs - T.audio.lufs) <= 0.5, `الجهارة ${lufs} LUFS (الهدف ${T.audio.lufs} ±0.5)`);
ok(peak <= T.audio.tp + 0.5, `الذروة ${peak} dBFS (الحد ${T.audio.tp}؛ هامش قياس 0.5)`);

const regions = { [`أعلى ${top}`]: `${W}:${top}:0:0`, [`أسفل ${bottom}`]: `${W}:${bottom}:0:${H - bottom}`, [`يسار ${side}`]: `${side}:${H}:0:0`, [`يمين ${side}`]: `${side}:${H}:${W - side}:0` };
const key = dark ? 'YMAX' : 'YMIN';
for (const [name, geo] of Object.entries(regions)) {
  const out = run('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-vf', `fps=2,crop=${geo},signalstats,metadata=print:key=lavfi.signalstats.${key}`, '-f', 'null', '-']);
  const ys = [...out.matchAll(new RegExp(key + '=(\\d+)', 'g'))].map((m) => +m[1]);
  const viol = ys.map((y, i) => [i / 2, y]).filter(([, y]) => (dark ? y > TH : y < TH));
  ok(!viol.length, `هامش ${name}: ${dark ? 'أقصى سطوع ' + Math.max(...ys) : 'أدنى سطوع ' + Math.min(...ys)} (عتبة ${TH}) ${viol.length ? '— تجاوزات عند: ' + viol.slice(0, 8).map(([t, y]) => `${t}s(${y})`).join(', ') : ''}`);
}
console.log(fail ? `\n❌ ${fail} بند فاشل` : '\n✅ كل البنود سليمة');
process.exit(fail ? 1 : 0);
