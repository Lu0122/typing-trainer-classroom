// 探路第二步：从首页进入「游戏模式」，看游戏大厅里的入口名称。
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p => existsSync(p));
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
await page.getByText('游戏模式', { exact: false }).first().click();
await page.waitForTimeout(1800);
console.log('URL:', page.url());
console.log('--- 大厅可见文本 ---');
console.log((await page.evaluate(() => document.body.innerText)).slice(0, 1600));
console.log('--- 按钮/链接 ---');
console.log((await page.evaluate(() => [...document.querySelectorAll('button,a,[role=button]')]
  .slice(0, 50).map(e => (e.tagName + ':' + (e.innerText || '').trim().replace(/\s+/g, ' ')).slice(0, 70)))).join('\n'));
await page.screenshot({ path: 'output/probe-lobby.png' });
await browser.close();
