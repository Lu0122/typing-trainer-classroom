// 量各页面 header 的实际渲染高度与页面溢出情况。
//
// 用法：BASE=http://127.0.0.1:3111 node scripts/measure-headers.mjs
// 输出 JSON，同时把结果写进 docs/HEADER-BASELINE.md 供对照。
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE || 'http://127.0.0.1:3111';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const USERNAME = process.env.USER_NAME || 'student_db52e21b6c37';
const PASSWORD = process.env.USER_PASS || 'test1234';
const OUT = path.resolve('output/header');

// 改造期间新旧 header 并存，用组合选择器一次匹配到位
const ANY_HEADER = '.app-header, .topbar, .lobby-topbar, .arena-header, .battle-header, .boss-header, .chase-topbar, .runner-header, .bug-topbar, .competition-header';

const PAGES = [
  { key: 'home', hash: '', selector: ANY_HEADER },
  { key: 'games', hash: '#games', selector: ANY_HEADER },
  { key: 'rhythm', hash: '#rhythm', selector: ANY_HEADER },
  { key: 'race', hash: '#race', selector: ANY_HEADER },
  { key: 'battle', hash: '#battle', selector: ANY_HEADER },
  { key: 'boss', hash: '#boss', selector: ANY_HEADER },
  { key: 'chase', hash: '#chase', selector: ANY_HEADER },
  { key: 'runner', hash: '#runner', selector: ANY_HEADER },
  { key: 'bug', hash: '#bug-feedback', selector: ANY_HEADER },
  { key: 'competition', hash: '#competition', selector: ANY_HEADER }
];

const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 }
];

fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const problems = [];

const login = await context.newPage();
await login.goto(BASE, { waitUntil: 'domcontentloaded' });
await login.evaluate(async ({ username, password }) => {
  await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
}, { username: USERNAME, password: PASSWORD });
await login.close();

const rows = [];
for (const viewport of VIEWPORTS) {
  const page = await context.newPage();
  await page.setViewportSize(viewport);
  page.on('pageerror', (error) => problems.push(`[${viewport.width}] ${error.message}`));

  for (const item of PAGES) {
    // 查询参数里必须带上页面 key：只改 hash 不会触发整页加载，会量到上一个页面
    const url = `${BASE}/?v=${viewport.width}&p=${item.key}#${item.hash.replace('#', '')}`;
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForSelector(item.selector, { timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(700);
      const measured = await page.evaluate((selector) => {
        const root = document.scrollingElement || document.documentElement;
        // 组合选择器可能匹配到隐藏节点（高度 0），取可见且最高的那个
        const matches = [...document.querySelectorAll(selector)]
          .map((element) => ({
            cls: element.className,
            height: Math.round(element.getBoundingClientRect().height)
          }))
          .filter((item) => item.height > 0);
        const element = matches.sort((a, b) => b.height - a.height)[0] || null;
        return {
          found: !!element,
          headerClass: element ? element.cls : null,
          headerHeight: element ? element.height : null,
          scrollHeight: root.scrollHeight,
          innerHeight: window.innerHeight,
          overflow: root.scrollHeight > window.innerHeight + 1
        };
      }, item.selector);
      rows.push({ viewport: `${viewport.width}x${viewport.height}`, page: item.key, selector: item.selector, ...measured });
      if (viewport.width === 1920) {
        await page.screenshot({ path: path.join(OUT, `before-${item.key}.png`) });
      }
    } catch (error) {
      rows.push({ viewport: `${viewport.width}x${viewport.height}`, page: item.key, error: error.message });
    }
  }
  await page.close();
}

await browser.close();

console.log(JSON.stringify({ rows, problems }, null, 2));

const table = rows.map((row) => `| ${row.viewport} | ${row.page} | ${row.headerClass ?? '-'} | ${row.headerHeight ?? '-'} | ${row.scrollHeight ?? '-'} / ${row.innerHeight ?? '-'} | ${row.overflow === undefined ? '-' : row.overflow ? '溢出' : '正常'} |`).join('\n');
fs.writeFileSync(path.resolve('docs/HEADER-BASELINE.md'), `# Header 基线（改造前后对照）

> 由 \`scripts/measure-headers.mjs\` 生成，用于改造前后对照。
> header 高度是元素实际渲染高度（含 padding/border）。

| 视口 | 页面 | 当前 header | 高度 | scrollHeight / innerHeight | 页面 |
| --- | --- | --- | --- | --- | --- |
${table}

## 控制台错误

${problems.length ? problems.map((item) => `- ${item}`).join('\n') : '无'}
`);
console.log('\n已写入 docs/HEADER-BASELINE.md');
