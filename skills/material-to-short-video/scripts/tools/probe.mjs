// يقيس أبعاد عناصر في صفحة بعرض جوال: node tools/probe.mjs <صفحة> '<selector1>' '<selector2>' ...
// يعرض لكل عنصر (كل المطابقات): الارتفاع والعرض والموضع العلوي بالبكسل المنطقي (390 عرض الشاشة)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const [page, ...sels] = process.argv.slice(2);
const BASE = process.env.BASE ?? 'http://localhost:5173';
const edge = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
const port = 9400 + Math.floor(Math.random() * 300);
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'probe-'));
const proc = spawn(edge, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws;
for (let i = 0; i < 60 && !ws; i++) { try { const l = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); const p = l.find((t) => t.type === 'page'); if (p) ws = p.webSocketDebuggerUrl; } catch {} await sleep(250); }
const sock = new WebSocket(ws); await new Promise((r) => (sock.onopen = r));
let id = 0; const cb = new Map();
sock.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && cb.has(d.id)) { cb.get(d.id)(d); cb.delete(d.id); } };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; cb.set(i, r); sock.send(JSON.stringify({ id: i, method, params })); });
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: +(process.env.WIDTH ?? 390), height: 844, deviceScaleFactor: 1, mobile: true });
await send('Page.addScriptToEvaluateOnNewDocument', { source: `try{localStorage.setItem('theme','dark');localStorage.setItem('lang','ar')}catch(e){}` });
await send('Page.navigate', { url: `${BASE}/${page}` });
await sleep(4000);
const expr = `(()=>{const out=[];for(const s of ${JSON.stringify(sels)}){document.querySelectorAll(s).forEach((e,i)=>{const r=e.getBoundingClientRect();out.push(s+' ['+i+'] h='+Math.round(r.height)+' w='+Math.round(r.width)+' top='+Math.round(r.top+scrollY))})}
  const fx=[...document.querySelectorAll('*')].filter(e=>{const p=getComputedStyle(e).position;return p==='fixed'||p==='sticky'}).map(e=>e.tagName.toLowerCase()+(e.id?'#'+e.id:'')+(e.className&&typeof e.className==='string'?'.'+e.className.trim().split(/\\s+/).join('.'):'')+' '+getComputedStyle(e).position);
  return out.join('\\n')+'\\n-- ثابت/لاصق --\\n'+fx.join('\\n')})()`;
const r = await send('Runtime.evaluate', { expression: process.env.EVAL ?? expr, returnByValue: true });
console.log(r.result?.result?.value ?? JSON.stringify(r));
sock.close(); proc.kill(); process.exit(0);
