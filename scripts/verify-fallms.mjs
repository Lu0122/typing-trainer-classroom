// 确认前端拿到的是新的下落时长（服务端下发 fallMs=2600），而非旧缓存。
import { chromium } from 'playwright-core';

const BASE = process.env.BASE || 'http://127.0.0.1:3112';
const login = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'student_db52e21b6c37', password: 'test1234' }),
});
const cookie = (login.headers.getSetCookie?.() || []).map(c => c.split(';')[0]).join('; ');
const b = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
});
// 用全新 context，避免复用任何磁盘缓存。
const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.addCookies(cookie.split('; ').map(p => {
  const [name, ...v] = p.split('='); return { name, value: v.join('='), domain: '127.0.0.1', path: '/' };
}));
const p = await ctx.newPage();
await p.goto(`${BASE}/#rhythm`, { waitUntil: 'networkidle' });
await p.waitForTimeout(1500);
async function click(re) {
  const dl = Date.now() + 12000;
  while (Date.now() < dl) {
    const btn = p.locator('.arena-game button:visible', { hasText: re }).first();
    if (await btn.count()) { await btn.click({ timeout: 3000 }).catch(() => {}); return true; }
    await p.waitForTimeout(300);
  }
  return false;
}
await click(/加入音游挑战/);
await p.waitForTimeout(1500);
await click(/单人试练|立即开始/);
await p.waitForFunction(async () => {
  const d = await (await fetch('/api/arena/rhythm')).json();
  return d.phase === 'running' && !!d.chart;
}, { timeout: 30000 }).catch(() => {});
await p.waitForTimeout(1200);

const out = await p.evaluate(async () => {
  const d = await (await fetch('/api/arena/rhythm')).json();
  return {
    serverFallMs: d.chart?.fallMs,
    leadMs: d.chart?.leadMs,
    laneCount: d.chart?.laneCount,
    notesInPayload: d.chart?.notes?.length,
    legend: document.querySelector('.rn-legend')?.innerText.replace(/\n/g, ' | ') || '',
    keyRows: document.querySelectorAll('.rn-key-row').length,
  };
});
console.log(JSON.stringify(out, null, 1));
await b.close();
