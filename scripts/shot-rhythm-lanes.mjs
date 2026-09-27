// 截取「四道方块正在下落」的静止画面：加入后按时间轴把方块留在空中（不按键，让方块自然落到判定线）。
// 目的：确认四条道里方块的形态、纵深排布与判定线关系，以及整页一屏不溢出。
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
const errors = [];
for (const viewport of [{ width: 1440, height: 900 }, { width: 1920, height: 1080 }, { width: 1366, height: 768 }]) {
  const context = await browser.newContext({ viewport });
  await context.addCookies(cookie.split('; ').map(p => {
    const [name, ...v] = p.split('='); return { name, value: v.join('='), domain: '127.0.0.1', path: '/' };
  }));
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(`${viewport.width}x${viewport.height}: ${e.message}`));
  await page.goto(`${BASE}/#rhythm`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  async function clickWhenReady(re, timeout = 15000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const btn = page.locator('.arena-game button:visible', { hasText: re }).first();
      if (await btn.count()) { await btn.click({ timeout: 3000 }).catch(() => {}); return true; }
      await page.waitForTimeout(250);
    }
    return false;
  }
  await clickWhenReady(/加入音游挑战/);
  await page.waitForTimeout(1000);
  await clickWhenReady(/单人试练|立即开始/);
  await page.waitForFunction(async () => {
    const d = await (await fetch('/api/arena/rhythm')).json();
    return d.phase === 'running' && !!d.chart;
  }, { timeout: 30000 }).catch(() => {});

  // 完全不按键，等方块铺满整条轨道（fallMs 2.6s，等 2.2s 让首屏方块接近判定线）。
  await page.waitForTimeout(2200);
  // 再等一帧让 canvas.dataset 写入当前帧统计。
  await page.waitForTimeout(120);
  const shot = `${OUT}/60-lanes-${viewport.width}x${viewport.height}.png`;
  await page.screenshot({ path: shot, fullPage: true });

  const info = await page.evaluate(() => {
    const canvas = document.querySelector('.rn-stage canvas');
    const field = document.querySelector('.rn-field');
    const rect = el => el ? el.getBoundingClientRect() : null;
    const f = rect(field);
    return {
      notes: Number(canvas?.dataset.notes || 0),
      lanes: Number(canvas?.dataset.lanes || 0),
      canvasSize: canvas ? `${canvas.clientWidth}x${canvas.clientHeight}` : 'none',
      fieldHeight: f ? Math.round(f.height) : 0,
      overflow: Math.round(document.documentElement.scrollHeight - window.innerHeight),
      sceneBottom: f ? Math.round(f.bottom) : 0,
      innerHeight: window.innerHeight,
    };
  });
  console.log(`${viewport.width}x${viewport.height}`, JSON.stringify(info));
  await context.close();
}
console.log('errors:', errors.length ? errors.slice(0, 5) : 'none');
await browser.close();
