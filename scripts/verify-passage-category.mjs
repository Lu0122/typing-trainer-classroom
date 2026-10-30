// 验收：后台「新增/编辑文章」弹窗的分类下拉 + AI 生成的语言提示。
// 用法：BASE=http://127.0.0.1:3000 node scripts/verify-passage-category.mjs
// 校验点：
//  1) 候选分类与列表页筛选一致，但隐藏前台用不到的「英文打字 / 拼音打字」；
//  2) 不需要清空输入即可直接换分类；
//  3) 编辑旧文章时，被隐藏的分类仍能回显（不会静默变空）；
//  4) 被隐藏分类的「AI 生成文章」按钮置灰，并给出原因；
//  5) 选英文分类时提示会说明按英文生成；
//  6) 无 console error / pageerror。
import { chromium } from 'playwright-core';
import { readFileSync, mkdirSync } from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const OUT = 'output/passage-category';
mkdirSync(OUT, { recursive: true });

const readEnvPassword = () => {
  const raw = (readFileSync('.env', 'utf8').match(/^ADMIN_PASSWORD=(.*)$/m) || [])[1] || '';
  return raw.trim().replace(/^["']|["']$/g, '');
};
const password = process.env.ADMIN_PASSWORD || readEnvPassword() || 'admin123';
const HIDDEN = ['英文打字', '拼音打字'];

const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

await page.goto(`${BASE}/admin#overview`, { waitUntil: 'networkidle' });
if (await page.locator('#login-view').isVisible().catch(() => false)) {
  await page.fill('#admin-username-input', 'admin');
  await page.fill('#password-input', password);
  await page.click('#login-form button[type="submit"]');
  await page.waitForSelector('#admin-shell:not([hidden])', { timeout: 15000 });
}
await page.waitForTimeout(1200);
await page.evaluate(() => document.querySelector('.admin-nav-item[data-view="passages"]')?.click());
await page.waitForTimeout(900);

const filterOptions = await page.$$eval('#passage-category-filter option', (nodes) => nodes.map((n) => n.value).filter(Boolean));
const filterGroups = await page.$$eval('#passage-category-filter optgroup', (nodes) => nodes.map((g) => ({ label: g.label, items: [...g.children].map((o) => o.value) })));

await page.click('#add-passage');
await page.waitForSelector('#passage-dialog[open]', { timeout: 8000 });
await page.waitForTimeout(300);

const dialogOptions = await page.$$eval('#passage-category-input option', (nodes) => nodes.map((n) => n.value).filter(Boolean));
const groups = await page.$$eval('#passage-category-input optgroup', (nodes) => nodes.map((g) => ({ label: g.label, items: [...g.children].map((o) => o.value) })));

// 换分类：不清空、直接改 value，看是否立即生效（原生 select 行为）
await page.selectOption('#passage-category-input', '英文挑战');
await page.waitForTimeout(120);
const switchedOnce = await page.inputValue('#passage-category-input');
const englishHint = await page.textContent('#passage-ai-hint');
await page.screenshot({ path: `${OUT}/dialog.png` });
await page.selectOption('#passage-category-input', '一分钟挑战');
await page.waitForTimeout(120);
const switchedTwice = await page.inputValue('#passage-category-input');

const missing = filterOptions.filter((name) => !dialogOptions.includes(name));
const extra = dialogOptions.filter((name) => !filterOptions.includes(name));
const leaked = HIDDEN.filter((name) => dialogOptions.includes(name));
// 筛选要能查到历史文章，所以隐藏分类必须仍然出现在「前台未使用」分组里。
const legacyGroup = filterGroups.find((group) => /前台未使用/.test(group.label));
const filterCoversAll = dialogOptions.every((name) => filterOptions.includes(name));
const filterGrouped = filterGroups.length === 3 && HIDDEN.every((name) => legacyGroup?.items.includes(name));
await page.click('#cancel-passage');
await page.waitForTimeout(300);

// 编辑旧文章：被隐藏的分类仍要能回显，且 AI 按钮置灰
let legacy = null;
for (const category of HIDDEN) {
  await page.selectOption('#passage-category-filter', category);
  await page.waitForTimeout(900);
  const rowCount = await page.locator('#passage-table tr').count();
  if (!rowCount) { legacy = { category, found: false }; continue; }
  await page.locator('#passage-table tr').first().locator('button').first().click();
  await page.waitForSelector('#passage-dialog[open]', { timeout: 8000 });
  await page.waitForTimeout(300);
  legacy = {
    category,
    found: true,
    value: await page.inputValue('#passage-category-input'),
    aiDisabled: await page.locator('#generate-passage-ai').isDisabled(),
    hint: (await page.textContent('#passage-ai-hint')).trim()
  };
  await page.screenshot({ path: `${OUT}/dialog-legacy-${category}.png` });
  await page.click('#cancel-passage');
  await page.waitForTimeout(300);
  break;
}

console.log('列表页筛选分类:', filterOptions);
console.log('列表页筛选分组:', JSON.stringify(filterGroups, null, 2));
console.log('弹窗下拉分组:', JSON.stringify(groups, null, 2));
console.log('弹窗多出来的:', extra.length ? extra : '无');
console.log('筛选有但弹窗没有:', missing.length ? missing : '无');
console.log('应当隐藏却出现了:', leaked.length ? leaked : '无');
console.log('不清空连续切换:', switchedOnce, '→', switchedTwice);
console.log('选英文分类时的提示:', englishHint.trim());
console.log('旧文章回显:', legacy);
console.log('console/page 错误:', errors.length ? errors : '无');

const ok = !extra.length
  && !leaked.length
  && filterCoversAll
  && filterGrouped
  && switchedOnce === '英文挑战'
  && switchedTwice === '一分钟挑战'
  && /英文/.test(englishHint)
  && legacy?.found
  && HIDDEN.includes(legacy.value)
  && legacy.aiDisabled
  && /暂未使用/.test(legacy.hint)
  && !errors.length;
console.log(ok ? 'PASS' : 'FAIL');

await browser.close();
process.exit(ok ? 0 : 1);
