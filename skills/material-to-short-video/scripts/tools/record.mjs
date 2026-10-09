#!/usr/bin/env node
// مسجّل شاشة محلي بلا تثبيت: Edge/Chrome بدون واجهة + بروتوكول DevTools (WebSocket المدمج في Node).
// يضبط عرض/ارتفاع الشاشة المنطقي لكل أداة بحيث تظهر الأداة كاملة (بدون قص) ثم يلتقط بسرعة الموقع الطبيعية.
// الاستخدام: node tools/record.mjs <سيناريو[,سيناريو]|all> [--base http://localhost:5173]
import { spawn, execFileSync } from 'node:child_process';
import { promises as fs, existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { scenarios } from './scenarios.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const BASE = opt('--base', 'http://localhost:5173');
const want = argv.find((a, i) => !a.startsWith('--') && argv[i - 1] !== '--base') ?? 'all';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const exe = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);
if (!exe) throw new Error('لا يوجد Edge أو Chrome');

async function launch(port, dpr) {
  const prof = await fs.mkdtemp(path.join(os.tmpdir(), 'rec-'));
  const p = spawn(exe, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--hide-scrollbars', '--mute-audio', `--force-device-scale-factor=${dpr}`,
    '--window-size=700,1500', '--no-first-run', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', 'about:blank'], { stdio: 'ignore' });
  for (let i = 0; i < 60; i++) {
    try { const l = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); const pg = l.find((t) => t.type === 'page'); if (pg) return { proc: p, ws: pg.webSocketDebuggerUrl, prof }; } catch {}
    await sleep(250);
  }
  throw new Error('تعذّر تشغيل المتصفح');
}

class CDP {
  constructor(url) { this.ws = new WebSocket(url); this.id = 0; this.cb = new Map(); this.ev = new Map(); }
  open() {
    return new Promise((res, rej) => {
      this.ws.onopen = res; this.ws.onerror = rej;
      this.ws.onmessage = (m) => {
        const d = JSON.parse(m.data);
        if (d.id && this.cb.has(d.id)) { const { ok, ko } = this.cb.get(d.id); this.cb.delete(d.id); d.error ? ko(new Error(d.error.message)) : ok(d.result); }
        else if (d.method) (this.ev.get(d.method) ?? []).forEach((f) => f(d.params));
      };
    });
  }
  send(method, params = {}) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method, params })); return new Promise((ok, ko) => this.cb.set(id, { ok, ko })); }
  on(m, f) { this.ev.set(m, [...(this.ev.get(m) ?? []), f]); }
  async eval(expr) {
    const r = await this.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error('JS: ' + (r.exceptionDetails.exception?.description ?? r.exceptionDetails.text));
    return r.result.value;
  }
}

