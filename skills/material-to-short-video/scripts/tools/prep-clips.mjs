#!/usr/bin/env node
// يجهّز وسائط المشاهد (scenes.json) لمشروع HyperFrames داخل graphics/assets/media:
// فيديو: يُقصّ ويُمدَّد آخر إطار (clone) ليغطي المشهد (+0.4ث)، بلا صوت، بإطارات مفتاحية كثيرة. صورة: تُنسخ.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(ROOT);
const readJSON = (f) => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, ''));
const S = readJSON('scenes.json');
const T = readJSON('design-tokens.json');
const FADE = T.motion.fade, fps = T.canvas.fps;
const isVideo = (f) => /\.(mp4|mov|webm|mkv|m4v)$/i.test(f);
const dur = (f) => parseFloat(JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', f], { encoding: 'utf8' })).format.duration);

fs.rmSync('graphics/assets/media', { recursive: true, force: true });
fs.mkdirSync('graphics/assets/media', { recursive: true });
S.scenes.forEach((s, i) => {
  if (s.kind !== 'media') return;
  if (!fs.existsSync(s.media)) throw new Error(`غير موجود: ${s.media} (مشهد ${s.id})`);
  const out = path.join('graphics/assets/media', path.basename(s.media));
  const st = i === 0 ? 0 : S.bounds[i] - FADE, need = +(S.bounds[i + 1] - st + 0.4).toFixed(2);
  if (!isVideo(s.media)) { fs.copyFileSync(s.media, out); console.log('✔', s.id.padEnd(12), 'صورة'); return; }
  const from = s.from ?? 0, avail = dur(s.media) - from, pad = Math.max(0, need - avail + 0.05);
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(from), '-i', s.media, '-an', '-t', String(need),
    '-vf', `fps=${fps},tpad=stop_mode=clone:stop_duration=${pad.toFixed(2)},format=yuv420p`,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-g', '15', '-keyint_min', '15', '-threads', '0', '-movflags', '+faststart', out]);
  const msg = avail > need + 0.05 ? `⚠ يُقصّ ${(avail - need).toFixed(2)}ث من نهاية المقطع` : pad > 0.05 ? `تمديد ${pad.toFixed(2)}ث` : 'مطابق';
  console.log('✔', s.id.padEnd(12), `مشهد ${(need - 0.4).toFixed(2)}s | مقطع ${avail.toFixed(2)}s | ${msg}`);
});
