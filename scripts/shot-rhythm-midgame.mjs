// 截图：音游进行中的画面（新视觉：更密的下落场 + 键位提示 + 紧急字母高亮）。
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:3111';
const OUT = 'output/rhythm-verify';
fs.mkdirSync(OUT, { recursive: true });

const login = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'student_db52e21b6c37', password: 'test1234' }),
});
if (!login.ok) { console.log('登录失败', login.status, await login.text()); process.exit(0); }
const cookie = (login.headers.getSetCookie?.() || []).map(c => c.split(';')[0]).join('; ');

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.addCookies(cookie.split('; ').map(p => {
  const [name, ...v] = p.split('='); return { name, value: v.join('='), domain: '127.0.0.1', path: '/' };
}));
const page = await context.newPage();
const errs = [];
page.on('pageerror', e => errs.push(e.message));
await page.goto(`${BASE}/#rhythm`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

async function clickWhenReady(re, timeout = 15000) {
  const dl = Date.now() + timeout;
  while (Date.now() < dl) {
    const btn = page.locator('.arena-game button:visible', { hasText: re }).first();
    if (await btn.count()) { await btn.click({ timeout: 3000 }).catch(() => {}); return true; }
    await page.waitForTimeout(300);
  }
  return false;
}
await clickWhenReady(/加入音游挑战/);
await page.waitForTimeout(1500);
await clickWhenReady(/单人试练|立即开始/);
await page.waitForFunction(async () => {
  const d = await (await fetch('/api/arena/rhythm')).json();
  return d.phase === 'running' && !!d.chart;
}, { timeout: 30000 }).catch(() => {});

// 按时间轴打 20 秒，制造真实的中段画面（有连击、有多种判定）。
await page.evaluate(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const getState = async () => (await fetch('/api/arena/rhythm')).json();
  let data = await getState();
  const skew = data.serverNow - Date.now();
  const elapsedNow = () => (Date.now() + skew) - data.startedAt;
  const seen = new Map();
  const stopAt = Date.now() + 20000;
  let guard = 0;
  while (Date.now() < stopAt && data.phase === 'running' && guard++ < 3000) {
    for (const n of data.chart?.notes || []) if (!seen.has(n.id)) seen.set(n.id, { at: n.at, letter: n.letter, done: false });
    const due = [...seen.values()].filter(n => !n.done && n.at <= elapsedNow() + 4).sort((a, b) => a.at - b.at);
    if (due.length) {
      for (const n of due) {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: n.letter.toLowerCase(), bubbles: true }));
        n.done = true;
      }
      await sleep(8);
    } else {
      const next = [...seen.values()].filter(n => !n.done).reduce((m, n) => Math.min(m, n.at), Infinity);
      const wait = Number.isFinite(next) ? Math.min(40, Math.max(4, next - elapsedNow())) : 40;
      await sleep(wait);
    }
    if (guard % 12 === 0) data = await getState();
  }
});
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/40-midgame.png`, fullPage: true });

const info = await page.evaluate(() => ({
  // 方块由 three.js 画在 canvas 上，DOM 里没有 .rn-note；
  // 组件把渲染统计写在 canvas 的 dataset 上（见 RhythmBoard.vue 的 tick）。
  notesOnScreen: Number(document.querySelector('.rn-stage canvas')?.dataset.notes || 0),
  lanes: Number(document.querySelector('.rn-stage canvas')?.dataset.lanes || 0),
  laneHeaders: [...document.querySelectorAll('.rn-lane-head > span')].map(e => e.innerText.replace(/\n/g, ':')),
  keyboardKeys: document.querySelectorAll('.rn-key').length,
  liveKeys: document.querySelectorAll('.rn-key.is-live').length,
  urgent: document.querySelector('.rn-key.is-urgent')?.textContent || '(none)',
  hits: [...document.querySelectorAll('.rn-hit')].map(e => e.innerText.replace(/\n/g, ':')),
  combo: document.querySelector('.rn-stat.is-combo strong')?.textContent || '',
  score: document.querySelector('.rn-stat.is-score strong')?.textContent || '',
  legend: document.querySelector('.rn-legend')?.innerText.replace(/\n/g, ' | ') || '',
}));
console.log(JSON.stringify(info, null, 2));
console.log('errors:', errs.length ? errs.slice(0, 4) : 'none');
await browser.close();
