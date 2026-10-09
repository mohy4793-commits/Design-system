#!/usr/bin/env node
// نظام المونتاج المحلي: يعمل على المعالج فقط (libx264) بلا أي ترميز بالـ GPU ولا خدمات سحابية.
// الاستخدام: node build.mjs [project.json] [--skip-graphics]
import { spawn } from 'node:child_process';
import { promises as fs, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const cfgPath = path.resolve(ROOT, args.find((a) => !a.startsWith('--')) ?? 'project.json');
const skipGraphicsFlag = args.includes('--skip-graphics');

const abs = (p) => path.resolve(ROOT, p);
const fmt = (s) => `${s.toFixed(1)}s`;

class StepError extends Error {}

function run(cmd, cmdArgs, { cwd = ROOT, capture = false } = {}) {
  return new Promise((resolve, reject) => {
    // على ويندوز تحتاج npx/npm إلى shell لأنها ملفات .cmd
    const child = spawn(cmd, cmdArgs, { cwd, shell: process.platform === 'win32' && /^(npx|npm)$|\.(cmd|bat)$/i.test(cmd) });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d; if (!capture) process.stdout.write(d); });
    child.stderr.on('data', (d) => { err += d; if (!capture && cmd !== 'ffmpeg') process.stderr.write(d); });
    child.on('error', (e) => reject(new StepError(`تعذّر تشغيل ${cmd}: ${e.message}`)));
    child.on('close', (code) => {
      if (code === 0) return resolve({ out, err });
      const tail = err.split('\n').slice(-25).join('\n');
      reject(new StepError(`فشل الأمر (رمز ${code}):\n${cmd} ${cmdArgs.join(' ')}\n--- رسالة ${cmd} ---\n${tail}`));
    });
  });
}

const ff = (a, o) => run('ffmpeg', ['-hide_banner', '-y', '-loglevel', 'error', '-stats', ...a], o);

