// 抓「方块正在下落」的帧，用来目视核对方块上的字母。
//
// 关键：必须避开开局倒计时遮罩（前 ~3.2s 会盖住轨道中央）。
// 所以在服务端 phase 变 running 之后还要再等 >4s，且此时不按键，让方块自然铺满空中。
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

const login = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'student_db52e21b6c37', password: 'test1234' }),
});
if (!login.ok) { console.log('登录失败', login.status); process.exit(2); }
const cookie = (login.headers.getSetCookie?.() || []).map(c => c.split(';')[0]).join('; ');

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const errors = [];
const report = [];

for (const viewport of [{ width: 1600, height: 1000 }, { width: 1920, height: 1080 }]) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2 });
  await context.addCookies(cookie.split('; ').map(p => {
    const [name, ...v] = p.split('='); return { name, value: v.join('='), domain: '127.0.0.1', path: '/' };
  }));
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(`${viewport.width}: ${e.message}`));
  await page.goto(`${BASE}/#rhythm`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  const click = async (re) => {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      const b = page.locator('.arena-game button:visible', { hasText: re }).first();
      if (await b.count()) { await b.click({ timeout: 3000 }).catch(() => {}); return true; }
      await page.waitForTimeout(250);
    }
    return false;
  };
  await click(/加入音游挑战/);
  await page.waitForTimeout(1000);
  await click(/单人试练|立即开始/);
  await page.waitForFunction(async () => {
    try { const d = await (await fetch('/api/arena/rhythm')).json(); return d.phase === 'running' && !!d.chart; }
    catch { return false; }
  }, { timeout: 30000 }).catch(() => {});

  // 倒计时窗口 ~3.2s。等它消失后立刻抓帧 —— 此时第一块刚落到判定线附近，
  // 空中还有后续几块，是「方块上有字母」最清楚的时刻。
  // 再往后拖，不按的话方块会全部漏掉、场上逐渐变空。
  await page.waitForFunction(() => !document.querySelector('.rn-countdown'), { timeout: 12000 }).catch(() => {});
  // 等到场上确实有方块，并且不要太多（太多会互相遮挡、看不清单个字母）。
  await page.waitForFunction(() => {
    const c = document.querySelector('.rn-stage > canvas');
    const n = Number(c?.dataset.notes || 0);
    return n >= 3 && n <= 10;
  }, { timeout: 12000 }).catch(() => {});
  await page.waitForTimeout(120);

  const shot = `${OUT}/letters-${viewport.width}x${viewport.height}.png`;
  await page.screenshot({ path: shot });
  // 再截一张赛道区局部：只截下半段（判定线以上），放大后能看清方块上的字母。
  const field = page.locator('.rn-field');
  await field.screenshot({ path: `${OUT}/zoom-${viewport.width}x${viewport.height}.png` });

  const info = await page.evaluate(() => {
    const canvas = document.querySelector('.rn-stage canvas');
    const head = document.querySelector('.rn-lane-head');
    const field = document.querySelector('.rn-field');
    const r = el => el ? el.getBoundingClientRect() : null;
    const h = r(head), f = r(field);
    return {
      notes: Number(canvas?.dataset.notes || 0),
      lanes: Number(canvas?.dataset.lanes || 0),
      canvasSize: canvas ? `${canvas.clientWidth}×${canvas.clientHeight}` : 'none',
      trackPct: h && f ? +(h.width / f.width * 100).toFixed(1) : null,
      laneWidthPx: h ? +(h.width / 4).toFixed(1) : null,
      fieldSize: f ? `${Math.round(f.width)}×${Math.round(f.height)}` : null,
      keyboardGone: !document.querySelector('.rn-keyboard'),
      countdownGone: !document.querySelector('.rn-countdown'),
      overflow: Math.round(document.documentElement.scrollHeight - window.innerHeight),
    };
  });
  report.push({ viewport: `${viewport.width}×${viewport.height}`, ...info });
  await context.close();
}

await browser.close();
for (const r of report) {
  console.log(`${r.viewport.padEnd(10)} 方块 ${String(r.notes).padStart(2)} · 道 ${r.lanes} · 画布 ${r.canvasSize} · ` +
    `轨道占宽 ${r.trackPct}% · 单道 ${r.laneWidthPx}px · 赛道区 ${r.fieldSize} · ` +
    `键盘已移除 ${r.keyboardGone ? '是' : '否'} · 倒计时已消失 ${r.countdownGone ? '是' : '否'} · 滚动 ${r.overflow}`);
}
console.log('页面错误：', errors.length ? errors.slice(0, 3).join(' | ') : '无');
console.log('截图：output/rhythm-lanes/');
process.exit(errors.length ? 1 : 0);
