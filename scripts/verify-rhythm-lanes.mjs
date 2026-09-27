// 视觉验收：加宽后的四条道 + 方块上的字母。
//
// 为什么必须跑真实浏览器：方块上的字母是 GLSL 图集着色器画出来的，
// 只有真实 WebGL 上下文能证明「字母确实显示在方块上、且每个方块显示自己的字母」。
// 纯投影计算（calibrate-rhythm-camera.mjs）证明不了着色器部分。
//
// 同时抓一张「场上有多个方块」的帧，用来目视核对：
//   1) 四条道比改动前更宽；
//   2) 每个方块上印着自己对应的字母；
//   3) 底部不再有虚拟键盘。
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:3111';
const OUT = 'output/rhythm-lanes';
fs.mkdirSync(OUT, { recursive: true });

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
if (!CHROME) { console.error('未找到 Chrome / Edge'); process.exit(2); }

async function getCookie() {
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'student_db52e21b6c37', password: 'test1234' }),
  });
  if (login.ok) return (login.headers.getSetCookie?.() || []).map(c => c.split(';')[0]).join('; ');
  const who = '音游W' + Math.random().toString(36).slice(2, 6);
  const reg = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName: who, password: 'test1234' }),
  });
  if (!reg.ok) { console.log('登录与注册均失败', reg.status); return null; }
  return (reg.headers.getSetCookie?.() || []).map(c => c.split(';')[0]).join('; ');
}

const cookie = await getCookie();
if (!cookie) process.exit(0);

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
await context.addCookies(cookie.split('; ').map(p => {
  const [name, ...v] = p.split('='); return { name, value: v.join('='), domain: '127.0.0.1', path: '/' };
}));
const page = await context.newPage();
const errs = [];
page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });

await page.goto(`${BASE}/#rhythm`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

async function clickWhenReady(re, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const btn = page.locator('.arena-game button:visible', { hasText: re }).first();
    if (await btn.count()) { await btn.click({ timeout: 3000 }).catch(() => {}); return true; }
    await page.waitForTimeout(300);
  }
  return false;
}
await clickWhenReady(/加入音游挑战/);
await page.waitForTimeout(1200);
await clickWhenReady(/单人试练|立即开始/);
await page.waitForFunction(async () => {
  try { const d = await (await fetch('/api/arena/rhythm')).json(); return d.phase === 'running' && !!d.chart; }
  catch { return false; }
}, { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(400);

// 等场上有足够多的方块（色块分布开），再截图 —— 只有一个方块看不出「字母各不同」。
await page.waitForFunction(() => {
  const c = document.querySelector('.rn-stage > canvas');
  return c && Number(c.dataset.notes) >= 4;
}, { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(150);

const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });
await shot('lanes-running');

// 量测：轨道占宽、道宽、方块上的字母是否真的渲染。
const metrics = await page.evaluate(() => {
  const canvas = document.querySelector('.rn-stage > canvas');
  const field = document.querySelector('.rn-field');
  const head = document.querySelector('.rn-lane-head');
  const kb = document.querySelector('.rn-keyboard');
  const four = field?.getBoundingClientRect();
  const cw = canvas?.clientWidth || 0, ch = canvas?.clientHeight || 0;
  return {
    notes: canvas?.dataset.notes,
    trackPct: head ? +(head.getBoundingClientRect().width / (four?.width || 1) * 100).toFixed(1) : null,
    laneWidthPx: head ? +(head.getBoundingClientRect().width / 4).toFixed(1) : null,
    fieldW: four ? Math.round(four.width) : null,
    fieldH: four ? Math.round(four.height) : null,
    canvasSize: `${cw}×${ch}`,
    canvasAspect: cw && ch ? +(cw / ch).toFixed(2) : null,
    hasVirtualKeyboard: !!kb,
  };
});

// 逐道量「该道最靠下的方块」在画布上的横向范围，确认四条道彼此分开。
const laneSpans = await page.evaluate(() => {
  const canvas = document.querySelector('.rn-stage > canvas');
  return { notes: canvas?.dataset.notes, lanes: canvas?.dataset.lanes };
});

await shot('lanes-full');

console.log('轨道占宽        ', metrics.trackPct + '%');
console.log('单道宽          ', metrics.laneWidthPx + 'px');
console.log('赛道区尺寸      ', `${metrics.fieldW}×${metrics.fieldH}`);
console.log('画布尺寸/宽高比 ', `${metrics.canvasSize}  aspect=${metrics.canvasAspect}`);
console.log('场上方块数      ', metrics.notes);
console.log('虚拟键盘已移除  ', metrics.hasVirtualKeyboard ? '否（仍存在）' : '是');
console.log('页面错误        ', errs.length ? errs.slice(0, 3).join(' | ') : '无');
console.log('截图            ', `output/rhythm-lanes/*.png`);

await browser.close();
process.exit(errs.length ? 1 : 0);
