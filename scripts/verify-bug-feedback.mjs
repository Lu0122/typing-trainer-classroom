// 验收：问题反馈页改版 —— 极简提交、标签点选、草稿、来源自动选中。
// 用法：BASE=http://127.0.0.1:3000 node scripts/verify-bug-feedback.mjs
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const OUT = 'output/bug-feedback';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error' && !/navigator\.vibrate/.test(m.text())) errors.push(`console: ${m.text()}`); });

const login = await context.request.post(`${BASE}/api/auth/login`, {
  data: { username: 'student_db52e21b6c37', password: 'test1234' }
});
console.log('学生登录:', login.status());

// 1) 直接进反馈页（SPA 只改 hash 不会重挂载，必须 reload）
await page.goto(`${BASE}/#bug-feedback`, { waitUntil: 'domcontentloaded' });
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.bug-card', { timeout: 15000 });
await page.waitForTimeout(600);

// 直接打开页面时没有来源，先确认基础布局
const layout = await page.evaluate(() => {
  const card = document.querySelector('.bug-card');
  const rect = card.getBoundingClientRect();
  const btn = document.querySelector('.form-footer button');
  const btnRect = btn.getBoundingClientRect();
  return {
    cardWidth: Math.round(rect.width),
    cardHeight: Math.round(rect.height),
    viewportH: window.innerHeight,
    // 机房 1366x768 是主要场景：提交按钮必须落在首屏，学生填完不用找。
    submitInView: btnRect.bottom <= window.innerHeight,
    pageScrolls: document.documentElement.scrollHeight > window.innerHeight + 2,
    submitDisabled: btn?.disabled,
    chipCount: document.querySelectorAll('.chip').length,
    severityCount: document.querySelectorAll('.severity-chip').length,
    hasDropzone: Boolean(document.querySelector('.dropzone')),
    moreCollapsed: !document.querySelector('.more')?.open,
    historyCollapsed: !document.querySelector('.history')?.open
  };
});

// 2) 极简路径：只填一句话 + 点两个标签，就能提交
await page.fill('#bug-title', '音游第三关音符突然不动了，只能刷新页面');
await page.click('.chip:has-text("音游节奏")');
await page.click('.chip:has-text("卡住不动")');
await page.click('.severity-chip:has-text("玩不下去")');
await page.waitForTimeout(300);

const beforeSubmit = await page.evaluate(() => ({
  submitDisabled: document.querySelector('.form-footer button')?.disabled,
  featureOn: document.querySelector('.chips-feature .chip.on')?.textContent,
  issuesOn: [...document.querySelectorAll('.chips-issue .chip.on')].map((n) => n.textContent),
  severityOn: document.querySelector('.severity-chip.on b')?.textContent
}));
await page.screenshot({ path: `${OUT}/form.png` });

await page.click('.form-footer button');
await page.waitForTimeout(2500);

const afterSubmit = await page.evaluate(() => ({
  success: document.querySelector('.submit-success')?.innerText?.replace(/\s+/g, ' ').trim().slice(0, 60),
  caseId: document.querySelector('.ok-text em')?.textContent || '',
  titleCleared: document.querySelector('#bug-title')?.value === '',
  reportCount: document.querySelectorAll('.report-list article').length
}));
await page.screenshot({ path: `${OUT}/submitted.png` });

// 3) 草稿：填一半刷新，内容还在
await page.fill('#bug-title', '打 Boss 的时候画面卡成幻灯片');
await page.click('.chip:has-text("打 Boss")');
await page.waitForTimeout(700);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.bug-card', { timeout: 15000 });
await page.waitForTimeout(900);
const draft = await page.evaluate(() => ({
  title: document.querySelector('#bug-title')?.value || '',
  feature: document.querySelector('.chips-feature .chip.on')?.textContent || ''
}));

// 4) 折叠的补充细节能展开
await page.click('.more summary');
await page.waitForTimeout(300);
const moreOpen = await page.evaluate(() => Boolean(document.querySelector('.more')?.open));
await page.screenshot({ path: `${OUT}/details.png` });

// 5) 移动端
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(500);
const mobile = await page.evaluate(() => {
  const card = document.querySelector('.bug-card');
  return {
    cardWidth: Math.round(card.getBoundingClientRect().width),
    overflowX: document.documentElement.scrollWidth > window.innerWidth + 2,
    severityColumns: getComputedStyle(document.querySelector('.severity')).gridTemplateColumns
  };
});
await page.screenshot({ path: `${OUT}/mobile.png` });

console.log('\n布局(1366x768):', layout);
console.log('提交前:', beforeSubmit);
console.log('提交后:', afterSubmit);
console.log('刷新后草稿:', draft);
console.log('补充细节展开:', moreOpen);
console.log('移动端(390):', mobile);
console.log('错误:', errors.length ? errors : '无');

const ok = layout.cardWidth > 600 && layout.cardHeight < 700 && layout.submitInView
  && layout.submitDisabled && layout.chipCount >= 10 && layout.severityCount === 3
  && layout.hasDropzone && layout.moreCollapsed
  && beforeSubmit.submitDisabled === false
  && beforeSubmit.featureOn === '音游节奏' && beforeSubmit.issuesOn.join() === '卡住不动'
  && beforeSubmit.severityOn === '玩不下去'
  && /BUG-\d{5}/u.test(afterSubmit.caseId) && afterSubmit.titleCleared
  && draft.title.includes('打 Boss') && draft.feature === '打 Boss'
  && moreOpen && !mobile.overflowX
  && !errors.length;
console.log(ok ? 'PASS' : 'FAIL');
await browser.close();
process.exit(ok ? 0 : 1);