async function probe(file) {
  const { out } = await run('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { capture: true });
  const j = JSON.parse(out);
  return {
    duration: parseFloat(j.format.duration),
    hasAudio: j.streams.some((s) => s.codec_type === 'audio'),
    video: j.streams.find((s) => s.codec_type === 'video'),
  };
}

let stepNo = 0;
async function step(title, fn) {
  stepNo++;
  const t0 = Date.now();
  console.log(`\n[${stepNo}] ▶ ${title}`);
  const r = await fn();
  console.log(`[${stepNo}] ✔ ${title} — ${fmt((Date.now() - t0) / 1000)}`);
  return r;
}

async function main() {
  const cfg = JSON.parse((await fs.readFile(cfgPath, 'utf8')).replace(/^﻿/, ''));
  const { width: W, height: H, fps: FPS, duration: DUR } = cfg;
  const enc = { codec: 'libx264', preset: 'medium', crf: 18, threads: 0, pixFmt: 'yuv420p', audioBitrate: '192k', intermediatePreset: 'veryfast', intermediateCrf: 14, ...cfg.encode };
  if (enc.codec !== 'libx264') throw new StepError('المسموح فقط libx264 على المعالج (لا nvenc ولا videotoolbox ولا qsv).');
  const work = abs('work');
  await fs.mkdir(work, { recursive: true });
  await fs.mkdir(abs('export'), { recursive: true });
  const total0 = Date.now();

  // أ. رندر رسوميات HyperFrames محليًا
  const g = cfg.graphics ?? {};
  if (!g.skipRender && !skipGraphicsFlag && cfg.segments.some((s) => s.type === 'graphic')) {
    await step('رندر رسوميات HyperFrames محليًا', async () => {
      const [cmd, ...rest] = g.renderCommand ?? ['npx', 'hyperframes', 'render'];
      await fs.mkdir(abs(g.outputDir ?? 'graphics/out'), { recursive: true });
      await run(cmd, rest, { cwd: abs(g.dir ?? 'graphics') });
    });
  }

  // ب + ج. قص وتوحيد كل مقطع (scale+pad، fps، AAC 48k ستيريو، وصمت عند غياب الصوت)
  const segFiles = [];
  await step(`قص وتوحيد ${cfg.segments.length} مقطع`, async () => {
    for (const [i, s] of cfg.segments.entries()) {
      const src = abs(s.path);
      if (!existsSync(src)) throw new StepError(`المقطع غير موجود: ${s.path}`);
      const info = await probe(src);
      const start = s.start ?? 0;
      const end = s.end ?? info.duration;
      const len = end - start;
      if (len <= 0) throw new StepError(`مدة غير صالحة للمقطع ${s.path}`);
      const out = path.join(work, `seg_${String(i).padStart(2, '0')}.mp4`);
      const vf = `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=${FPS},format=${enc.pixFmt}`;
      const inputs = ['-ss', String(start), '-t', String(len), '-i', src];
      let maps;
      if (info.hasAudio) {
        maps = ['-map', '0:v:0', '-map', '0:a:0', '-af', 'aresample=48000,aformat=channel_layouts=stereo'];
      } else {
        inputs.push('-f', 'lavfi', '-t', String(len), '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000');
        maps = ['-map', '0:v:0', '-map', '1:a:0'];
      }
      console.log(`   • ${s.name ?? s.path}  [${fmt(start)} → ${fmt(end)}] ${info.hasAudio ? 'مع صوت' : 'صامت (anullsrc)'}`);
      await ff([...inputs, ...maps, '-vf', vf, '-c:v', 'libx264', '-threads', String(enc.threads), '-preset', enc.intermediatePreset, '-crf', String(enc.intermediateCrf),
        '-c:a', 'aac', '-ar', '48000', '-ac', '2', '-b:a', enc.audioBitrate, '-t', String(len), out]);
      segFiles.push(out);
    }
  });

  // د. الدمج بـ concat demuxer
  const concatFile = path.join(work, 'concat.mp4');
  await step('دمج المقاطع (concat demuxer)', async () => {
    const list = path.join(work, 'concat.txt');
    await fs.writeFile(list, segFiles.map((f) => `file '${path.basename(f)}'`).join('\n'));
    await ff(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', concatFile]);
  });
  const cInfo = await probe(concatFile);
  console.log(`   مدة الدمج: ${fmt(cInfo.duration)} (المطلوب ${DUR}s)`);

  // هـ. مزج الموسيقى مع الخفض التلقائي ثم loudnorm
  const m = cfg.music;
  const useMusic = m?.file && existsSync(abs(m.file));
  if (m?.file && !useMusic) console.log(`   ⚠ ملف الموسيقى غير موجود (${m.file}) — سيُنتج الفيديو بلا موسيقى.`);
  const ln = { I: -14, TP: -1.5, LRA: 11, ...cfg.loudnorm };
  const mixWav = path.join(work, 'audio_mix.wav');

  await step(useMusic ? 'مزج الموسيقى مع خفض تلقائي (sidechaincompress)' : 'تجهيز مسار الصوت', async () => {
    const d = { threshold: 0.04, ratio: 8, attack: 20, release: 400, ...m?.duck };
    if (useMusic) {
      const fade = m.fadeOut ?? 1.5;
      const filt =
        `[1:a]aresample=48000,aformat=channel_layouts=stereo,atrim=0:${DUR},asetpts=PTS-STARTPTS,volume=${m.volume ?? 0.5},afade=t=out:st=${DUR - fade}:d=${fade}[m];` +
        `[0:a]aresample=48000,aformat=channel_layouts=stereo,asplit=2[vo][sc];` +
        `[m][sc]sidechaincompress=threshold=${d.threshold}:ratio=${d.ratio}:attack=${d.attack}:release=${d.release}[duck];` +
        `[vo][duck]amix=inputs=2:duration=first:normalize=0[mix]`;
      await ff(['-i', concatFile, '-stream_loop', '-1', '-i', abs(m.file), '-filter_complex', filt, '-map', '[mix]', '-t', String(DUR), '-ar', '48000', '-ac', '2', mixWav]);
    } else {
      await ff(['-i', concatFile, '-map', '0:a:0', '-t', String(DUR), '-ar', '48000', '-ac', '2', mixWav]);
    }
  });

  // loudnorm بمرورين لدقة أعلى
  let lnFilter;
  await step(`قياس الجهارة (loudnorm مرحلة 1، الهدف ${ln.I} LUFS)`, async () => {
    const { err } = await run('ffmpeg', ['-hide_banner', '-nostats', '-i', mixWav, '-af', `loudnorm=I=${ln.I}:TP=${ln.TP}:LRA=${ln.LRA}:print_format=json`, '-f', 'null', '-'], { capture: true });
    const jsonStr = err.slice(err.lastIndexOf('{'), err.lastIndexOf('}') + 1);
    const r = JSON.parse(jsonStr);
    lnFilter = `loudnorm=I=${ln.I}:TP=${ln.TP}:LRA=${ln.LRA}:measured_I=${r.input_i}:measured_TP=${r.input_tp}:measured_LRA=${r.input_lra}:measured_thresh=${r.input_thresh}:offset=${r.target_offset}:linear=true`;
    console.log(`   المقاسة: I=${r.input_i} TP=${r.input_tp}`);
  });

  // و. الترميز النهائي
  const finalOut = abs(cfg.output.video);
  await step('الترميز النهائي (libx264 على المعالج) + faststart', async () => {
    await ff(['-i', concatFile, '-i', mixWav, '-map', '0:v:0', '-map', '1:a:0', '-af', `${lnFilter},aresample=48000`,
      '-c:v', 'libx264', '-threads', String(enc.threads), '-preset', enc.preset, '-crf', String(enc.crf), '-pix_fmt', enc.pixFmt, '-r', String(FPS),
      '-c:a', 'aac', '-ar', '48000', '-ac', '2', '-b:a', enc.audioBitrate, '-t', String(DUR), '-movflags', '+faststart', finalOut]);
  });

  await step('إنشاء الصورة المصغرة', async () => {
    const thumb = abs(cfg.output.thumbnail);
    const srcImg = cfg.output.thumbnailSource && abs(cfg.output.thumbnailSource);
    if (srcImg && existsSync(srcImg)) {
      await ff(['-i', srcImg, '-vf', `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2`, '-frames:v', '1', '-q:v', '2', thumb]);
    } else {
      await ff(['-ss', String(cfg.output.thumbnailFallbackTime ?? 5), '-i', finalOut, '-frames:v', '1', '-q:v', '2', thumb]);
    }
  });

  await step('التحقق النهائي بـ ffprobe', async () => {
    const f = await probe(finalOut);
    const v = f.video;
    const ok = v.width === W && v.height === H && Math.abs(f.duration - DUR) <= 0.1 && f.hasAudio;
    console.log(`   الأبعاد ${v.width}x${v.height} | المدة ${f.duration.toFixed(2)}s | fps ${v.r_frame_rate} | صوت: ${f.hasAudio ? 'نعم' : 'لا'}`);
    if (!ok) throw new StepError('فشل التحقق: الأبعاد أو المدة أو الصوت لا تطابق project.json');
  });

  console.log(`\n✅ تم: ${cfg.output.video} — الزمن الكلي ${fmt((Date.now() - total0) / 1000)}`);
}

main().catch((e) => {
  console.error(`\n❌ توقف البناء عند الخطوة ${stepNo}:\n${e instanceof StepError ? e.message : e.stack}`);
  process.exit(1);
});
