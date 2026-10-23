// 挑战模式倒计时验收：卡片 → 介绍页 → 开始 → 全屏 3 秒 → 自动聚焦
//
// 用法：BASE=http://127.0.0.1:3111 node scripts/verify-challenge-countdown.mjs
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE || 'http://127.0.0.1:3111';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const USERNAME = process.env.USER_NAME || 'student_db52e21b6c37';
const PASSWORD = process.env.USER_PASS || 'test1234';
const OUT = path.resolve('output/challenge');

fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
const page = await context.newPage();
const problems = [];
page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
page.on('console', (message) => { if (message.type() === 'error') problems.push(`console: ${message.text()}`); });

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
const login = await page.evaluate(async ({ username, password }) => {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  return response.status;
}, { username: USERNAME, password: PASSWORD });

// 1. 进挑战首页，点「英文挑战」卡片
await page.goto(`${BASE}/?v=cd1#challenge-home`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.challenge-mode-card.english', { timeout: 8000 });
await page.click('.challenge-mode-card.english');
await page.waitForTimeout(600);

const afterCard = await page.evaluate(() => ({
  hash: location.hash,
  introVisible: !!document.querySelector('.challenge-intro'),
  startButton: document.querySelector('.challenge-intro button')?.textContent?.trim() || null,
  countdownVisible: !!document.querySelector('.challenge-countdown'),
  runningVisible: !!document.querySelector('.challenge-running')
}));
await page.screenshot({ path: path.join(OUT, '1-intro.png') });

// 2. 点「开始挑战」，抓倒计时序列
const seen = [];
await page.click('.challenge-intro button');
for (let i = 0; i < 24; i += 1) {
  await page.waitForTimeout(150);
  const value = await page.evaluate(() => document.querySelector('.challenge-countdown strong')?.textContent?.trim() || null);
  if (value && seen[seen.length - 1] !== value) seen.push(value);
  if (i === 4) await page.screenshot({ path: path.join(OUT, '2-countdown.png') });
  if (!value && seen.length) break;
}

// 3. 倒计时结束后：焦点、可输入、剩余秒数
await page.waitForTimeout(400);
const afterCountdown = await page.evaluate(() => {
  const input = document.querySelector('.challenge-input-capture');
  const clock = document.querySelector('.challenge-clock b')?.textContent?.trim() || null;
  return {
    overlayGone: !document.querySelector('.challenge-countdown'),
    inputFocused: !!input && document.activeElement === input,
    inputDisabled: input ? input.disabled : null,
    remaining: clock,
    articleVisible: !!document.querySelector('.challenge-target-line')
  };
});
await page.screenshot({ path: path.join(OUT, '3-ready.png') });

// 4. 直接打字，确认能进到输入里
await page.keyboard.type('The quick brown');
await page.waitForTimeout(300);
const typed = await page.evaluate(() => ({
  value: document.querySelector('.challenge-input-capture')?.value || '',
  typedLine: document.querySelector('.challenge-typed-line')?.textContent?.trim()?.slice(0, 30) || ''
}));

await browser.close();

const report = { login, afterCard, countdownSequence: seen, afterCountdown, typed, problems };
console.log(JSON.stringify(report, null, 2));

const ok = login === 200
  && afterCard.introVisible
  && !afterCard.countdownVisible
  && seen.join(',') === '3,2,1'
  && afterCountdown.overlayGone
  && afterCountdown.inputFocused
  && afterCountdown.inputDisabled === false
  && afterCountdown.remaining === '60'
  && typed.value.length > 0
  && problems.length === 0;
console.log(ok ? '\nRESULT: PASS' : '\nRESULT: FAIL');
process.exit(ok ? 0 : 1);
