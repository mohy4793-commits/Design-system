#!/usr/bin/env node
// يولّد graphics/index.html (+ graphics/thumbnail.html) من design-tokens.json و scenes.json.
// أنواع المشاهد: title | media (فيديو أو صورة) | before | cta.  لا نصوص مثبّتة في الكود.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(ROOT);
const readJSON = (f) => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, ''));
const T = readJSON('design-tokens.json');
const S = readJSON('scenes.json');
const { canvas, area: A, type: TY, color: C, motion: M } = T;
const DUR = S.duration, B = S.bounds, FADE = M.fade;
const rtl = T.dir === 'rtl';
const f2 = (n) => +n.toFixed(2);
const inside = rtl ? -30 : 30;            // انزلاق الوسم «من الداخل» كي لا يدخل هامش الأمان
const words = (h) => String(h ?? '').replace(/<[^>]*>/g, ' ').trim().split(/\s+/).filter(Boolean).length;
const warn = (m) => console.warn('⚠', m);

if (!fs.existsSync('graphics/assets/gsap.min.js')) throw new Error('graphics/assets/gsap.min.js غير موجود: نفّذ npm install gsap وانسخ node_modules/gsap/dist/gsap.min.js إلى هناك (لا نوزّعه مع الحزمة).');
if (B.length !== S.scenes.length + 1) throw new Error(`bounds (${B.length}) يجب أن يساوي عدد المشاهد + 1 (${S.scenes.length + 1})`);
if (Math.abs(B[B.length - 1] - DUR) > 0.01) throw new Error(`آخر حدّ (${B[B.length - 1]}) يجب أن يساوي duration (${DUR})`);

const isVideo = (f) => /\.(mp4|mov|webm|mkv|m4v)$/i.test(f);
function dims(file) {
  const j = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', file], { encoding: 'utf8' }));
  return { w: j.streams[0].width, h: j.streams[0].height };
}
const globe = (id, size) => `<canvas id="${id}" class="globe" width="${size}" height="${size}" style="left:${Math.round((canvas.w - size) / 2)}px;top:${size > 450 ? 330 : 300}px"></canvas>`;

