// 回归检查：确认音游改造没有影响赛车模式。
import { chromium } from 'playwright-core';

const BASE = process.env.BASE || 'http://127.0.0.1:3111';
const login = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'student_db52e21b6c37', password: 'test1234' }),
});
if (!login.ok) { console.log('登录失败', login.status); process.exit(0); }
const cookie = (login.headers.getSetCookie?.() || []).map(c => c.split(';')[0]).join('; ');

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.addCookies(cookie.split('; ').map(p => {
  const [name, ...v] = p.split('='); return { name, value: v.join('='), domain: '127.0.0.1', path: '/' };
}));

for (const [route, label] of [['race', '赛车'], ['rhythm', '音游']]) {
  const page = await context.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(`${BASE}/#${route}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1800);
  const info = await page.evaluate(() => ({
    heading: document.querySelector('.arena-stage h1')?.textContent || '',
    brand: document.querySelector('.arena-brand strong')?.textContent?.trim() || '',
    tag: document.querySelector('.arena-tag')?.textContent?.trim() || '',
    hasTrack: !!document.querySelector('.arena-tracks'),
    hasTextarea: !!document.querySelector('#arena-input'),
    hasRhythmBoard: !!document.querySelector('.rn'),
  }));
  console.log(label, JSON.stringify(info));
  console.log('  errors:', errs.length ? errs.slice(0, 3) : 'none');
  await page.close();
}
await browser.close();
