// 后台响应式审计：多视口 × 多页面，抓横向溢出、越界元素、表格滚动情况。
// 用法：BASE=http://127.0.0.1:3000 ADMIN_PASSWORD=xxx node scripts/audit-admin-responsive.mjs
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const OUT = 'output/admin-responsive';
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: '1920x1080', width: 1920, height: 1080 },
  { name: '1440x900', width: 1440, height: 900 },
  { name: '1366x768', width: 1366, height: 768 },
  { name: '1024x768', width: 1024, height: 768 },
  { name: '820x1180', width: 820, height: 1180 },
  { name: '414x896', width: 414, height: 896 },
  { name: '390x844', width: 390, height: 844 },
  { name: '360x740', width: 360, height: 740 },
];

const VIEWS = ['overview', 'passages', 'users', 'admins', 'classes', 'progress',
  'assignments', 'competitions', 'scores', 'ai-settings', 'bug-reports'];

const browser = await chromium.launch({ channel: 'chrome' });
const report = [];

for (const vp of VIEWPORTS) {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto(`${BASE}/admin#overview`, { waitUntil: 'networkidle' });
  if (await page.locator('#login-view').isVisible().catch(() => false)) {
    await page.fill('#admin-username-input', 'admin');
    await page.fill('#password-input', PASSWORD);
    await page.click('#login-form button[type="submit"]');
    await page.waitForSelector('#admin-shell:not([hidden])', { timeout: 15000 }).catch(() => {});
  }
  await page.waitForTimeout(1200);

  for (const view of VIEWS) {
    // 后台切页靠导航按钮的 click 监听，改 hash 不会触发 switchView。
    await page.evaluate((v) => {
      document.querySelector(`.admin-nav-item[data-view="${v}"]`)?.click();
    }, view);
    await page.waitForTimeout(900);
    const data = await page.evaluate(() => {
      const vw = window.innerWidth;
      const docOverflow = document.documentElement.scrollWidth - vw;
      const offenders = [];
      const seen = new Set();
      document.querySelectorAll('#admin-shell *').forEach((node) => {
        const rect = node.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        if (rect.right <= vw + 1 && rect.left >= -1) return;
        // 表格在滚动容器里溢出是预期行为，单独统计
        const inScroller = node.closest('.table-scroll');
        const key = `${node.tagName}.${node.className}`;
        if (seen.has(key)) return;
        seen.add(key);
        offenders.push({
          tag: node.tagName.toLowerCase(),
          cls: typeof node.className === 'string' ? node.className.slice(0, 60) : '',
          id: node.id || '',
          right: Math.round(rect.right),
          width: Math.round(rect.width),
          inScroller: Boolean(inScroller),
          text: (node.textContent || '').trim().slice(0, 24),
        });
      });
      const scrollers = [...document.querySelectorAll('.table-scroll')].map((el) => ({
        id: el.closest('.admin-view')?.id || '',
        clientWidth: el.clientWidth,
        scrollWidth: el.scrollWidth,
        tableMin: Math.round(el.querySelector('table')?.getBoundingClientRect().width || 0),
      }));
      const nav = document.querySelector('.admin-nav');
      const navRect = nav?.getBoundingClientRect();
      const navItems = [...document.querySelectorAll('.admin-nav-item')].map((b) => {
        const r = b.getBoundingClientRect();
        return { label: b.textContent.trim(), w: Math.round(r.width), overflow: b.scrollWidth > b.clientWidth + 1 };
      });
      return {
        vw,
        docOverflow,
        bodyScrollH: document.documentElement.scrollHeight,
        vh: window.innerHeight,
        offenders: offenders.slice(0, 12),
        scrollers,
        nav: navRect ? { w: Math.round(navRect.width), items: navItems } : null,
      };
    });
    report.push({ vp: vp.name, view, ...data, errors: view === VIEWS[0] ? errors.slice(0, 3) : [] });
    if (vp.width <= 414 || ['overview', 'classes'].includes(view)) {
      await page.screenshot({ path: `${OUT}/${vp.name}-${view}.png` });
    }
  }
  await context.close();
}

await browser.close();

const lines = [];
for (const item of report) {
  const bad = item.docOverflow > 1 || item.offenders.some((o) => !o.inScroller);
  if (!bad) continue;
  lines.push(`\n### ${item.vp} / ${item.view}  docOverflow=${item.docOverflow}  pageH=${item.bodyScrollH}/${item.vh}`);
  if (item.offenders.length) {
    for (const o of item.offenders) {
      lines.push(`  ${o.inScroller ? '[表格内]' : '[越界]  '} <${o.tag} class="${o.cls}" id="${o.id}"> right=${o.right} w=${o.width} "${o.text}"`);
    }
  }
  for (const s of item.scrollers) lines.push(`  表格 ${s.id}: 容器 ${s.clientWidth} / 内容 ${s.scrollWidth}`);
  if (item.nav) {
    const clipped = item.nav.items.filter((i) => i.overflow).map((i) => i.label);
    lines.push(`  侧栏宽 ${item.nav.w}；文字被裁的导航项：${clipped.length ? clipped.join('、') : '无'}`);
  }
  if (item.errors.length) lines.push(`  console: ${item.errors.join(' | ')}`);
}
console.log(lines.join('\n'));