let html = ''; const tl = []; const spins = [];
S.scenes.forEach((s, i) => {
  const st = f2(i === 0 ? 0 : B[i] - FADE), en = f2(B[i + 1]), dur = f2(en - st), id = `s_${s.id}`;
  const fadeIn = i === 0 ? '' : `tl.fromTo('#${id}',{opacity:0},{opacity:1,duration:${FADE},ease:'none'},${st});`;
  const open = (extra = '') => `\n  <div id="${id}" class="scene clip" data-start="${st}" data-duration="${dur}" data-track-index="${i + 1}"${extra}>`;
  const tag = (text, gray) => `\n    <div class="tag${gray ? ' gray' : ''}" id="t_${s.id}"><i></i><span id="tt_${s.id}">${text}</span></div>`;
  const tagIn = `tl.fromTo('#t_${s.id}',{opacity:0,x:${inside}},{opacity:1,x:0,duration:.4,ease:E},${f2(st + 0.15)});`;
  [s.title, s.subtitle, s.tagline, s.button, s.credit].forEach((t) => { if (t && words(t) > TY.maxWords) warn(`مشهد ${s.id}: «${String(t).replace(/<[^>]*>/g, '')}» أكثر من ${TY.maxWords} كلمات`); });

  if (s.kind === 'title') {
    html += open() + (T.ornament === 'globe' ? '\n    ' + globe(`g_${s.id}`, 520) : '') + `
    <div class="stack" style="top:880px">
      <div id="${s.id}_a" class="h1 c" style="font-size:${TY.hero}px">${s.title}</div>
      ${s.subtitle ? `<div id="${s.id}_b" class="sub c" style="font-size:${TY.sub}px">${s.subtitle}</div>` : ''}
      ${s.tagline ? `<div id="${s.id}_c" class="sub c" style="font-size:${TY.subSmall}px;color:var(--muted)">${s.tagline}</div>` : ''}
    </div>
  </div>`;
    if (T.ornament === 'globe') { spins.push([`g_${s.id}`, st, dur]); tl.push(`tl.fromTo('#g_${s.id}',{opacity:0,scale:.7},{opacity:1,scale:1,duration:.9,ease:EX},${f2(st + 0.05)});`); }
    tl.push(fadeIn,
      `tl.fromTo('#${s.id}_a',{opacity:0,y:60,filter:'blur(16px)'},{opacity:1,y:0,filter:'blur(0px)',duration:.8,ease:EX},${f2(st + 0.45)});`,
      s.subtitle ? `tl.fromTo('#${s.id}_b',{opacity:0,y:40},{opacity:1,y:0,duration:.6,ease:E},${f2(st + 1.3)});` : '',
      s.tagline ? `tl.fromTo('#${s.id}_c',{opacity:0,y:30},{opacity:1,y:0,duration:.6,ease:E},${f2(st + 2.0)});` : '');
  }

  if (s.kind === 'media') {
    const file = s.media; if (!fs.existsSync(file)) throw new Error(`ملف الوسائط غير موجود: ${file} (مشهد ${s.id})`);
    const { w, h } = dims(file); const sc = Math.min(A.width / w, A.height / h, 3);
    const mw = Math.round(w * sc), mh = Math.round(h * sc), left = Math.round((canvas.w - mw) / 2), top = Math.round(A.top + (A.height - mh) / 2);
    const base = path.basename(file); const el = isVideo(file)
      ? `<video id="v_${s.id}" class="clip" muted playsinline src="assets/media/${base}" data-start="${st}" data-duration="${dur}" data-media-start="0"></video>`
      : `<img id="v_${s.id}" src="assets/media/${base}" alt="" />`;
    html += open() + tag(s.tag ?? '') + `
    <div class="media" id="m_${s.id}" style="left:${left}px;top:${top}px;width:${mw}px;height:${mh}px">${el}</div>
  </div>`;
    if (s.wipe) tl.push(`tl.fromTo('#${id}',{clipPath:'inset(0 ${rtl ? '0 0 100%' : '100% 0 0'})'},{clipPath:'inset(0 0 0 0%)',duration:${M.wipe},ease:'power3.inOut'},${st});`);
    else tl.push(fadeIn);
    tl.push(tagIn, `tl.fromTo('#m_${s.id}',{y:-30,opacity:0},{y:0,opacity:1,duration:.6,ease:EX},${f2(st + 0.1)});`);
    if (!isVideo(file) && s.kenburns) tl.push(`tl.fromTo('#v_${s.id}',{scale:1},{scale:1.07,duration:${dur},ease:'none'},${st});`);
    for (const [off, text] of s.swaps ?? []) tl.push(`tl.call(()=>{document.getElementById('tt_${s.id}').textContent=${JSON.stringify(text)};},null,${f2(st + off)});`);
    if (Math.min(w, h) < 600) warn(`مشهد ${s.id}: الوسائط صغيرة (${w}×${h}) وقد تبدو ضبابية`);
    console.log(`  ${s.id.padEnd(12)} ${st.toFixed(2)}→${en.toFixed(2)} | ${w}x${h} × ${sc.toFixed(2)} = ${mw}x${mh}px`);
  }

  if (s.kind === 'before') {
    const L = s.lines ?? [];
    html += open(` style="background:${C.before.bg}"`) + tag(s.tag ?? '', true) + `
    <div class="h1" id="${s.id}_h" style="top:350px;color:${C.before.text}">${s.title ?? ''}</div>
    <div class="dull" id="${s.id}_card">
      <p id="${s.id}_p1" style="top:80px">${L[0] ?? ''}</p>
      <p id="${s.id}_p2" style="top:330px" class="m">${L[1] ?? ''}</p>
      <p id="${s.id}_p3" style="top:520px;font-size:56px">${L[2] ?? ''}</p>
    </div>
  </div>`;
    tl.push(fadeIn, tagIn,
      `tl.fromTo('#${s.id}_h',{opacity:0,y:30},{opacity:1,y:0,duration:.5,ease:E},${f2(st + 0.25)});`,
      `tl.fromTo('#${s.id}_card',{opacity:0,y:40},{opacity:1,y:0,duration:.5,ease:E},${f2(st + 0.35)});`,
      `tl.fromTo('#${s.id}_p1',{opacity:0},{opacity:1,duration:.4,ease:'none'},${f2(st + 0.7)});`,
      `tl.fromTo('#${s.id}_p2',{opacity:0},{opacity:1,duration:.4,ease:'none'},${f2(st + 1.4)});`,
      `tl.fromTo('#${s.id}_p3',{opacity:0},{opacity:1,duration:.4,ease:'none'},${f2(st + 2.0)});`);
  }

  if (s.kind === 'cta') {
    html += open() + (T.ornament === 'globe' ? '\n    ' + globe(`g_${s.id}`, 400) : '') + `
    <div class="h1 c" id="${s.id}_a" style="top:760px;font-size:${TY.cta}px">${s.title}</div>
    ${s.button ? `<div class="url" id="${s.id}_u">${s.button}</div>` : ''}
    ${s.credit ? `<div class="sub c" id="${s.id}_c" style="top:1230px;font-size:${TY.credit}px;color:var(--muted)">${s.credit}</div>` : ''}
  </div>`;
    if (T.ornament === 'globe') { spins.push([`g_${s.id}`, st, dur]); tl.push(`tl.fromTo('#g_${s.id}',{opacity:0,scale:.8},{opacity:1,scale:1,duration:.7,ease:EX},${st});`); }
    tl.push(fadeIn,
      `tl.fromTo('#${s.id}_a',{opacity:0,y:50,filter:'blur(14px)'},{opacity:1,y:0,filter:'blur(0px)',duration:.7,ease:EX},${f2(st + 0.35)});`,
      s.button ? `tl.fromTo('#${s.id}_u',{opacity:0,scale:.9},{opacity:1,scale:1,duration:.5,ease:POP},${f2(st + 0.9)});` : '',
      s.credit ? `tl.fromTo('#${s.id}_c',{opacity:0},{opacity:1,duration:.5},${f2(st + 1.4)});` : '');
  }
});

