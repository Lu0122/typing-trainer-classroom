// 后台响应式定点截图：抽屉展开、移动端卡片、宽屏限宽、桌面两栏。
// 用法：BASE=http://127.0.0.1:3000 ADMIN_PASSWORD=xxx node scripts/shot-admin-responsive.mjs
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const OUT = 'output/admin-responsive';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome' });
const errors = [];

async function open(width, height) {
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`${width}x${height}: ${e}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${width}x${height}: ${m.text()}`); });
  await page.goto(`${BASE}/admin#overview`, { waitUntil: 'networkidle' });
  if (await page.locator('#login-view').isVisible().catch(() => false)) {
    await page.fill('#admin-username-input', 'admin');
    await page.fill('#password-input', PASSWORD);
    await page.click('#login-form button[type="submit"]');
    await page.waitForSelector('#admin-shell:not([hidden])', { timeout: 15000 }).catch(() => {});
  }
  await page.waitForTimeout(1400);
  return { context, page };
}

async function go(page, view) {
  await page.evaluate((v) => document.querySelector(`.admin-nav-item[data-view="${v}"]`)?.click(), view);
  await page.waitForTimeout(900);
}

// 1) 手机：抽屉展开
{
  const { context, page } = await open(390, 844);
  await page.click('#mobile-menu-button');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/390-drawer.png` });
  const drawer = await page.evaluate(() => {
    const bar = document.querySelector('.admin-sidebar');
    const rect = bar.getBoundingClientRect();
    return { left: Math.round(rect.left), width: Math.round(rect.width), scrimVisible: !document.querySelector('#admin-nav-scrim').hidden };
  });
  console.log('抽屉:', drawer);
  // 点遮罩应关闭
  await page.click('#admin-nav-scrim', { position: { x: 340, y: 400 } }).catch(() => {});
  await page.waitForTimeout(350);
  console.log('点遮罩后仍展开:', await page.evaluate(() => document.querySelector('.admin-sidebar').classList.contains('is-open')));

  // 2) 手机：后台账号卡片 + 创建管理员弹框
  await page.click('#mobile-menu-button');
  await page.waitForTimeout(300);
  await go(page, 'admins');
  await page.screenshot({ path: `${OUT}/390-admins.png` });
  await page.click('#admin-account-open');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/390-admins-dialog.png` });
  const dialogFit = await page.evaluate(() => {
    const d = document.querySelector('#admin-account-dialog');
    const r = d.getBoundingClientRect();
    return { left: Math.round(r.left), right: Math.round(r.right), vw: window.innerWidth };
  });
  console.log('弹框位置:', dialogFit);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await context.close();
}

// 3) 手机：班级分组卡片
{
  const { context, page } = await open(390, 844);
  await page.click('#mobile-menu-button');
  await page.waitForTimeout(300);
  await go(page, 'classes');
  await page.screenshot({ path: `${OUT}/390-classes.png` });
  await context.close();
}

// 4) 宽屏限宽 + 桌面两栏
for (const [w, h, view] of [[1920, 1080, 'overview'], [1920, 1080, 'classes'], [1366, 768, 'classes']]) {
  const { context, page } = await open(w, h);
  await go(page, view);
  await page.screenshot({ path: `${OUT}/${w}-${view}-final.png` });
  const box = await page.evaluate(() => {
    const v = document.querySelector('.admin-view:not([hidden])');
    const r = v.getBoundingClientRect();
    return { left: Math.round(r.left), width: Math.round(r.width), vw: window.innerWidth };
  });
  console.log(`${w} ${view}:`, box);
  await context.close();
}

await browser.close();
console.log('errors:', errors.length ? errors : 'none');
