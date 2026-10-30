// 验收：管理助手独立页（历史会话 + 中文表头 + 刷新恢复）。
// 用法：BASE=http://127.0.0.1:3000 node scripts/verify-agent-page.mjs
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
await context.request.post(`${BASE}/api/admin/login`, { data: { username: 'admin', password: pw } });

// 1) 从导航进入
await page.goto(`${BASE}/admin#overview`, { waitUntil: 'networkidle' });
await page.waitForSelector('#admin-shell:not([hidden])');
await page.click('.admin-nav-item[data-view="agent"]');
await page.waitForSelector('#view-agent:not([hidden])', { timeout: 10000 });
await page.waitForTimeout(1200);

const layout = await page.evaluate(() => {
  const view = document.querySelector('#view-agent');
  const sidebar = document.querySelector('.agent-sidebar');
  const chat = document.querySelector('.agent-chat');
  return {
    visible: !view.hidden,
    hasSidebar: Boolean(sidebar),
    sidebarWidth: sidebar ? Math.round(sidebar.getBoundingClientRect().width) : 0,
    chatWidth: chat ? Math.round(chat.getBoundingClientRect().width) : 0,
    viewHeight: Math.round(view.getBoundingClientRect().height),
    viewportHeight: window.innerHeight,
    pageScrolls: document.documentElement.scrollHeight > window.innerHeight + 2
  };
});

// 2) 发一句话，看中文表头
await page.fill('#agent-input', '查姓李的');
await page.press('#agent-input', 'Control+Enter');
await page.waitForTimeout(9000);
const summary = page.locator('.agent-message-assistant details summary').last();
if (await summary.count()) await summary.click();
await page.waitForTimeout(400);
const answer = await page.evaluate(() => {
  const msg = [...document.querySelectorAll('.agent-message-assistant')].pop();
  return {
    reply: msg?.querySelector('p')?.textContent?.slice(0, 60),
    headers: [...(msg?.querySelectorAll('.agent-result th') || [])].map((n) => n.textContent),
    rows: msg?.querySelectorAll('.agent-result tbody tr').length || 0
  };
});
const conversations = await page.evaluate(() => document.querySelectorAll('.agent-conversation').length);
await page.screenshot({ path: `${OUT}/agent-page.png` });

// 3) 刷新后应恢复同一个会话
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('#view-agent:not([hidden])', { timeout: 10000 });
await page.waitForTimeout(1500);
const afterReload = await page.evaluate(() => ({
  messages: document.querySelectorAll('#agent-messages .agent-message').length,
  activeTitle: document.querySelector('.agent-conversation.is-active strong')?.textContent || '',
  conversations: document.querySelectorAll('.agent-conversation').length
}));
await page.screenshot({ path: `${OUT}/agent-page-reload.png` });

console.log('布局:', layout);
console.log('回答:', answer);
console.log('会话数:', conversations);
console.log('刷新后:', afterReload);
console.log('错误:', errors.length ? errors : '无');

const ok = layout.visible && layout.hasSidebar && layout.chatWidth > 500
  && answer.headers.length > 0 && answer.headers.every((h) => /[\u4e00-\u9fff]/u.test(h))
  && afterReload.messages >= 2 && afterReload.activeTitle
  && !errors.length;
console.log(ok ? 'PASS' : 'FAIL');
await browser.close();
process.exit(ok ? 0 : 1);