const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)).join(',');
const halo = C.haloRGB ?? hex2rgb(C.accent), dots = C.dotsRGB ?? hex2rgb(C.text);
const dark = (() => { const v = [1, 3, 5].map((i) => parseInt(C.bg.slice(i, i + 2), 16)); return (v[0] * 299 + v[1] * 587 + v[2] * 114) / 1000 < 128; })();
const maskX = `linear-gradient(to right,transparent 0,#000 ${M.featherX}%,#000 ${100 - M.featherX}%,transparent 100%)`;
const maskY = `linear-gradient(to bottom,transparent 0,#000 ${M.featherY}%,#000 ${100 - M.featherY}%,transparent 100%)`;
const spinJS = spins.map(([id, at, d]) => `spin('${id}',${at},${d});`).join('\n  ');

const css = `
  :root{ --bg:${C.bg}; --surface:${C.surface}; --text:${C.text}; --text2:${C.text2}; --muted:${C.muted}; --accent:${C.accent}; --on-accent:${C.onAccent};
    --head:${T.font.head}; --body:${T.font.body}; --mono:${T.font.mono}; }
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{margin:0;width:${canvas.w}px;height:${canvas.h}px;overflow:hidden;background:var(--bg)}
  #root{position:relative;width:${canvas.w}px;height:${canvas.h}px;overflow:hidden;background:var(--bg);color:var(--text);font-family:var(--body)}
  #bg{position:absolute;inset:0;pointer-events:none}
  #halo{position:absolute;left:-200px;top:-120px;width:1480px;height:1480px;border-radius:50%;background:radial-gradient(closest-side,rgba(${halo},${dark ? '.18' : '.12'}),rgba(${halo},.05) 55%,transparent 72%)}
  #halo2{position:absolute;left:380px;top:1000px;width:1100px;height:1100px;border-radius:50%;background:radial-gradient(closest-side,rgba(${halo},.07),transparent 70%)}
  #dots{position:absolute;inset:0;background-image:radial-gradient(rgba(${dots},${dark ? '.14' : '.10'}) 1.6px,transparent 2px);background-size:54px 54px;-webkit-mask-image:radial-gradient(ellipse at 50% 40%,#000 20%,transparent 75%);mask-image:radial-gradient(ellipse at 50% 40%,#000 20%,transparent 75%)}
  .scene{position:absolute;left:0;top:0;width:${canvas.w}px;height:${canvas.h}px}
  .tag{position:absolute;left:${T.safe.side}px;width:${A.width}px;top:${A.tagTop}px;height:${A.tagHeight}px;display:flex;align-items:center;justify-content:flex-start;direction:${T.dir};font:600 ${TY.tag}px/1 var(--body);color:var(--accent);gap:18px;white-space:nowrap}
  .tag i{display:inline-block;width:18px;height:18px;border-radius:50%;background:var(--accent);box-shadow:0 0 24px var(--accent)}
  .tag.gray{color:var(--muted)} .tag.gray i{background:var(--muted);box-shadow:none}
  .h1{position:absolute;left:${T.safe.side}px;width:${A.width}px;white-space:nowrap;font:800 ${TY.title}px/1.12 var(--head);color:var(--text);direction:${T.dir};text-align:start}
  .h1 em{font-style:normal;color:var(--accent)}
  .h1:not(.c){padding-inline-start:20px}
  .c{text-align:center !important}
  .sub{position:absolute;left:${T.safe.side}px;width:${A.width}px;font:500 ${TY.sub}px/1.35 var(--body);color:var(--text2);direction:${T.dir};text-align:start}
  .media{position:absolute;overflow:hidden;-webkit-mask-image:${maskX},${maskY};-webkit-mask-composite:source-in;mask-image:${maskX},${maskY};mask-composite:intersect}
  .media video,.media img{position:absolute !important;left:0 !important;top:0 !important;width:100% !important;height:100% !important;object-fit:fill}
  .dull{position:absolute;left:${T.safe.side}px;top:520px;width:${A.width}px;height:760px;border-radius:36px;background:${C.before.card};border:2px solid rgba(${dots},.08)}
  .dull p{position:absolute;right:56px;left:56px;font:500 ${TY.beforeText}px/1.4 var(--body);color:${C.before.text};direction:${T.dir};text-align:start}
  .dull p.m{font:500 ${TY.beforeNum}px/1 var(--mono);color:${C.before.num};direction:ltr;text-align:left}
  .url{position:absolute;left:210px;width:660px;top:1010px;height:120px;border-radius:60px;border:3px solid var(--accent);background:rgba(${halo},.10);display:flex;align-items:center;justify-content:center;font:600 ${TY.button}px/1 var(--body);color:var(--accent);direction:${T.dir}}
  .stack{position:absolute;left:${T.safe.side}px;width:${A.width}px;display:flex;flex-direction:column;align-items:center;gap:28px}
  .stack .h1,.stack .sub{position:static;width:100%}
  .stack .sub{line-height:1.3}
  canvas.globe{position:absolute}`;

