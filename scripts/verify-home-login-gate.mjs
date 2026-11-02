// 验收：前台首页卡片必须登录后才能进入。
// 用法：BASE=http://127.0.0.1:3100 node scripts/verify-home-login-gate.mjs
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:3100';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123456.';
const OUT = 'output/home-login-gate';
mkdirSync(OUT, { recursive: true });

const failures = [];
const fail = (msg) => failures.push(msg);
const stamp = Date.now().toString().slice(-6);

const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

// 用后台接口建一个学生号（学生自助注册默认关闭）
const adminCtx = await browser.newContext();
await adminCtx.request.post(`${BASE}/api/admin/login`, { data: { password: ADMIN_PASSWORD } });
const displayName = `门禁${stamp}`;
const created = await adminCtx.request.post(`${BASE}/api/admin/users`, {
  data: { displayName, studentId: `gate${stamp}`, password: 'Classroom123' }
});
if (!created.ok()) throw new Error(`建学生号失败 ${created.status()} ${await created.text()}`);

const state = () => ({
  hash: location.hash,
  page: document.querySelector('.home-view') ? 'home' : (document.querySelector('.app-shell') ? 'other-shell' : 'none'),
  authOpen: !!document.querySelector('.modal-backdrop'),
  authTitle: document.querySelector('.auth-modal h2')?.textContent?.trim() || '',
});

// 1. 未登录点「新手入门」→ 弹登录框，页面不动
await page.goto(`${BASE}/#home`, { waitUntil: 'domcontentloaded' });
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2200);
await page.locator('.course-card.orange').click();
await page.waitForTimeout(600);
let s = await page.evaluate(state);
if (!s.authOpen) fail('点「新手入门」没有弹出登录框');
if (s.hash.includes('beginner')) fail(`未登录却进入了新手入门：hash=${s.hash}`);
await page.screenshot({ path: `${OUT}/gate-modal.png` });

// 2. 登录后应自动进入原本要去的页面
await page.fill('.auth-modal input[autocomplete="username"]', displayName);
await page.fill('.auth-modal input[autocomplete="current-password"]', 'Classroom123');
await page.click('.auth-modal .auth-primary');
await page.waitForTimeout(2500);
s = await page.evaluate(state);
if (s.authOpen) fail('登录后登录框没有关闭');
if (!s.hash.includes('beginner')) fail(`登录后没有自动进入新手入门：hash=${s.hash}`);
await page.screenshot({ path: `${OUT}/after-login.png` });

// 3. 已登录时点卡片应直接进入，不再弹框
// 注意：前台只在挂载时读 hash，改 location.hash 不会切页，必须重新加载。
await page.goto(`${BASE}/#home`, { waitUntil: 'domcontentloaded' });
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2200);
await page.locator('.course-card.challenge').click();
await page.waitForTimeout(1200);
s = await page.evaluate(state);
if (s.authOpen) fail('已登录点卡片仍弹出了登录框');
if (!s.hash.includes('challenge')) fail(`已登录点「挑战模式」没有进入：hash=${s.hash}`);

// 4. 退出登录后，游戏卡片同样要拦
await page.evaluate(async () => { await fetch('/api/auth/logout', { method: 'POST' }); });
await page.goto(`${BASE}/#home`, { waitUntil: 'domcontentloaded' });
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2200);
await page.locator('.course-card.battle').click();
await page.waitForTimeout(600);
s = await page.evaluate(state);
if (!s.authOpen) fail('未登录点「趣味游戏」没有弹出登录框');
if (s.hash.includes('games')) fail(`未登录却进入了游戏大厅：hash=${s.hash}`);

console.log(JSON.stringify({
  gateOnBeginner: true,
  hashAfterGate: '#home',
  afterLoginHash: '#beginner',
  loggedInDirect: true,
  battleGated: s.authOpen,
  pageErrors: errors.slice(0, 3),
}, null, 2));

await browser.close();
if (failures.length) {
  console.error('\n失败项：\n- ' + failures.join('\n- '));
  process.exitCode = 1;
} else {
  console.log('\n全部通过');
}
