#!/usr/bin/env node
// ينشئ مشروع فيديو قصير جديد من القوالب.
//   node <kit>/scripts/init.mjs <مجلد-المشروع> [--preset dark-mint|light-paper|midnight-blue|warm-dusk] [--lang ar|en]
// لا يثبّت أي شيء ولا يلمس مجلد المادة. بعده: ضع الخطوط في fonts.json، وعدّل scenes.json وtools/scenarios.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const a = process.argv.slice(2);
const opt = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
const target = a.find((x, i) => !x.startsWith('--') && !String(a[i - 1] ?? '').startsWith('--'));
if (!target) { console.error('الاستخدام: node init.mjs <مجلد-المشروع> [--preset dark-mint] [--lang ar|en]'); process.exit(1); }
const preset = opt('--preset', 'dark-mint'), lang = opt('--lang', 'ar');
const T = path.resolve(target);
const presetFile = path.join(KIT, 'templates/presets', preset + '.json');
if (!fs.existsSync(presetFile)) { console.error('سمة غير معروفة:', preset, '— المتاح:', fs.readdirSync(path.join(KIT, 'templates/presets')).map((f) => f.replace('.json', '')).join(', ')); process.exit(1); }
if (fs.existsSync(path.join(T, 'project.json'))) { console.error('المجلد يحوي مشروعًا بالفعل:', T); process.exit(1); }

const readJSON = (f) => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, ''));
for (const d of ['raw', 'audio', 'graphics', 'work', 'export', 'tools']) fs.mkdirSync(path.join(T, d), { recursive: true });
fs.cpSync(path.join(KIT, 'scripts/tools'), path.join(T, 'tools'), { recursive: true });
fs.copyFileSync(path.join(KIT, 'scripts/build.mjs'), path.join(T, 'build.mjs'));
for (const f of ['project.json', 'scenes.json', 'fonts.json']) fs.copyFileSync(path.join(KIT, 'templates', f), path.join(T, f));
fs.copyFileSync(path.join(KIT, 'templates/scenarios.example.mjs'), path.join(T, 'tools/scenarios.mjs'));
fs.cpSync(path.join(KIT, 'templates/graphics'), path.join(T, 'graphics'), { recursive: true });

// design-tokens.json = الأساس + ألوان السمة المختارة
const tokens = readJSON(path.join(KIT, 'templates/design-tokens.base.json'));
const p = readJSON(presetFile);
tokens.color = p.color; tokens.meta = { ...p.meta, base: preset };
tokens.lang = lang; tokens.dir = lang === 'ar' ? 'rtl' : 'ltr';
fs.writeFileSync(path.join(T, 'design-tokens.json'), JSON.stringify(tokens, null, 2));

// gsap: لا نوزّعه مع الحزمة (ترخيصه). نبحث عنه في جهازك أو نشرح التثبيت.
fs.mkdirSync(path.join(T, 'graphics/assets'), { recursive: true });
const gsapDest = path.join(T, 'graphics/assets/gsap.min.js');
const gsapCands = [process.env.GSAP_PATH, path.join(process.cwd(), 'node_modules/gsap/dist/gsap.min.js'), process.env.HF_ENV && path.join(process.env.HF_ENV, 'node_modules/gsap/dist/gsap.min.js'), path.join(KIT, 'node_modules/gsap/dist/gsap.min.js'), path.join(path.dirname(KIT), 'node_modules/gsap/dist/gsap.min.js')].filter(Boolean).filter((p) => fs.existsSync(p));
let gsapOk = false;
if (gsapCands.length) { fs.copyFileSync(gsapCands[0], gsapDest); gsapOk = true; }
console.log(`✔ أُنشئ المشروع: ${T}\n  السمة: ${preset} | اللغة: ${lang} (${tokens.dir})`);
console.log(`
الخطوات التالية:
  1) ضع ملفات الخطوط في graphics/assets/fonts وعرّفها في fonts.json، واضبط font.head/body في design-tokens.json
  2) node tools/check-tokens.mjs design-tokens.json     # تحقق من التباين والأحجام
  3) سجّل/اجمع مواد المشاهد في raw/  (مواد ويب: node tools/serve.mjs <مجلد-المادة> ثم node tools/record.mjs all)
  4) عدّل scenes.json (المشاهد والنصوص) و bounds (استخدم: node tools/beats.mjs audio/music.mp3 --durations ...)
  5) node tools/prep-clips.mjs && node tools/gen-composition.mjs && node tools/make-fonts.mjs
  6) node build.mjs && node tools/review.mjs`);