const out = `<!doctype html>
<html lang="${T.lang}" data-resolution="portrait">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=${canvas.w}, height=${canvas.h}" />
<script src="assets/gsap.min.js"></script>
<style id="brand-fonts">
/*FONTS:START*//*FONTS:END*/
</style>
<style>${css}
</style>
</head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-duration="${DUR}" data-width="${canvas.w}" data-height="${canvas.h}">
  <div id="bg" class="clip" data-start="0" data-duration="${DUR}" data-track-index="0"><div id="halo"></div><div id="halo2"></div><div id="dots"></div></div>
${html}
  <div id="fade" class="clip" data-start="${f2(DUR - 0.6)}" data-duration="0.6" data-track-index="30" style="position:absolute;inset:0;background:${dark ? '#000' : C.bg};opacity:0"></div>
</div>
<script>
  window.__timelines = window.__timelines || {};
  const tl = gsap.timeline({ paused: true });
  const E = '${M.ease}', EX = '${M.easeStrong}', POP = '${M.easePop}';
  function drawGlobe(id, rot){
    const c = document.getElementById(id), x = c.getContext('2d'), S = c.width, R = S * 0.40, cx = S/2, cy = S/2;
    x.clearRect(0,0,S,S);
    for (let i=-7;i<=7;i++){
      const phi = i/8*Math.PI/2, ring = Math.cos(phi), n = Math.max(5, Math.round(30*ring));
      for (let k=0;k<n;k++){
        const th = k/n*Math.PI*2 + rot + (i%2?0.12:0);
        const px = R*ring*Math.sin(th), py = R*Math.sin(phi), pz = R*ring*Math.cos(th), d = (pz/R+1)/2;
        x.globalAlpha = 0.18 + 0.82*d; x.fillStyle = '${C.accent}';
        x.beginPath(); x.arc(cx+px, cy-py, 2.2 + 3.2*d, 0, Math.PI*2); x.fill();
      }
    }
    x.globalAlpha = 1;
  }
  const spin = (id, at, dur) => { const o={r:0}; drawGlobe(id,0); tl.to(o,{r:Math.PI*1.4,duration:dur,ease:'none',onUpdate:()=>drawGlobe(id,o.r)},at); };
  tl.fromTo('#halo',{x:0,y:0},{x:90,y:60,duration:${DUR},ease:'none'},0);
  tl.fromTo('#halo2',{x:0,y:0},{x:-80,y:-60,duration:${DUR},ease:'none'},0);
  ${spinJS}
  ${tl.filter(Boolean).join('\n  ')}
  tl.to('#fade',{opacity:1,duration:.5,ease:'none'},${f2(DUR - 0.5)});
  window.__timelines["main"] = tl;
  tl.seek(0);
</script>
</body>
</html>
`;
fs.mkdirSync('graphics', { recursive: true });
fs.writeFileSync('graphics/index.html', out);

