// 端到端：用真实账号开一局「生死时速」人机赛，验证打完一段自动换段、骑手收紧、结算文案。
// 账号与对局数据在脚本结束时清理。
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const base = process.env.CHASE_BASE || 'http://127.0.0.1:3000';
const account = { username: 'chaseprobe9', displayName: '追逐探针9', password: process.env.CHASE_PROBE_PASSWORD || 'probe2026' };
const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe'].find(p => existsSync(p));

const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const log = [];
async function register() {
  const response = await page.request.post(`${base}/api/auth/register`, { data: account });
  log.push(`注册：HTTP ${response.status()} ${(await response.text()).slice(0, 120)}`);
  return response.status();
}
async function login() {
  const response = await page.request.post(`${base}/api/auth/login`, { data: { username: account.username, password: account.password } });
  log.push(`登录：HTTP ${response.status()}`);
  return response.ok();
}
const status = await register();
if (status === 202) log.push('账号需要老师审核，跳过端到端输入验证');
else if (status === 409 || status === 201) await login();

if (await page.request.get(`${base}/api/auth/me`).then(r => r.json()).then(d => d.authenticated).catch(() => false)) {
  await page.goto(`${base}/#games`, { waitUntil: 'networkidle' });
  await page.getByText('生死时速', { exact: false }).first().click();
  await page.waitForTimeout(1200);
  await page.getByText('人机比赛', { exact: false }).first().click();
  await page.waitForTimeout(4200); // 3 秒发车倒计时 + 余量
  const firstTarget = await page.evaluate(() => document.querySelector('.chase-target p')?.innerText || '');
  const firstChars = [...firstTarget];
  log.push(`第一段长度=${firstChars.length}`);
  const gapAtStart = await page.evaluate(() => document.querySelector('.chase-catch-gap')?.innerText.replace(/\n/g, '') || '');
  log.push(`开局提示=${gapAtStart}`);
  await page.locator('.chase-input-row textarea').click();
  await page.keyboard.type(firstTarget, { delay: 90 }); // 不打回车，看是否自动换段
  await page.waitForTimeout(1200);
  const secondTarget = await page.evaluate(() => document.querySelector('.chase-target p')?.innerText || '');
  const typed = await page.evaluate(() => document.querySelector('.chase-input-row textarea')?.value || '');
  log.push(`输入完整段后：换段=${secondTarget !== firstTarget} 新段长度=${[...secondTarget].length} 输入框残留="${typed}"`);
  const gap = await page.evaluate(() => document.querySelector('.chase-catch-gap')?.innerText.replace(/\n/g, '') || '');
  log.push(`推进后提示=${gap}`);
  log.push(`比赛阶段=${await page.evaluate(() => document.querySelector('.chase-round-pill')?.innerText || '')}`);
  await page.screenshot({ path: 'output/chase-e2e.png' });
} else {
  log.push('未取得登录态，跳过界面端到端验证');
}
await browser.close();

// 清理探针账号与其对局记录
const dbPath = process.env.CHASE_DB || require('node:path').join(process.cwd(), 'data', 'typing.db');
if (existsSync(dbPath)) {
  try {
    const Database = require('better-sqlite3');
    const db = new Database(dbPath);
    const id = db.prepare('SELECT id FROM users WHERE username = ?').get(account.username)?.id;
    if (id) {
      db.prepare('DELETE FROM user_sessions WHERE user_id = ?').run(id);
      db.prepare('DELETE FROM training_sessions WHERE user_id = ?').run(id);
      db.prepare('DELETE FROM users WHERE id = ?').run(id);
      log.push(`已清理探针账号 id=${id}`);
    } else log.push('没有需要清理的探针账号');
    db.close();
  } catch (error) { log.push(`清理失败：${error.message}`); }
}
console.log(log.join('\n'));
