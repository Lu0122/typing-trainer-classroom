// 验收：后台「管理助手」页不再报 agentDownloads is not defined。
import { chromium } from 'playwright-core';
import { readFileSync, mkdirSync } from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const OUT = 'output/admin-agent';
mkdirSync(OUT, { recursive: true });
const pw = (readFileSync('.env', 'utf8').match(/^ADMIN_PASSWORD=(.*)$/m) || [])[1].trim().replace(/^["']|["']$/g, '');

const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error' && !/navigator\.vibrate/.test(m.text())) errors.push(`console: ${m.text()}`); });

const login = await context.request.post(`${BASE}/api/admin/login`, { data: { username: 'admin', password: pw } });
console.log('后台登录:', login.status());

await page.goto(`${BASE}/admin#overview`, { waitUntil: 'networkidle' });
await page.waitForSelector('#admin-shell:not([hidden])', { timeout: 15000 });

// 1) 进助手页
await page.click('.admin-nav-item[data-view="agent"]');
await page.waitForSelector('#view-agent:not([hidden])', { timeout: 10000 });
await page.waitForTimeout(1500);

const afterOpen = await page.evaluate(() => ({
  visible: !document.querySelector('#view-agent').hidden,
  conversations: document.querySelectorAll('.agent-conversation').length,
  messages: document.querySelectorAll('#agent-messages .agent-message').length,
  toast: document.querySelector('.toast, .admin-toast, [role="alert"]')?.textContent?.trim() || ''
}));

// 2) 依次点开每个历史会话（原来是这一步抛 ReferenceError）
const count = await page.locator('.agent-conversation').count();
const perConversation = [];
for (let i = 0; i < count; i += 1) {
  const before = errors.length;
  await page.locator('.agent-conversation').nth(i).click();
  await page.waitForTimeout(900);
  const info = await page.evaluate(() => ({
    messages: document.querySelectorAll('#agent-messages .agent-message').length,
    active: document.querySelector('.agent-conversation.is-active strong')?.textContent || '',
    downloads: document.querySelectorAll('.agent-download-link').length
  }));
  perConversation.push({ index: i, ...info, newErrors: errors.slice(before) });
}

await page.screenshot({ path: `${OUT}/agent-fixed.png` });

console.log('进入助手页:', afterOpen);
console.log('逐个会话:');
for (const item of perConversation) {
  console.log(`  #${item.index} ${item.active.slice(0, 16).padEnd(18)} 消息=${item.messages} 下载=${item.downloads} ${item.newErrors.length ? '报错: ' + item.newErrors.join(' | ') : 'OK'}`);
}
console.log('累计错误:', errors.length ? errors : '无');

const ok = afterOpen.visible && !errors.length;
console.log(ok ? 'PASS' : 'FAIL');
await browser.close();
process.exit(ok ? 0 : 1);