// الغلاف: من أول مشهد عنوان
const first = S.scenes.find((x) => x.kind === 'title') ?? S.scenes[0];
const thumb = `<!doctype html>
<html lang="${T.lang}"><head><meta charset="UTF-8" />
<style id="brand-fonts">
/*FONTS:START*//*FONTS:END*/
</style>
<style>${css}
  html,body{background:${C.bg}} body{position:relative}
  .t{position:absolute;left:${T.safe.side}px;width:${A.width}px;direction:${T.dir};text-align:center;white-space:nowrap}
</style></head>
<body>
<div id="bg"><div id="halo"></div><div id="halo2"></div><div id="dots"></div></div>
${T.ornament === 'globe' ? globe('g', 560).replace('top:330px', 'top:300px') : ''}
<div class="t" id="a" style="top:880px;font:800 170px/1.1 var(--head);color:var(--text)">${(first.title ?? '').replace(/<em>/g, '<span style="color:var(--accent)">').replace(/<\/em>/g, '</span>')}</div>
<div class="t" id="b" style="top:1090px;font:500 ${TY.sub}px/1.3 var(--body);color:var(--text2)">${first.subtitle ?? ''}</div>
<script>
  const c=document.getElementById('g');if(c){const x=c.getContext('2d'),S=c.width,R=S*0.40,cx=S/2,cy=S/2,rot=0.5;
  for(let i=-7;i<=7;i++){const phi=i/8*Math.PI/2,ring=Math.cos(phi),n=Math.max(5,Math.round(30*ring));
    for(let k=0;k<n;k++){const th=k/n*Math.PI*2+rot+(i%2?0.12:0);const px=R*ring*Math.sin(th),py=R*Math.sin(phi),pz=R*ring*Math.cos(th),d=(pz/R+1)/2;
      x.globalAlpha=0.18+0.82*d;x.fillStyle='${C.accent}';x.beginPath();x.arc(cx+px,cy-py,2.4+3.4*d,0,Math.PI*2);x.fill();}}}
</script>
</body></html>
`;
fs.writeFileSync('graphics/thumbnail.html', thumb);
console.log(`✔ graphics/index.html — ${S.scenes.length} مشهد، ${DUR} ثانية  (+ thumbnail.html)`);
