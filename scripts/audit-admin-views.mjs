// 后台全页面巡检：逐个切换视图，抓 console 错误、失败请求、空白视图。
// 用法：BASE=http://127.0.0.1:3000 node scripts/audit-admin-views.mjs
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const pw = (readFileSync('.env', 'utf8').match(/^ADMIN_PASSWORD=(.*)$/m) || [])[1].trim().replace(/^["']|["']$/g, '');
// 注意 'agent' 必须在内：管理助手是独立页，曾经因为漏进这个列表而没被巡检到，
// 结果「打开历史会话报 agentDownloads is not defined」一直没被发现。
const VIEWS = ['overview', 'passages', 'users', 'admins', 'classes', 'progress', 'assignments', 'competitions', 'scores', 'ai-settings', 'bug-reports', 'agent-logs', 'agent'];

const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const problems = [];
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
page.on('response', (res) => {
  const url = res.url();
  if (res.status() >= 400 && !url.includes('/api/auth/me')) problems.push(`HTTP ${res.status()} ${url.replace(BASE, '')}`);
});

const login = await context.request.post(`${BASE}/api/admin/login`, { data: { username: 'admin', password: pw } });
if (!login.ok()) throw new Error(`登录失败 ${login.status()}`);

await page.goto(`${BASE}/admin#overview`, { waitUntil: 'networkidle' });
await page.waitForSelector('#admin-shell:not([hidden])', { timeout: 15000 });
await page.waitForTimeout(800);

for (const view of VIEWS) {
  const before = problems.length;
  await page.evaluate((v) => document.querySelector(`.admin-nav-item[data-view="${v}"]`)?.click(), view);
  await page.waitForTimeout(1100);

  // 管理助手：逐个点开历史会话。渲染历史消息走的是另一条代码路径，
  // 只打开页面不点会话是测不到的（agentDownloads is not defined 就是这么漏过去的）。
  if (view === 'agent') {
    const count = await page.locator('.agent-conversation').count();
    for (let i = 0; i < count; i += 1) {
      await page.locator('.agent-conversation').nth(i).click();
      await page.waitForTimeout(700);
    }
    const rendered = await page.evaluate(() => document.querySelectorAll('#agent-messages .agent-message').length);
    if (count > 0 && rendered === 0) problems.push('管理助手：历史会话点开后没有渲染出任何消息');
  }

  const info = await page.evaluate((v) => {
    const section = document.querySelector(`#view-${v}`);
    if (!section) return { missing: true };
    const rect = section.getBoundingClientRect();
    return {
      hidden: section.hidden,
      height: Math.round(rect.height),
      rows: section.querySelectorAll('tbody tr').length,
      buttons: section.querySelectorAll('button').length,
      text: (section.innerText || '').replace(/\s+/g, ' ').slice(0, 60)
    };
  }, view);
  const newProblems = problems.slice(before);
  const flag = info.missing || info.hidden || info.height < 40 ? '空白/缺失' : newProblems.length ? '有报错' : 'OK';
  console.log(`${view.padEnd(14)} ${flag.padEnd(8)} 高度=${info.height ?? '-'} 行=${info.rows ?? '-'} 按钮=${info.buttons ?? '-'}`);
  if (newProblems.length) for (const item of newProblems) console.log('    ', item);
}
console.log('\n累计问题:', problems.length ? problems : '无');
await browser.close();
process.exit(problems.length ? 1 : 0);
