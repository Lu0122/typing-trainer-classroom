// 直接以「已知字母 + 已知 progress」渲染，并把渲染后的实例矩阵读回来，
// 同时把画布裁出来。用于判定字形方向：不依赖真实对局。
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:3111';
const OUT = 'output/rhythm-lanes';
fs.mkdirSync(OUT, { recursive: true });
const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));

const login = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'student_db52e21b6c37', password: 'test1234' }),
});
const cookie = (login.headers.getSetCookie?.() || []).map(c => c.split(';')[0]).join('; ');

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await context.addCookies(cookie.split('; ').map(p => {
  const [name, ...v] = p.split('='); return { name, value: v.join('='), domain: '127.0.0.1', path: '/' };
}));
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(`${BASE}/#rhythm`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);

const click = async (re) => {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const b = page.locator('.arena-game button:visible', { hasText: re }).first();
    if (await b.count()) { await b.click({ timeout: 3000 }).catch(() => {}); return true; }
    await page.waitForTimeout(250);
  }
  return false;
};
await click(/加入音游挑战/);
await page.waitForTimeout(1000);
await click(/单人试练|立即开始/);
await page.waitForFunction(() => !!window.__rnStage__, { timeout: 20000 }).catch(() => {});
// 必须等倒计时遮罩消失，否则截到的是「3 秒后开始」的大字盖住整个赛道区。
await page.waitForFunction(() => !document.querySelector('.rn-countdown'), { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(200);

// 接管渲染：停掉组件循环后，自己按固定谱面反复渲染（多帧，避免被任何残余循环冲掉）。
const FALL_MS = 2600;
const layout = [
  [0, 0.30, 'F'], [0, 0.95, 'L'],
  [1, 0.30, 'J'], [1, 0.95, 'E'],
  [2, 0.30, 'T'], [2, 0.95, 'P'],
  [3, 0.30, 'O'], [3, 0.95, 'R'],
];

// progress = 1 - (at + fallMs - elapsed) / fallMs。取 elapsed = fallMs，
// 则 progress = 1 - at/fallMs —— 想让某方块停在 p，令 at = (1-p)·fallMs。
const applied = await page.evaluate(({ layout, FALL_MS }) => {
  const api = window.__rnStage__;
  if (!api || typeof api.freeze !== 'function') return 'no-api';
  const notes = layout.map(([lane, p, letter], i) => ({
    id: 9000 + i, lane, letter, at: (1 - p) * FALL_MS,
  }));
  // 交给组件的渲染循环逐帧画这份谱面：画面稳定，且画布一直在重绘（否则截图是空的）。
  api.freeze({ notes, elapsed: FALL_MS, fallMs: FALL_MS });
  return 'ok';
}, { layout, FALL_MS });

// 固定谱面已交给组件循环逐帧绘制，等几帧让着色器编译稳定后再截。
await page.waitForTimeout(700);
await page.locator('.rn-stage canvas').screenshot({ path: `${OUT}/orient-table.png` });
// 再裁一块近端的：判定线附近字母最大，最容易看出方向对不对。
await page.locator('.rn-stage canvas').screenshot({ path: `${OUT}/orient-table-field.png` });

console.log('注入结果：', applied);
console.log('截图：output/rhythm-lanes/orient-table.png / orient-table-field.png');
console.log('页面错误：', errors.length ? errors.slice(0, 3).join(' | ') : '无');
await browser.close();
