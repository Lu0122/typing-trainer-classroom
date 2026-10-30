import { chromium } from 'playwright-core';
import path from 'node:path';

const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const out = path.resolve('output/admin-accounts-after.png');

const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
const page = await context.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(`${BASE}/admin#admins`, { waitUntil: 'networkidle' });
const login = page.locator('#login-view');
if (await login.isVisible().catch(() => false)) {
  await page.fill('#admin-username-input', 'admin');
  await page.fill('#password-input', process.env.ADMIN_PASSWORD || 'admin123');
  await page.click('#login-form button[type="submit"]');
  await page.waitForSelector('#admin-shell:not([hidden])', { timeout: 15000 }).catch(() => {});
}
await page.waitForTimeout(1500);
await page.evaluate(() => { location.hash = '#admins'; });
await page.waitForTimeout(1200);

const rows = await page.$$eval('#admin-account-table tr', (trs) => trs.slice(0, 3).map((tr) => ({
  cells: [...tr.children].map((td) => td.textContent.trim()),
  firstCellHtml: tr.children[0]?.innerHTML?.slice(0, 160),
  fontSize: tr.children[0] ? getComputedStyle(tr.children[0]).fontSize : '',
})));
console.log(JSON.stringify(rows, null, 2));
console.log('errors:', errors);
await page.screenshot({ path: out, fullPage: false });
console.log('saved', out);
await browser.close();
