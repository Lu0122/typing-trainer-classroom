// 验收：管理助手发送后的气泡状态（等待 → 查询完成 → 流式输出）。
// 用法：BASE=http://127.0.0.1:3000 node scripts/verify-agent-status.mjs
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
await page.goto(`${BASE}/admin#agent`, { waitUntil: 'domcontentloaded' });
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('#view-agent:not([hidden])', { timeout: 15000 });
await page.waitForTimeout(1200);

// 新开一个对话，避免历史消息干扰采样
await page.click('#agent-new-chat');
await page.waitForTimeout(500);

const readLast = () => page.evaluate(() => {
  const items = [...document.querySelectorAll('.agent-message-assistant')];
  const last = items[items.length - 1];
  const p = last?.querySelector('p');
  return {
    text: (p?.textContent || '').trim(),
    pending: Boolean(p?.classList.contains('is-pending')),
    dots: last?.querySelectorAll('.agent-dots i').length || 0,
    status: document.querySelector('#agent-status')?.textContent || ''
  };
});

await page.fill('#agent-input', '谁最近没练习');
await page.press('#agent-input', 'Control+Enter');

// 立刻采样：应该已经有一个「正在…」的占位气泡，而不是空白
const samples = [];
for (let i = 0; i < 26; i += 1) {
  samples.push(await readLast());
  if (i === 1) await page.screenshot({ path: `${OUT}/agent-pending.png` });
  await page.waitForTimeout(500);
}

// 等结束
for (let i = 0; i < 40; i += 1) {
  const s = await readLast();
  if (s.text && !s.pending && !/正在|还在处理/u.test(s.text)) break;
  await page.waitForTimeout(500);
}
await page.waitForTimeout(600);
const final = await readLast();
await page.screenshot({ path: `${OUT}/agent-done.png` });

const first = samples[0];
const sawPending = samples.some((s) => s.pending && s.dots === 3);
const sawProgress = samples.some((s) => /查到 \d+ 条数据/u.test(s.text) || /查到 \d+ 条数据/u.test(s.status));
const grew = samples.some((s, i) => i > 0 && s.text.length > samples[i - 1].text.length && !s.pending);

console.log('发送后立刻:', first);
console.log('出现过等待态(三点):', sawPending);
console.log('出现过「查到 N 条」进度:', sawProgress);
console.log('文字逐步变长:', grew);
console.log('最终:', { 字数: final.text.length, 预览: final.text.slice(0, 70), 状态: final.status });
console.log('错误:', errors.length ? errors : '无');

const ok = first.text.length > 0 && first.pending && sawPending && sawProgress
  && final.text.length > 60 && !final.pending && !errors.length;
console.log(ok ? 'PASS' : 'FAIL');
await browser.close();
process.exit(ok ? 0 : 1);
