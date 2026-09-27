// 诊断：开局后 0~8 秒内 DOM 里到底有几个下落方块、notes 数据有没有下发。
// 用户反馈「开始了没看到卡片掉落」，这里按里程碑逐秒采样。
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:3113';
const OUT = 'output/rhythm-verify';
fs.mkdirSync(OUT, { recursive: true });

async function getCookie() {
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'student_db52e21b6c37', password: 'test1234' }),
  });
  if (login.ok) return (login.headers.getSetCookie?.() || []).map(c => c.split(';')[0]).join('; ');
  console.log('login failed', login.status, await login.text());
  return null;
}
const cookie = await getCookie();
if (!cookie) process.exit(0);

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

// 开局后逐秒采样。0 秒定义为「服务端第一次进入 running」。
const samples = await page.evaluate(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const out = [];
  const t0 = Date.now();
  let started = 0;
  for (let i = 0; i < 90; i++) {
    let d = null;
    try { d = await (await fetch('/api/arena/rhythm')).json(); } catch {}
    if (d?.phase === 'running' && !started) { started = Date.now(); }
    const canvas = document.querySelector('.rn-stage canvas');
    const dom = {
      // 方块改由 three.js 画在 canvas 上，DOM 里不再有 .rn-note；
      // 组件把渲染统计写在 canvas.dataset 上。
      notes: Number(canvas?.dataset.notes || 0),
      idle: !!document.querySelector('.rn-idle'),
      lanes: Number(canvas?.dataset.lanes || 0),
      field: !!document.querySelector('.rn-field'),
      headers: [...document.querySelectorAll('.rn-lane-head > span')].map(e => e.innerText.replace(/\n/g, '/')),
    };
    out.push({
      t: started ? Math.round((Date.now() - started) / 100) / 10 : -1,
      phase: d?.phase,
      elapsed: d?.elapsed,
      payloadNotes: d?.chart?.notes?.length ?? null,
      totalNotes: d?.chart?.totalNotes ?? null,
      fallMs: d?.chart?.fallMs ?? null,
      ...dom,
    });
    if (started && Date.now() - started > 8000) break;
    await sleep(300);
  }
  return out;
});

console.log('t(s)  phase    elapsed  payload  dom');
for (const s of samples) {
  if (s.t === -1) { console.log(`wait  ${s.phase ?? '-'}`); continue; }
  console.log(`${String(s.t).padStart(4)}  ${String(s.phase).padEnd(8)} ${String(s.elapsed).padStart(6)}  ${String(s.payloadNotes).padStart(5)}  ${String(s.notes).padStart(3)}`);
}
console.log('lane headers:', JSON.stringify(samples.at(-1)?.headers || []));
console.log('lanes rendered:', samples.at(-1)?.lanes, 'field:', samples.at(-1)?.field, 'idle:', samples.at(-1)?.idle);
console.log('errors:', errs.length ? errs.slice(0, 6) : 'none');

await page.screenshot({ path: `${OUT}/50-diag-drop.png`, fullPage: true });
await browser.close();
