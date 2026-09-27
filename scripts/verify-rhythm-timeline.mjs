// 逻辑层验证：直接读服务端下发的谱面与 elapsed，在正确时刻按下正确字母。
// DOM 驱动的按法受渲染与轮询抖动影响，这里改用服务端时间轴，验证「按对了确实得分」。
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:3111';
const OUT = 'output/rhythm-verify';
fs.mkdirSync(OUT, { recursive: true });

// 注册接口按 IP 限流（5 次/小时），所以优先用已存在的测试账号登录，失败再注册。
async function getCookie() {
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'student_db52e21b6c37', password: 'test1234' }),
  });
  if (login.ok) return (login.headers.getSetCookie?.() || []).map(c => c.split(';')[0]).join('; ');
  const who = '音游B' + Math.random().toString(36).slice(2, 6);
  const reg = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName: who, password: 'test1234' }),
  });
  if (!reg.ok) { console.log('登录与注册均失败', reg.status, await reg.text()); return null; }
  return (reg.headers.getSetCookie?.() || []).map(c => c.split(';')[0]).join('; ');
}
const cookie = await getCookie();
if (!cookie) process.exit(0);
console.log('session ready');

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.addCookies(cookie.split('; ').map(p => {
  const [name, ...v] = p.split('='); return { name, value: v.join('='), domain: '127.0.0.1', path: '/' };
}));
const page = await context.newPage();
const errs = [];
page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));

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
await page.waitForTimeout(1500);
await clickWhenReady(/单人试练|立即开始/);
// 等真正的 running 阶段（谱面下发）而不是等 DOM，DOM 在 waiting 时没有方块。
await page.waitForFunction(async () => {
  try {
    const r = await fetch('/api/arena/rhythm');
    const d = await r.json();
    return d.phase === 'running' && !!d.chart;
  } catch { return false; }
}, { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(300);

// 在页面里按服务端时间轴精确按键。
// 服务端每次只下发「当前下落窗口内」的音符，所以要边跑边轮询补全谱面，
// 并用服务端 clock 外推本地时间来判断何时该按。
const outcome = await page.evaluate(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const getState = async () => (await fetch('/api/arena/rhythm')).json();
  let data = await getState();
  if (!data.chart) return { error: 'no chart', phase: data.phase };
  // clock 基准：第一次拿到的服务端时间与本地时间之差。
  const skew = data.serverNow - Date.now();
  const elapsedNow = () => (Date.now() + skew) - data.startedAt;
  const seen = new Map();          // id -> { at, letter }
  let pressed = 0, guard = 0;
  while (data.phase === 'running' && guard++ < 4000) {
    for (const n of data.chart?.notes || []) if (!seen.has(n.id)) seen.set(n.id, { at: n.at, letter: n.letter });
    // 找出「即将到达」的音符：还没按过且时间已到。
    const due = [...seen.values()].filter(n => !n.done && n.at <= elapsedNow() + 4).sort((a, b) => a.at - b.at);
    if (due.length) {
      for (const n of due) {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: n.letter.toLowerCase(), bubbles: true }));
        n.done = true; pressed++;
      }
      await sleep(8);
    } else {
      // 等到下一个音符时间点，或 40ms 后重新轮询。
      const next = [...seen.values()].filter(n => !n.done).reduce((m, n) => Math.min(m, n.at), Infinity);
      const wait = Number.isFinite(next) ? Math.min(40, Math.max(4, next - elapsedNow())) : 40;
      await sleep(wait);
    }
    if (guard % 12 === 0) data = await getState();
  }
  await sleep(600);
  return { pressed, totalNotes: data.chart?.totalNotes || 0, phase: data.phase, distinct: seen.size };
});
console.log('dispatch:', JSON.stringify(outcome));
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/30-accurate.png`, fullPage: true });

const info = await page.evaluate(() => ({
  hits: [...document.querySelectorAll('.rn-hit')].map(e => e.innerText.replace(/\n/g, ':')),
  combo: document.querySelector('.rn-stat.is-combo strong')?.textContent || '',
  score: document.querySelector('.rn-stat.is-score strong')?.textContent || '',
  progress: document.querySelector('.rn-progress > i')?.style.width || '',
  legend: document.querySelector('.rn-legend')?.innerText.replace(/\n/g, ' | ') || '',
}));
console.log(JSON.stringify(info, null, 2));
console.log('errors:', errs.length ? errs.slice(0, 6) : 'none');
await browser.close();
