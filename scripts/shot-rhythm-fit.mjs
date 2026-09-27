// 在多个分辨率下截图音游页面，确认 100vh 内完整显示、无裁切。
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:3124';
const OUT = 'output/rhythm-verify';
mkdirSync(OUT, { recursive: true });

const login = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'student_db52e21b6c37', password: 'test1234' }),
});
if (!login.ok) { console.log('login failed', login.status); process.exit(0); }
const cookie = (login.headers.getSetCookie?.() || []).map(c => c.split(';')[0]).join('; ');

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
});

const shots = [
  { w: 1366, h: 768, label: '1366x768' },
  { w: 1920, h: 1080, label: '1920x1080' },
  { w: 900, h: 700, label: '900x700窄屏' },
];

for (const s of shots) {
  const context = await browser.newContext({ viewport: { width: s.w, height: s.h } });
  await context.addCookies(cookie.split('; ').map(p => {
    const [name, ...v] = p.split('='); return { name, value: v.join('='), domain: '127.0.0.1', path: '/' };
  }));
  const page = await context.newPage();
  await page.goto(`${BASE}/#rhythm`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  const file = `${OUT}/70-fit-${s.label}.png`;
  await page.screenshot({ path: file });
  const overflow = await page.evaluate(() => ({
    scroll: document.documentElement.scrollHeight,
    inner: window.innerHeight,
    field: Math.round(document.querySelector('.rn-field')?.getBoundingClientRect().height || 0),
    keyboardVisible: (() => {
      const k = document.querySelector('.rn-keyboard');
      if (!k) return 'hidden';
      const r = k.getBoundingClientRect();
      return r.bottom <= window.innerHeight ? 'ok' : 'clipped';
    })(),
  }));
  console.log(`${s.label}: 溢出 ${overflow.scroll - overflow.inner}px  轨道 ${overflow.field}px  键盘 ${overflow.keyboardVisible}  → ${file}`);
  await context.close();
}
await browser.close();
