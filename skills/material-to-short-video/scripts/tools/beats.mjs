#!/usr/bin/env node
// يحلّل إيقاع مقطوعة موسيقية (BPM + موضع أول ضربة) ويقترح حدود مشاهد على الضربات.
//   node tools/beats.mjs audio/music.mp3 [--bpm 91 | --min 70 --max 140 --center 100] [--durations 5,4,7,...]
// --durations = المدد المرغوبة للمشاهد (ث)؛ يُخرج bounds مقترحة (تُلصق في scenes.json) مضبوطة على أقرب ضربة.
// ملاحظة: التقدير تقريبي (ارتباط ذاتي لغلاف الطاقة) وقد يختلف قليلًا عن BPM المعلن؛ تحقق بالسمع.
import { execFileSync } from 'node:child_process';

const a = process.argv.slice(2);
const opt = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
const file = a.find((x, i) => !x.startsWith('--') && !String(a[i - 1] ?? '').startsWith('--'));
if (!file) { console.error('الاستخدام: node tools/beats.mjs <ملف صوت> [--min 70] [--max 140] [--durations 5,4,7]'); process.exit(1); }
const forced = opt('--bpm');                       // BPM معلن في كتالوج الموسيقى (الأدق): نقدّر موضع أول ضربة فقط
const lo = forced ? +forced : +opt('--min', 70), hi = forced ? +forced : +opt('--max', 140);

const raw = execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', file, '-vn', '-ac', '1', '-ar', '4000', '-f', 'f32le', 'pipe:1'], { maxBuffer: 1 << 28 });
const x = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
const hop = 40, fr = 4000 / hop, env = [];                       // 100 قيمة في الثانية
for (let i = 0; i + hop < x.length; i += hop) { let s = 0; for (let j = 0; j < hop; j++) s += x[i + j] ** 2; env.push(Math.sqrt(s / hop)); }
const on = env.map((v, i) => (i ? Math.max(0, v - env[i - 1]) : 0));
let best = null;
for (let bpm = lo; bpm <= hi; bpm += 0.1) {
  const P = (60 / bpm) * fr;
  for (let off = 0; off < P; off += 1) {
    let s = 0, n = 0;
    for (let t = off; t < on.length; t += P) { const k = Math.round(t); if (k < on.length) { s += on[k] + 0.5 * (on[k - 1] || 0) + 0.5 * (on[k + 1] || 0); n++; } }
    s /= n;
    // تفضيل خفيف للمدى الشائع (حول 100): يقلّل خلط الإيقاع بأضعافه/كسوره
    const prior = 0.8 + 0.2 * Math.exp(-0.5 * (Math.log(bpm / +opt('--center', 100)) / 0.35) ** 2);
    s *= prior;
    if (!best || s > best.s) best = { s, bpm, off: off / fr };
  }
}
const per = 60 / best.bpm, off = best.off, total = env.length / fr;
console.log(`BPM ≈ ${best.bpm.toFixed(1)} | دورة الضربة ${per.toFixed(3)}ث | أول ضربة ${off.toFixed(2)}ث | المدة ${total.toFixed(1)}ث`);
if (!forced) console.log('(تقدير تقريبي قد يلتبس بنسب الإيقاع؛ الأدق: --bpm <القيمة المعلنة للمقطوعة> أو حدّد --min/--max)');
const beats = []; for (let t = off; t < total; t += per) beats.push(+t.toFixed(3));
const snap = (t) => beats.reduce((p, c) => (Math.abs(c - t) < Math.abs(p - t) ? c : p), beats[0]);

const durs = opt('--durations');
if (durs) {
  const d = durs.split(',').map(Number); let c = 0; const B = [0];
  d.forEach((v, i) => { c += v; B.push(i === d.length - 1 ? +c.toFixed(2) : +snap(c).toFixed(2)); });
  const sum = B[B.length - 1];
  console.log('\nbounds مقترحة (آخر قيمة = المدة الإجمالية، لم تُضبط على ضربة):\n' + JSON.stringify(B));
  B.slice(0, -1).forEach((b, i) => { const dd = B[i + 1] - b; console.log(`  مشهد ${i + 1}: ${b.toFixed(2)} → ${B[i + 1].toFixed(2)}  (${dd.toFixed(2)}ث، مطلوب ${d[i]})`); });
  if (sum > total + 0.05) console.warn(`⚠ مجموع المدد ${sum}ث أطول من الموسيقى ${total.toFixed(1)}ث`);
}