function tools(cdp, state, sc) {
  const q = (s) => JSON.stringify(s);
  // مؤشر ماوس مرئي: سهم أبيض بحدّ داكن + حلقة نعناعية عند الضغط/النقر. يتحرك بتسارع طبيعي.
  const CURSOR_JS = (size, x0, y0) => `(()=>{
    if(window.__c) return 1;
    const size=${size};
    const c=document.createElement('div');c.id='__cur';
    c.style.cssText='position:fixed;left:0;top:0;width:${size}px;height:${size}px;z-index:2147483647;pointer-events:none;will-change:transform';
    c.innerHTML='<div id="__ring" style="position:absolute;left:'+(-size*0.9)+'px;top:'+(-size*0.9)+'px;width:'+(size*1.8)+'px;height:'+(size*1.8)+'px;border-radius:50%;border:'+Math.max(2,size/12)+'px solid #2ee89a;background:rgba(46,232,154,.22);opacity:0;transform:scale(.5)"></div>'
      +'<svg viewBox="0 0 24 24" style="position:absolute;left:0;top:0;width:100%;height:100%;filter:drop-shadow(0 2px 3px rgba(0,0,0,.6))"><path d="M3 2 L3 19 L7.6 14.8 L10.8 22 L14.2 20.5 L11 13.4 L17.5 13 Z" fill="#fff" stroke="#0b1210" stroke-width="1.5" stroke-linejoin="round"/></svg>';
    document.body.appendChild(c);
    const ring=c.querySelector('#__ring');
    const C=window.__c={x:${x0},y:${y0},el:c,ring};
    const put=()=>{c.style.transform='translate('+C.x+'px,'+C.y+'px)'};put();
    const ease=x=>x<.5?4*x*x*x:1-Math.pow(-2*x+2,3)/2;
    C.set=(x,y)=>{C.x=x;C.y=y;put()};
    C.to=(x,y,ms)=>new Promise(r=>{const x1=C.x,y1=C.y,t0=performance.now();(function f(n){const k=Math.min(1,(n-t0)/ms),e=ease(k);C.set(x1+(x-x1)*e,y1+(y-y1)*e);k<1?requestAnimationFrame(f):r(1)})(t0)});
    C.press=()=>{ring.style.transition='none';ring.style.opacity='.95';ring.style.transform='scale(.9)'};
    C.release=()=>{ring.style.transition='opacity .25s, transform .25s';ring.style.opacity='0';ring.style.transform='scale(.5)'};
    C.ripple=()=>new Promise(r=>{ring.style.transition='none';ring.style.opacity='.95';ring.style.transform='scale(.5)';requestAnimationFrame(()=>{ring.style.transition='opacity .45s ease-out, transform .45s ease-out';ring.style.opacity='0';ring.style.transform='scale(1.7)';setTimeout(r,380)})});
    // موضع مقبض المنزلق (يراعي اتجاه الصفحة)
    C.thumb=(el,val)=>{const r=el.getBoundingClientRect(),mn=+el.min||0,mx=+el.max||100;let f=(val-mn)/(mx-mn);if(getComputedStyle(el).direction==='rtl')f=1-f;const tw=22;return{x:r.left+tw/2+f*(r.width-tw),y:r.top+r.height/2}};
    C.center=(el)=>{const r=el.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2}};
    return 1})()`;
  const PICK = `const pick=(s)=>{const m=String(s).match(/^(.*)@(\\d+)$/);return m?document.querySelectorAll(m[1])[+m[2]]:document.querySelector(s)};`;
  const t = {
    sleep,
    state,
    async setViewport(w, h) {
      state.w = w; state.h = h;
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: sc.dpr ?? 2.4, mobile: true });
    },
    async goto(p) {
      const loaded = new Promise((r) => cdp.on('Page.loadEventFired', r));
      await cdp.send('Page.navigate', { url: BASE + '/' + p });
      await Promise.race([loaded, sleep(15000)]);
      await cdp.eval('document.fonts.ready.then(()=>true)');
    },
    // إخفاء الأشرطة الثابتة/اللاصقة (ترويسة الموقع وغيرها) ما عدا ما يحويه الهدف
    hideChrome() {
      return cdp.eval(`(()=>{let n=0;for(const e of document.querySelectorAll('*')){const p=getComputedStyle(e).position;if((p==='fixed'||p==='sticky')&&!e.classList.contains('pc-sticky-viewport')){e.style.display='none';n++}}return n})()`);
    },
    // يضبط الشاشة على ارتفاع الأداة بالضبط (من أول عنصر إلى آخر عنصر) ثم يمرّر إليها
    async focus(fromSel, toSel, pad = 10, padBottom = pad) {
      await t.setViewport(sc.w ?? 390, 1500);
      await sleep(400);
      if (sc.hideChrome !== false) await t.hideChrome();
      await cdp.eval(`window.scrollTo(0,0)`);
      const r = await cdp.eval(`(()=>{${PICK}const a=pick(${q(fromSel)});const b=pick(${q(toSel ?? fromSel)});if(!a||!b)throw new Error('لا عنصر: '+${q(fromSel)}+' / '+${q(toSel ?? fromSel)});
        const ra=a.getBoundingClientRect(),rb=b.getBoundingClientRect();return {top:ra.top+scrollY,bottom:rb.bottom+scrollY}})()`);
      let h = Math.ceil(r.bottom - r.top + pad + padBottom);
      let top = r.top;
      // يتكرر القياس لأن تخطيط بعض الأدوات يتغير مع ارتفاع الشاشة
      for (let k = 0; k < 3; k++) {
        await t.setViewport(sc.w ?? 390, h);
        await sleep(500);
        const m = await cdp.eval(`(()=>{${PICK}const a=pick(${q(fromSel)});const b=pick(${q(toSel ?? fromSel)});const ra=a.getBoundingClientRect(),rb=b.getBoundingClientRect();return {top:ra.top+scrollY,bottom:rb.bottom+scrollY}})()`);
        top = m.top;
        const need = Math.ceil(m.bottom - m.top + pad + padBottom);
        if (Math.abs(need - h) <= 2) break;
        h = need;
      }
      await cdp.eval(`document.documentElement.style.scrollBehavior='auto';window.scrollTo(0,${top - pad})`);
      await sleep(500);
      // غطاء بلون الخلفية يخفي ما تحت الأداة (محتوى القسم التالي) ويتبع أسفلها إن تمدّدت
      if (sc.cover !== false) {
        await cdp.eval(`(()=>{${PICK}const b=pick(${q(toSel ?? fromSel)});const c=document.createElement('div');c.id='__cover';
          Object.assign(c.style,{position:'absolute',left:'0',right:'0',height:'6000px',background:${sc.coverColor ? q(sc.coverColor) : "(()=>{for(const e of [document.body,document.documentElement]){const c=getComputedStyle(e).backgroundColor;if(c&&c!=='rgba(0, 0, 0, 0)'&&c!=='transparent')return c}return '#000'})()"},zIndex:'99999',pointerEvents:'none'});document.body.appendChild(c);
          const upd=()=>{c.style.top=(b.getBoundingClientRect().bottom+scrollY+12)+'px';requestAnimationFrame(upd)};upd();return 1})()`);
      }
      state.focus = { fromSel, toSel: toSel ?? fromSel, pad, cssHeight: h };
    },
    scrollTo(y, ms) {
      return cdp.eval(`new Promise(r=>{const y0=window.scrollY,dy=(${y})-y0,t0=performance.now(),d=${ms};const e=x=>x<.5?4*x*x*x:1-Math.pow(-2*x+2,3)/2;
        (function f(n){const k=Math.min(1,(n-t0)/d);window.scrollTo(0,y0+dy*e(k));k<1?requestAnimationFrame(f):r(1)})(t0)})`);
    },
    async scrollToEl(sel, ms, offset = 80) {
      const y = await cdp.eval(`(()=>{${PICK}const e=pick(${q(sel)});if(!e)throw new Error('لا عنصر: '+${q(sel)});return Math.max(0,e.getBoundingClientRect().top+scrollY-${offset})})()`);
      return t.scrollTo(y, ms);
    },
    // يُظهر مؤشر الماوس (حجمه ≈46px على الفيديو النهائي مهما كان مقياس الأداة)
    async cursorOn(startX, startY) {
      const s = Math.min(840 / state.w, 1180 / state.h);
      const size = Math.max(18, Math.round(46 / s));
      state.cursor = true;
      await cdp.eval(CURSOR_JS(size, startX ?? state.w + 60, startY ?? Math.round(state.h * 0.85)));
    },
    // تحريك منزلق: المؤشر يذهب إلى المقبض، يضغط، يسحبه مع القيمة، ثم يترك.
    // slide('#range', '', 80, 700) ← المنزلق نفسه بمحدّده | slide('.card@1','r',5,700) ← داخل أداة، بخاصية data-r="r"
    slide(scope, key, to, ms) {
      const cur = state.cursor;
      return cdp.eval(`(async()=>{${PICK}const root=pick(${q(scope)});const el=${key ? `root?.querySelector('input[data-r="${key}"]')` : 'root'};
        if(!el)throw new Error('لا منزلق: '+${q(scope)}+' '+${q(key)});const C=window.__c,cur=${cur ? 'true' : 'false'};
        const v0=+el.value,dv=(${to})-v0,d=${ms};const e=x=>x<.5?2*x*x:1-Math.pow(-2*x+2,2)/2;
        if(cur&&C){const p=C.thumb(el,v0);await C.to(p.x,p.y,340);C.press();await new Promise(r=>setTimeout(r,90));}
        await new Promise(r=>{const t0=performance.now();(function f(n){const k=Math.min(1,(n-t0)/d);el.value=v0+dv*e(k);el.dispatchEvent(new Event('input',{bubbles:true}));
          if(cur&&C){const p=C.thumb(el,+el.value);C.set(p.x,p.y)}k<1?requestAnimationFrame(f):r(1)})(t0)});
        if(cur&&C){C.release();await new Promise(r=>setTimeout(r,120));}return 1})()`);
    },
    // نقر: المؤشر يتحرك إلى مركز العنصر ثم يضغط (حلقة) ثم يُنفَّذ النقر
    click(sel, idx = 0) {
      const cur = state.cursor;
      return cdp.eval(`(async()=>{${PICK}const m=String(${q(sel)}).match(/^(.*)@(\\d+)\\s+(.*)$/);const e=m?document.querySelectorAll(m[1])[+m[2]]?.querySelectorAll(m[3])[${idx}]:document.querySelectorAll(${q(sel)})[${idx}];
        if(!e)throw new Error('لا عنصر: '+${q(sel)}+'['+${idx}+']');const C=window.__c;
        if(${cur ? 'true' : 'false'}&&C){const p=C.center(e);await C.to(p.x,p.y,340);C.ripple();await new Promise(r=>setTimeout(r,130));e.click()}else e.click();return 1})()`);
    },
    // يضبط قيمة حقل/قائمة داخل أداة ويُطلق input+change (المؤشر ينقر الحقل أولًا)
    setValue(scope, sel, value) {
      const cur = state.cursor;
      return cdp.eval(`(async()=>{${PICK}const root=pick(${q(scope)});const e=root.querySelector(${q(sel)});if(!e)throw new Error('لا حقل: '+${q(sel)});const C=window.__c;
        if(${cur ? 'true' : 'false'}&&C){const p=C.center(e);await C.to(p.x,p.y,340);C.ripple();await new Promise(r=>setTimeout(r,140));e.value=${q(String(value))};e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))}
        else{e.value=${q(String(value))};e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))}return e.value})()`);
    },
    eval: (x) => cdp.eval(x),
  };
  return t;
}

