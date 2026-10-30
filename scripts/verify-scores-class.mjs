// 竞速成绩页验证：班级筛选、班级列、label、搜索框宽度、导出内容。
// 用法：BASE=http://127.0.0.1:3100 ADMIN_PASSWORD=xxx node scripts/verify-scores-class.mjs
import { chromium } from 'playwright-core';
import XLSX from 'xlsx';
import { mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const OUT = 'output/verify-scores';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

const report = [];
const log = (label, value) => { report.push(`${label}: ${JSON.stringify(value)}`); };

// 登录
await page.goto(`${BASE}/admin#overview`, { waitUntil: 'networkidle' });
if (await page.locator('#login-view').isVisible().catch(() => false)) {
  await page.fill('#admin-username-input', 'admin');
  await page.fill('#password-input', PASSWORD);
  await page.click('#login-form button[type="submit"]');
  await page.waitForSelector('#admin-shell:not([hidden])', { timeout: 15000 });
}
await page.waitForTimeout(1200);

// 切到竞速成绩
await page.evaluate(() => document.querySelector('.admin-nav-item[data-view="scores"]')?.click());
await page.waitForTimeout(1400);

// 1. 班级下拉是否被填充
const options = await page.$$eval('#score-class-filter option', (os) => os.map((o) => ({ text: o.textContent.trim(), value: o.value })));
log('班级下拉选项', options);

// 2. 表头是否含班级列
const heads = await page.$$eval('#view-scores thead th', (ths) => ths.map((t) => t.textContent.trim()));
log('表头', heads);

// 3. 首行单元格数量与内容
const firstRow = await page.$$eval('#score-table tr:first-child td', (tds) => tds.map((t) => t.textContent.trim()));
log('首行', firstRow);

// 4. 选一个真实班级，看请求参数与结果
const targetClass = options.find((o) => o.value && o.value !== 'unassigned');
let apiCheck = null;
if (targetClass) {
  const [request] = await Promise.all([
    page.waitForRequest((r) => r.url().includes('/api/admin/scores?') && r.url().includes('classId='), { timeout: 8000 }).catch(() => null),
    page.selectOption('#score-class-filter', targetClass.value),
  ]);
  await page.waitForTimeout(1200);
  log('切换班级后的请求', request ? decodeURIComponent(request.url().replace(BASE, '')) : '未捕获');
  const rowClassNames = await page.$$eval('#score-table tr', (trs) => trs.map((tr) => tr.children[1]?.textContent.trim()).filter(Boolean));
  apiCheck = { expected: targetClass.text, distinct: [...new Set(rowClassNames)] };
  log('筛选后各行班级列', apiCheck);
}

// 5. 待分班
await page.selectOption('#score-class-filter', 'unassigned');
await page.waitForTimeout(1200);
const unassigned = await page.$$eval('#score-table tr', (trs) => trs.map((tr) => tr.children[1]?.textContent.trim()).filter(Boolean));
log('待分班筛选后各行班级列', { count: unassigned.length, distinct: [...new Set(unassigned)] });

// 6. 恢复全部，导出并解析 xlsx
await page.selectOption('#score-class-filter', '');
await page.waitForTimeout(900);
let exportInfo = 'no-download';
try {
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 20000 }),
    page.click('#export-scores'),
  ]);
  const file = path.join(OUT, download.suggestedFilename());
  await download.saveAs(file);
  const wb = XLSX.readFile(file);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
  exportInfo = {
    file: download.suggestedFilename(),
    rows: rows.length,
    columns: Object.keys(rows[0] || {}),
    sample: rows[0] || null,
    classValues: [...new Set(rows.map((r) => r['班级']))].slice(0, 6),
  };
} catch (error) {
  exportInfo = `导出失败: ${error.message}`;
}
log('导出', exportInfo);

// 7. 搜索框宽度（桌面端应 ≤ 280px）
const widths = await page.evaluate(() => [...document.querySelectorAll('#view-scores .filter-field .search-field input')].map((i) => Math.round(i.getBoundingClientRect().width)));
log('成绩页搜索框宽度', widths);

// 8. 各页 label 覆盖
const labelAudit = [];
for (const view of ['admins', 'passages', 'users', 'classes', 'progress', 'assignments', 'competitions', 'scores', 'bug-reports']) {
  await page.evaluate((v) => document.querySelector(`.admin-nav-item[data-view="${v}"]`)?.click(), view);
  await page.waitForTimeout(500);
  const data = await page.evaluate(() => {
    const active = document.querySelector('.admin-view:not([hidden])');
    const fields = [...active.querySelectorAll('.filter-field')];
    return {
      fields: fields.length,
      labels: fields.map((f) => f.querySelector('.filter-label')?.textContent.trim() || '(缺)'),
      missingControl: fields.filter((f) => !f.querySelector('input,select')).length,
    };
  });
  labelAudit.push({ view, ...data });
}
log('各页 label', labelAudit);

await page.screenshot({ path: `${OUT}/1440-scores.png` });

// 9. 移动端：卡片是否带班级字段、有无横向溢出
const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
const mp = await mobile.newPage();
mp.on('pageerror', (e) => errors.push(`mobile: ${e}`));
await mp.goto(`${BASE}/admin#overview`, { waitUntil: 'networkidle' });
await mp.fill('#admin-username-input', 'admin');
await mp.fill('#password-input', PASSWORD);
await mp.click('#login-form button[type="submit"]');
await mp.waitForSelector('#admin-shell:not([hidden])');
await mp.waitForTimeout(1200);
await mp.click('#mobile-menu-button');
await mp.waitForTimeout(300);
await mp.evaluate(() => document.querySelector('.admin-nav-item[data-view="scores"]')?.click());
await mp.waitForTimeout(1200);
const mobileInfo = await mp.evaluate(() => {
  const active = document.querySelector('.admin-view:not([hidden])');
  const labels = [...active.querySelectorAll('.filter-label')].map((s) => s.textContent.trim());
  const cardLabels = [...(document.querySelector('#score-table tr')?.children || [])].map((td) => td.dataset.label || '(无)');
  const inputs = [...active.querySelectorAll('.filter-field')].map((f) => Math.round(f.getBoundingClientRect().width));
  return {
    labels,
    cardLabels,
    fieldWidths: inputs,
    overflow: document.documentElement.scrollWidth - window.innerWidth,
  };
});
log('移动端成绩页', mobileInfo);
await mp.screenshot({ path: `${OUT}/390-scores.png` });
await mobile.close();

await browser.close();
console.log(report.join('\n'));
console.log('errors:', errors.length ? errors : 'none');
if (!existsSync(`${OUT}/1440-scores.png`)) console.log('截图缺失');
