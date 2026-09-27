// 抓「方块正在下落」的定格画面。
//
// 为什么要专门写一个：前面的截图脚本等到方块快落地时才拍，那一刻方块已经判定完毕、
// 正在收缩消失，画面里几乎看不到方块。这里在开局后等固定的 fallMs 的一小部分就拍，
// 此时方块正铺在四条道上，能看清形态与纵深。
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
  await page.waitForTimeout(900);
  await clickWhenReady(/单人试练|立即开始/);
  await page.waitForFunction(async () => {
    const d = await (await fetch('/api/arena/rhythm')).json();
    return d.phase === 'running' && !!d.chart;
  }, { timeout: 30000 }).catch(() => {});

  // 开局后连拍 4 张。倒计时遮罩会盖住轨道，而开局瞬间方块尚未铺开，
  // 单张很容易拍到「倒计时」或「空场」；连拍再挑，比反复调试等待时长可靠。
  for (const [index, wait] of [900, 1500, 2100, 2700].entries()) {
    await page.waitForTimeout(index === 0 ? wait : 600);
    const info = await page.evaluate(() => {
      const canvas = document.querySelector('.rn-stage canvas');
      const field = document.querySelector('.rn-field');
      const f = field?.getBoundingClientRect();
      const judge = document.querySelector('.rn-judge-line')?.getBoundingClientRect();
      return {
        notes: Number(canvas?.dataset.notes || 0),
        lanes: Number(canvas?.dataset.lanes || 0),
        canvas: canvas ? `${canvas.clientWidth}x${canvas.clientHeight}` : 'none',
        fieldHeight: f ? Math.round(f.height) : 0,
        // CSS 判定线相对轨道顶部的比例，应约等于 0.86
        judgeRatioActual: f && judge ? Math.round((judge.top - f.top) / f.height * 1000) / 1000 : null,
        // 三维场景里判定线与轨道远端的实际投影比例：judgeScene 应≈0.86（与 CSS 线重合）、
        // farScene 应接近 0（远端贴着容器顶部，纵深完整）。
        judgeScene: Number(canvas?.dataset.judgeRatio || NaN),
        farScene: Number(canvas?.dataset.farRatio || NaN),
        countdown: !!document.querySelector('.rn-countdown'),
        overflow: Math.round(document.documentElement.scrollHeight - window.innerHeight),
      };
    });
    const shot = `${OUT}/70-drop-${index}-${viewport.width}x${viewport.height}.png`;
    await page.screenshot({ path: shot, fullPage: true });
    console.log(`frame ${index} @${wait}ms`, JSON.stringify(info));
  }
  await context.close();
  break;
}
console.log('errors:', errors.length ? errors.slice(0, 5) : 'none');
await browser.close();
