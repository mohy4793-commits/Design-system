#!/usr/bin/env node
// يقيس عرض نص بخطوط المشروع الفعلية (لتفادي كسر العناوين):  node tools/measure.mjs '[["النص",800,96,"h"]]'
// العنصر: [النص, الوزن, الحجم, "h" عناوين | "b" نص | "m" mono]  (+ عنصر خامس اختياري: font-feature-settings)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const items = JSON.parse(process.argv[2] ?? '[]');
const fonts = fs.readFileSync(path.join(ROOT, 'graphics/assets/fonts.css'), 'utf8');
const T = JSON.parse(fs.readFileSync(path.join(ROOT, 'design-tokens.json'), 'utf8').replace(/^\uFEFF/, ''));
const edge = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(fs.existsSync);
if (!edge) throw new Error('لا يوجد Edge أو Chrome');
const port = 9700 + Math.floor(Math.random() * 200), prof = fs.mkdtempSync(path.join(os.tmpdir(), 'meas-'));
const proc = spawn(edge, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws;
for (let i = 0; i < 60 && !ws; i++) { try { const l = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); const p = l.find((t) => t.type === 'page'); if (p) ws = p.webSocketDebuggerUrl; } catch {} await sleep(250); }
const sock = new WebSocket(ws); await new Promise((r) => (sock.onopen = r));
let id = 0; const cb = new Map();
sock.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && cb.has(d.id)) { cb.get(d.id)(d); cb.delete(d.id); } };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; cb.set(i, r); sock.send(JSON.stringify({ id: i, method, params })); });
const stacks = { h: T.font.head, b: T.font.body, m: T.font.mono };
const expr = `(async()=>{
  const st=document.createElement('style');st.textContent=${JSON.stringify(fonts + 'span{position:absolute;white-space:nowrap}')};document.head.appendChild(st);
  document.body.dir=${JSON.stringify(T.dir)};
  const items=${JSON.stringify(items)}, stacks=${JSON.stringify(stacks)};
  await document.fonts.ready;
  for (const [,w,s,f] of items){ try{ await document.fonts.load(w+' '+s+'px '+stacks[f||'h'],'ابجد abc'); }catch(e){} }
  return items.map(([t,w,s,f,ff])=>{const sp=document.createElement('span');sp.style.font=w+' '+s+'px '+stacks[f||'h'];if(ff)sp.style.fontFeatureSettings=ff;sp.textContent=t;document.body.appendChild(sp);
    return t+' @'+s+'px = '+Math.round(sp.getBoundingClientRect().width)+'px'}).join('\\n');
})()`;
const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
console.log(r.result?.result?.value ?? JSON.stringify(r));
sock.close(); proc.kill(); process.exit(0);