async function recordOne(name, sc) {
  const port = 9300 + Math.floor(Math.random() * 500);
  const dpr = sc.dpr ?? 2.4;
  const b = await launch(port, dpr);
  const cdp = new CDP(b.ws); await cdp.open();
  const frames = []; let rec = false;
  cdp.on('Page.screencastFrame', (p) => {
    if (rec) frames.push({ ts: p.metadata.timestamp, data: p.data });
    cdp.send('Page.screencastFrameAck', { sessionId: p.sessionId }).catch(() => {});
  });
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true });
  // سكربت اختياري يُنفَّذ قبل كل صفحة (مثل ضبط سمة/لغة الموقع): sc.init = "localStorage.setItem('theme','dark')"
  if (sc.init) await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `try{${sc.init}}catch(e){}` });
  const state = { w: sc.w ?? 390, h: sc.h ?? 844 };
  const T = tools(cdp, state, sc);
  await T.setViewport(state.w, state.h);
  await sc.setup(T);
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: Math.ceil(state.w * dpr), maxHeight: Math.ceil(state.h * dpr), everyNthFrame: 1 });
  await sleep(300); rec = true;
  await sc.run(T);
  await sleep(sc.tail ?? 300);
  rec = false; const endTs = Date.now() / 1000;
  await cdp.send('Page.stopScreencast').catch(() => {});
  cdp.ws.close(); b.proc.kill();

  if (frames.length < 2) throw new Error('لم تُلتقط إطارات كافية: ' + frames.length);
  const dir = path.join(ROOT, 'work', 'frames', name);
  await fs.rm(dir, { recursive: true, force: true }); await fs.mkdir(dir, { recursive: true });
  const list = [];
  for (const [i, f] of frames.entries()) {
    const fn = `f${String(i).padStart(5, '0')}.jpg`;
    await fs.writeFile(path.join(dir, fn), Buffer.from(f.data, 'base64'));
    const dur = i < frames.length - 1 ? frames[i + 1].ts - f.ts : Math.max(endTs - f.ts, 0.1);
    list.push(`file '${fn}'`, `duration ${Math.max(dur, 0.001).toFixed(4)}`);
  }
  list.push(`file 'f${String(frames.length - 1).padStart(5, '0')}.jpg'`);
  await fs.writeFile(path.join(dir, 'list.txt'), list.join('\n'));
  const total = Math.max(endTs, frames[frames.length - 1].ts) - frames[0].ts;
  await fs.mkdir(path.join(ROOT, 'raw'), { recursive: true });
  const out = path.join(ROOT, 'raw', `${name}.mp4`);
  // أبعاد زوجية لـ libx264
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', path.join(dir, 'list.txt'),
    '-vf', 'fps=30,scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p', '-c:v', 'libx264', '-preset', 'fast', '-crf', '15', '-threads', '0', '-movflags', '+faststart', out]);
  await fs.rm(dir, { recursive: true, force: true });
  await fs.rm(b.prof, { recursive: true, force: true }).catch(() => {});
  const fps = (frames.length / total).toFixed(1);
  const meta = { name, seconds: +total.toFixed(2), cssWidth: state.w, cssHeight: state.h, dpr, captureFps: +fps, note: sc.note, focus: state.focus };
  await fs.writeFile(path.join(ROOT, 'raw', `${name}.meta.json`), JSON.stringify(meta, null, 2));
  console.log(`✔ ${name}: ${total.toFixed(1)}s | ${state.w}x${state.h} css @${dpr}x | ${frames.length} إطار (~${fps}/ث) → raw/${name}.mp4`);
  return meta;
}

const names = want === 'all' ? Object.keys(scenarios) : want.split(',');
const results = [];
for (const n of names) {
  if (!scenarios[n]) { console.error('سيناريو غير معروف:', n, '— المتاح:', Object.keys(scenarios).join(', ')); process.exit(1); }
  console.log(`▶ تسجيل ${n} ...`);
  try { results.push(await recordOne(n, scenarios[n])); } catch (e) { console.error(`✖ ${n}: ${e.message}`); }
}
await fs.writeFile(path.join(ROOT, 'work', 'record-last.json'), JSON.stringify(results, null, 2));
process.exit(0);
