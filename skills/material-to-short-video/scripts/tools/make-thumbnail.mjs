// يصوّر graphics/thumbnail.html (1080x1920) بمتصفح Chromium المحلي → graphics/out/thumbnail.png
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const edge = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(fs.existsSync);
fs.mkdirSync(path.join(root, 'graphics/out'), { recursive: true });
const out = path.join(root, 'graphics/out/thumbnail.png');
execFileSync(edge, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', '--window-size=1080,1920', '--virtual-time-budget=6000',
  `--user-data-dir=${path.join(process.env.TEMP ?? '/tmp', 'edge-thumb' + Date.now())}`, `--screenshot=${out}`, pathToFileURL(path.join(root, 'graphics/thumbnail.html')).href], { stdio: 'ignore' });
console.log('✔', out);
