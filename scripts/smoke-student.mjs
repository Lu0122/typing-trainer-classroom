// 学生端冒烟：首页 / 遗迹逃亡 / 挑战模式 / 自由练习，抓报错和失败请求。
// 用法：BASE=http://127.0.0.1:3000 node scripts/smoke-student.mjs
import { chromium } from 'playwright-core';

const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const PAGES = [
  { hash: '', name: '首页' },
  { hash: '#games', name: '趣味游戏' },
  { hash: '#challenge-home', name: '挑战模式' },
  { hash: '#practice', name: '自由练习' },
  { hash: '#runner', name: '遗迹逃亡' }
];

const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const problems = [];
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error' && !/navigator\.vibrate/.test(m.text())) problems.push(`console: ${m.text()}`); });
page.on('response', (res) => {
  const url = res.url();
  if (res.status() >= 400 && url.startsWith(BASE) && !url.includes('/api/auth/me')) problems.push(`HTTP ${res.status()} ${url.replace(BASE, '')}`);
});

const login = await context.request.post(`${BASE}/api/auth/login`, { data: { username: 'student_db52e21b6c37', password: 'test1234' } });
console.log('学生登录:', login.status());

for (const item of PAGES) {
  const before = problems.length;
  // 只改 hash 不会重新挂载 Vue（路由是 onMounted 里读一次），必须整页重载才是真的进这个页面。
  await page.goto(`${BASE}/${item.hash}`, { waitUntil: 'domcontentloaded' });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const info = await page.evaluate(() => ({
    text: (document.querySelector('main')?.innerText || '').replace(/\s+/g, ' ').slice(0, 50),
    height: Math.round(document.querySelector('main')?.getBoundingClientRect().height || 0)
  }));
  const fresh = problems.slice(before);
  console.log(`${item.name.padEnd(6)} ${fresh.length ? '有报错' : 'OK'}  高度=${info.height}  「${info.text}」`);
  for (const p of fresh) console.log('    ', p);
}
console.log('\n累计问题:', problems.length ? problems : '无');
await browser.close();
process.exit(problems.length ? 1 : 0);
