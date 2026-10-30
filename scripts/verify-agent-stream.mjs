// 验收：管理助手流式回答 + 气泡里只有文字（不再有数据表）。
// 用法：BASE=http://127.0.0.1:3000 node scripts/verify-agent-stream.mjs
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

await page.goto(`${BASE}/admin#agent`, { waitUntil: 'networkidle' });
await page.waitForSelector('#view-agent:not([hidden])', { timeout: 15000 });
await page.waitForTimeout(1200);

const before = await page.locator('#agent-messages .agent-message').count();
await page.fill('#agent-input', '本周比上周怎么样');
await page.press('#agent-input', 'Control+Enter');

// 采样：3 秒内文字是否在增长（判断是不是流式）
const samples = [];
for (let i = 0; i < 24; i += 1) {
  await page.waitForTimeout(500);
  samples.push(await page.evaluate(() => {
    const items = [...document.querySelectorAll('#agent-messages .agent-message-assistant')];
    return items.length ? (items[items.length - 1].querySelector('p')?.textContent || '').length : 0;
  }));
}

// 等回答结束
for (let i = 0; i < 30; i += 1) {
  const status = await page.textContent('#agent-status').catch(() => '');
  if (status && !/正在生成|思考中/u.test(status)) break;
  await page.waitForTimeout(600);
}
await page.waitForTimeout(800);

const result = await page.evaluate(() => {
  const items = [...document.querySelectorAll('#agent-messages .agent-message-assistant')];
  const last = items[items.length - 1];
  return {
    text: (last?.querySelector('p')?.textContent || '').slice(0, 120),
    length: (last?.querySelector('p')?.textContent || '').length,
    hasTable: Boolean(last?.querySelector('.agent-result table, details')),
    status: document.querySelector('#agent-status')?.textContent || '',
    total: items.length
  };
});
await page.screenshot({ path: `${OUT}/agent-stream.png` });

console.log('字数采样:', samples.join(' → '));
console.log('结果:', result);
console.log('错误:', errors.length ? errors : '无');

const growing = samples.some((n, i) => i > 0 && n > samples[i - 1]);
const ok = growing && result.length > 20 && !result.hasTable && !errors.length;
console.log(ok ? 'PASS' : 'FAIL');
await browser.close();
process.exit(ok ? 0 : 1);
