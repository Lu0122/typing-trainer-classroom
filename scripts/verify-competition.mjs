// 比赛模式验收：大屏页 + 学生端页面
//
// 用法：BASE=http://127.0.0.1:3111 node scripts/verify-competition.mjs
// 依赖系统已安装的 Chrome（playwright-core 没有自带浏览器）。
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE || 'http://127.0.0.1:3111';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const USERNAME = process.env.USER_NAME || 'student_db52e21b6c37';
const PASSWORD = process.env.USER_PASS || 'test1234';
const OUT = path.resolve('output/competition');

fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const problems = [];

function watch(page, label) {
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`[${label}] console: ${message.text()}`);
  });
  page.on('pageerror', (error) => problems.push(`[${label}] pageerror: ${error.message}`));
  page.on('response', (response) => {
    if (response.status() === 404) problems.push(`[${label}] 404: ${response.url()}`);
  });
}

// ---------------------------------------------------------------- 1. 大屏页
const board = await context.newPage();
watch(board, 'board');
await board.goto(`${BASE}/board?mode=personal`, { waitUntil: 'networkidle' });
await board.waitForTimeout(1200);

const boardFit = await board.evaluate(() => ({
  scrollHeight: document.documentElement.scrollHeight,
  innerHeight: window.innerHeight,
  phase: document.querySelector('.board-phase')?.textContent?.trim(),
  clock: document.querySelector('.board-clock strong')?.textContent?.trim(),
  rows: document.querySelectorAll('.board-list li:not(.empty)').length
}));
await board.screenshot({ path: path.join(OUT, 'board-1920x1080.png') });

// ---------------------------------------------------------------- 2. 登录并加入
const student = await context.newPage();
watch(student, 'student');
await student.goto(BASE, { waitUntil: 'domcontentloaded' });
const login = await student.evaluate(async ({ username, password }) => {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  return { status: response.status, body: await response.text() };
}, { username: USERNAME, password: PASSWORD });

const join = await student.evaluate(async () => {
  const response = await fetch('/api/competition/personal/join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}'
  });
  return { status: response.status, body: await response.text() };
});

// ---------------------------------------------------------------- 3. 学生端比赛页
await student.setViewportSize({ width: 1366, height: 768 });
// 只改 hash 不会触发重新挂载，加一个查询参数强制整页加载
await student.goto(`${BASE}/?fresh=1#competition`, { waitUntil: 'networkidle' });
await student.waitForTimeout(1600);

const studentFit = await student.evaluate(() => {
  const panel = document.querySelector('.competition-play-panel');
  return {
    scrollHeight: document.documentElement.scrollHeight,
    innerHeight: window.innerHeight,
    hasPanel: !!panel,
    panelBottom: panel ? Math.round(panel.getBoundingClientRect().bottom) : null,
    phase: document.querySelector('.competition-panel-head h2')?.textContent?.trim(),
    timer: document.querySelector('.competition-timer strong')?.textContent?.trim(),
    rankingRows: document.querySelectorAll('.competition-ranking li:not(.empty)').length,
    inputDisabled: document.querySelector('#competition-input')?.disabled
  };
});
await student.screenshot({ path: path.join(OUT, 'student-1366x768.png'), fullPage: false });

// ---------------------------------------------------------------- 4. 大屏再取一次，确认能看到选手
await board.reload({ waitUntil: 'networkidle' });
await board.waitForTimeout(1200);
const boardWithPlayer = await board.evaluate(() => ({
  rows: document.querySelectorAll('.board-list li:not(.empty)').length,
  total: document.querySelector('.board-ranks-head span')?.textContent?.trim(),
  first: document.querySelector('.board-list li .who strong')?.textContent?.trim() || null
}));
await board.screenshot({ path: path.join(OUT, 'board-with-player.png') });

console.log(JSON.stringify({ boardFit, login, join, studentFit, boardWithPlayer, problems }, null, 2));

await browser.close();

const overflow = boardFit.scrollHeight > boardFit.innerHeight + 1 || studentFit.scrollHeight > studentFit.innerHeight + 1;
const ok = login.status === 200 && join.status === 200 && boardFit.rows >= 0 && studentFit.hasPanel && !overflow && problems.length === 0;
console.log(ok ? '\nRESULT: PASS' : '\nRESULT: FAIL');
process.exit(ok ? 0 : 1);
