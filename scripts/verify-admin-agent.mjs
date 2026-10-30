// 验收：后台「管理助手」的发送方式（Ctrl+回车）与「助手审计」页（分页 + 时间筛选）。
// 用法：BASE=http://127.0.0.1:3000 node scripts/verify-admin-agent.mjs
import { chromium } from 'playwright-core';
import { readFileSync, mkdirSync } from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const OUT = 'output/admin-agent';
mkdirSync(OUT, { recursive: true });

const readEnvPassword = () => {
  const raw = (readFileSync('.env', 'utf8').match(/^ADMIN_PASSWORD=(.*)$/m) || [])[1] || '';
  return raw.trim().replace(/^["']|["']$/g, '');
};
const password = process.env.ADMIN_PASSWORD || readEnvPassword() || 'admin123';

const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error' && !/navigator\.vibrate/.test(m.text())) errors.push(`console: ${m.text()}`); });

const login = await context.request.post(`${BASE}/api/admin/login`, { data: { username: 'admin', password } });
if (!login.ok()) throw new Error(`后台登录失败 ${login.status()}`);

// 1) 审计页：分页 + 时间筛选
await page.goto(`${BASE}/admin#agent-logs`, { waitUntil: 'networkidle' });
await page.waitForSelector('#view-agent-logs:not([hidden])', { timeout: 15000 });
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/audit.png` });

const audit = await page.evaluate(() => ({
  rows: document.querySelectorAll('#agent-log-table tr').length,
  countText: document.querySelector('#agent-log-count')?.textContent || '',
  paginationVisible: !document.querySelector('#agent-log-pagination')?.hidden,
  pageLabel: document.querySelector('#agent-log-page-label')?.textContent || '',
  hasRange: Boolean(document.querySelector('#agent-log-range')),
  hasSearch: Boolean(document.querySelector('#agent-log-search')),
  hasSize: Boolean(document.querySelector('#agent-log-pagination .pagination-size')),
  replyOverflow: (() => {
    const cell = document.querySelector('.agent-reply-cell');
    if (!cell) return null;
    return cell.scrollWidth > cell.clientWidth + 2;
  })()
}));

// 分页控件在表格下方，直接滚到它身上再截一张（页面可能不是 window 在滚，用 scrollIntoView 最稳）。
await page.evaluate(() => document.querySelector('#agent-log-pagination')?.scrollIntoView({ block: 'center' }));
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/audit-bottom.png` });
await page.evaluate(() => window.scrollTo(0, 0));

// 时间筛选：选「今天」后应重新请求并保留筛选值
await page.selectOption('#agent-log-range', 'today');
await page.waitForTimeout(900);
const afterRange = await page.evaluate(() => ({
  value: document.querySelector('#agent-log-range')?.value,
  countText: document.querySelector('#agent-log-count')?.textContent || '',
  rows: document.querySelectorAll('#agent-log-table tr').length
}));

// 分页：如果有下一页就点一下
let pageFlip = null;
if (await page.locator('#agent-log-next-page:not([disabled])').count()) {
  await page.click('#agent-log-next-page');
  await page.waitForTimeout(900);
  pageFlip = await page.evaluate(() => document.querySelector('#agent-log-page-label')?.textContent || '');
}

// 2) 助手输入框：Ctrl+回车 发送
await page.click('#agent-fab');
await page.waitForSelector('#agent-dialog[open]', { timeout: 8000 });
await page.waitForTimeout(300);
const hint = await page.textContent('.agent-send-hint').catch(() => '');
await page.fill('#agent-input', '导出竞速成绩');
const beforeSend = await page.locator('#agent-messages .agent-message-user').count();
await page.press('#agent-input', 'Control+Enter');
await page.waitForTimeout(1200);
const afterSend = await page.locator('#agent-messages .agent-message-user').count();
const pendingText = await page.textContent('#agent-status').catch(() => '');
await page.waitForTimeout(6000);
await page.screenshot({ path: `${OUT}/chat.png` });
const replyCount = await page.locator('#agent-messages .agent-message-assistant').count();
const downloadLinks = await page.locator('.agent-download-link').count();

console.log('审计页:', audit);
console.log('时间筛选后:', afterRange);
console.log('翻页后页码:', pageFlip);
console.log('发送提示:', hint.trim(), '| 回车未发送?', beforeSend === afterSend, '| Ctrl+回车后用户消息数:', afterSend, '| 状态:', pendingText.trim());
console.log('助手回复条数:', replyCount, '| 下载按钮:', downloadLinks);
console.log('console/page 错误:', errors.length ? errors : '无');

const ok = audit.rows > 0
  && audit.paginationVisible
  && audit.hasRange
  && audit.hasSearch
  && afterRange.value === 'today'
  && afterSend === beforeSend + 1
  && replyCount >= 2
  && /Ctrl/u.test(hint)
  && !errors.length;
console.log(ok ? 'PASS' : 'FAIL');

await browser.close();
process.exit(ok ? 0 : 1);
