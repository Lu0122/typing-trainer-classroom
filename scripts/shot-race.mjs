// 赛车页截图：确认仪表盘 / 档位 / 赛道渲染正确，且整页在 100vh 内。
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:3131';
const OUT = 'output/race-verify';
mkdirSync(OUT, { recursive: true });

// Cookie 的 domain 必须和访问用的主机名一致。BASE 可能是 localhost 也可能是 127.0.0.1，
// 写死 127.0.0.1 会导致用 localhost 打开页面时带不上 cookie（表现为弹登录框）。
const HOST = new URL(BASE).hostname;

const login = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'student_db52e21b6c37', password: 'test1234' }),
});
if (!login.ok) { console.log('登录失败', login.status); process.exit(0); }
const cookie = (login.headers.getSetCookie?.() || []).map(c => c.split(';')[0]).join('; ');

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
});

for (const size of [{ w: 1280, h: 720 }, { w: 1366, h: 768 }, { w: 1440, h: 900 }, { w: 1920, h: 1080 }]) {
  const context = await browser.newContext({ viewport: { width: size.w, height: size.h } });
  await context.addCookies(cookie.split('; ').map(p => {
    const [name, ...v] = p.split('='); return { name, value: v.join('='), domain: HOST, path: '/' };
  }));
  const page = await context.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text()); });

  await page.goto(`${BASE}/#race`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1800);

  // 加入 + 开始。
  // 注意：playwright 的 locator() 只吃标准 CSS，不能写 jQuery 风格的 :visible。
  // 这里直接用按钮类名 + 文案定位，避免"点了但什么都没发生"的假通过。
  const joinBtn = page.getByRole('button', { name: '加入比赛' });
  if (await joinBtn.count()) { await joinBtn.click().catch(() => {}); await page.waitForTimeout(1200); }
  const startBtn = page.getByRole('button', { name: /立即开始|单人试练/ });
  if (await startBtn.count()) { await startBtn.click().catch(() => {}); await page.waitForTimeout(1500); }

  // 用键盘真实输入，让车速涨起来，截图才有内容
  await page.locator('#arena-input').click({ timeout: 3000 }).catch(() => {});
  for (let i = 0; i < 200; i++) {
    const ch = await page.evaluate(() => {
      const t = document.querySelector('.arena-target');
      if (!t) return null;
      const cur = t.querySelector('.current');
      return cur ? cur.textContent : null;
    });
    if (!ch) break;
    await page.keyboard.type(ch, { delay: 0 });
    await page.waitForTimeout(90);
    if (i === 60) await page.screenshot({ path: `${OUT}/race-${size.w}-mid.png` });
  }
  await page.waitForTimeout(300);

  const info = await page.evaluate(() => ({
    overflow: document.documentElement.scrollHeight - window.innerHeight,
    kmh: document.querySelector('.rb-speed strong')?.textContent,
    gear: document.querySelector('.rb-gear-num')?.textContent,
    gearName: document.querySelector('.rb-gear-name')?.textContent,
    distance: document.querySelector('.rb-readout span')?.textContent,
    cars: document.querySelectorAll('.rb-car').length,
    rivals: document.querySelectorAll('.rb-rival').length,
  }));
  const file = `${OUT}/race-${size.w}x${size.h}.png`;
  await page.screenshot({ path: file });
  console.log(`${size.w}x${size.h}: 溢出 ${info.overflow}px | 车速 ${info.kmh} km/h | ${info.gear} 档 (${info.gearName}) | ${info.distance} | 自己的车 ${info.cars} 对手车影 ${info.rivals} → ${file}`);
  if (errs.length) console.log('   控制台错误:', errs.slice(0, 4));
  else console.log('   控制台错误: 无');
  await context.close();
}
await browser.close();
