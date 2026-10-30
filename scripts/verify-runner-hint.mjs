// 验收：遗迹逃亡的英文题是否显示中文意思，且长题目不会把输入面板顶出屏幕。
// 用法：BASE=http://127.0.0.1:3000 node scripts/verify-runner-hint.mjs
import { chromium } from 'playwright-core';
import { readFileSync, mkdirSync } from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const OUT = 'output/runner-hint';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1440, height: 800 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  // vibrate 是浏览器策略提示（没有用户手势就不给震动），不是应用报错，别算进来。
  if (m.type() === 'error' && !/navigator\.vibrate/.test(m.text())) errors.push(`console: ${m.text()}`);
});

// 登录：直接打接口，cookie 会写进同一个浏览器上下文，比点弹窗稳。
// 用真实账号，注册接口按 IP 限流，别在这里注册。
const username = process.env.STUDENT_USERNAME || 'student_db52e21b6c37';
const password = process.env.STUDENT_PASSWORD || 'test1234';
const login = await context.request.post(`${BASE}/api/auth/login`, { data: { username, password } });
if (!login.ok()) throw new Error(`学生登录失败 ${login.status()}：${await login.text()}`);
await page.goto(`${BASE}/#runner`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

// 上一局可能还停着（未完成会保留进度），三种入口都要能进：开始 / 继续 / 再跑一次。
for (const name of [/开始逃亡/, /继续逃亡/, /再跑一次/]) {
  const button = page.getByRole('button', { name }).first();
  if (await button.isVisible().catch(() => false)) { await button.click().catch(() => {}); break; }
}
// 3 秒倒计时 + 第一题
await page.waitForTimeout(5000);
await page.screenshot({ path: `${OUT}/runner.png` });

const info = await page.evaluate(() => {
  const word = document.querySelector('.runner-word')?.textContent || '';
  const hint = document.querySelector('.runner-word-hint')?.textContent || '';
  const choiceHints = [...document.querySelectorAll('.runner-choice-hint')].map((node) => node.textContent);
  const panel = document.querySelector('.runner-input-panel')?.getBoundingClientRect();
  const wordBox = document.querySelector('.runner-word')?.getBoundingClientRect();
  return {
    word,
    hint,
    choiceHints,
    panelBottom: panel ? Math.round(panel.bottom) : null,
    panelTop: panel ? Math.round(panel.top) : null,
    wordLines: wordBox ? Math.round(wordBox.height / parseFloat(getComputedStyle(document.querySelector('.runner-word')).lineHeight || 0)) : null,
    viewportHeight: window.innerHeight
  };
});
console.log(JSON.stringify(info, null, 2));

// 后期最长的一条英文短语能不能在面板里一行放下（放不下会折行，面板会往上顶）。
const fit = await page.evaluate(() => {
  const panel = document.querySelector('.runner-input-panel');
  if (!panel) return null;
  const probe = document.createElement('div');
  probe.className = 'runner-word';
  probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap';
  probe.textContent = 'keep your rhythm steady';
  panel.append(probe);
  const style = getComputedStyle(panel);
  const inner = panel.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  const width = probe.scrollWidth;
  probe.remove();
  return { inner: Math.round(inner), width, fits: width <= inner };
});
console.log('最长短语宽度:', fit);

console.log('console/page 错误:', errors.length ? errors : '无');

const ok = Boolean(info.word)
  && (/[\u4e00-\u9fff]/.test(info.hint) || info.choiceHints.some((text) => /[\u4e00-\u9fff]/.test(text)))
  && info.panelBottom <= info.viewportHeight
  && fit?.fits
  && !errors.length;
console.log(ok ? 'PASS' : 'FAIL');

await browser.close();
process.exit(ok ? 0 : 1);
