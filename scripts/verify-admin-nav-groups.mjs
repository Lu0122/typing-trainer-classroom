// 验收：后台侧栏二级菜单（分组独立展开）的默认状态、互不影响、持久化、深链自动展开、窄屏降级。
// 用法：BASE=http://127.0.0.1:3000 node scripts/verify-admin-nav-groups.mjs
// 不需要登录：这里只验证导航的布局与交互，脚本直接揭开 #admin-shell。
// switchView 的 DOM 操作在 await 取数之前同步完成，所以 401 不影响判定。
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const OUT = 'output/admin-nav-groups';
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: '1920x1080', width: 1920, height: 1080 },
  { name: '1440x900', width: 1440, height: 900 },
  { name: '1366x768', width: 1366, height: 768 },
  { name: '1280x720', width: 1280, height: 720 },
];

const GROUPS = ['teach', 'match', 'account', 'system'];

const state = () => ({
  collapsed: Object.fromEntries([...document.querySelectorAll('.admin-nav-group')]
    .map((g) => [g.dataset.group, g.dataset.collapsed === 'true'])),
  activeView: document.querySelector('.admin-nav-item.is-active')?.dataset.view || null,
});

const browser = await chromium.launch({ channel: 'chrome' });
const failures = [];
const fail = (msg) => failures.push(msg);

// 未登录时后台的会话检查会把 shell 重新藏起来，测量和截图前都要再揭开一次。
async function reveal(page) {
  await page.evaluate(() => {
    document.querySelector('#admin-shell')?.removeAttribute('hidden');
    const login = document.querySelector('#login-view');
    if (login) login.style.display = 'none';
  });
  await page.waitForTimeout(300);
}

async function open(page) {
  await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  await reveal(page);
}

for (const vp of VIEWPORTS) {
  // 每个视口用全新 context，localStorage 是干净的，才能验「默认全部收起」。
  const page = await (await browser.newContext({ viewport: { width: vp.width, height: vp.height } })).newPage();
  await open(page);

  // 1. 默认：概览高亮、四组全收起
  let s = await page.evaluate(state);
  if (s.activeView !== 'overview') fail(`${vp.name} 默认高亮不是概览：${s.activeView}`);
  if (GROUPS.some((g) => !s.collapsed[g])) fail(`${vp.name} 默认没有全部收起：${JSON.stringify(s.collapsed)}`);

  // 2. 点「教学管理」→ 它展开
  await page.click('.admin-nav-group[data-group="teach"] .admin-nav-group-head');
  await page.waitForTimeout(320);
  s = await page.evaluate(state);
  if (s.collapsed.teach) fail(`${vp.name} 点组头后「教学管理」没展开`);

  // 3. 再点「账号管理」→ 两组同时展开，互不影响
  await page.click('.admin-nav-group[data-group="account"] .admin-nav-group-head');
  await page.waitForTimeout(320);
  s = await page.evaluate(state);
  if (s.collapsed.teach || s.collapsed.account) fail(`${vp.name} 分组没有独立展开：${JSON.stringify(s.collapsed)}`);

  // 4. 班级分组应归到「账号管理」下，且展开后可见可点
  const classes = await page.evaluate(() => {
    const el = document.querySelector('.admin-nav-item[data-view="classes"]');
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    const nav = document.querySelector('.admin-nav');
    return {
      group: el.closest('.admin-nav-group')?.dataset.group || null,
      h: Math.round(r.height),
      clickable: !!hit && (hit === el || el.contains(hit)),
      sidebarH: Math.round(document.querySelector('.admin-sidebar').getBoundingClientRect().height),
      navScrollH: nav.scrollHeight, navClientH: nav.clientHeight,
    };
  });
  if (classes.group !== 'account') fail(`${vp.name}「班级分组」不在账号管理下：${classes.group}`);
  if (classes.h < 20 || !classes.clickable) fail(`${vp.name}「班级分组」不可见/不可点：${JSON.stringify(classes)}`);
  // 侧栏高度为 0 说明登录态检查又把 shell 收起来了，此时测量无效，直接判失败而不是静默通过。
  if (classes.sidebarH < 100) fail(`${vp.name} 侧栏高度异常（${classes.sidebarH}），测量无效`);

  // 5. 点子项切页 → 高亮跟着走，两个分组都还开着
  await page.evaluate(() => document.querySelector('.admin-nav-item[data-view="classes"]').click());
  await page.waitForTimeout(400);
  s = await page.evaluate(state);
  if (s.activeView !== 'classes') fail(`${vp.name} 点子项没切页：${s.activeView}`);
  if (s.collapsed.account || s.collapsed.teach) fail(`${vp.name} 切页后分组被收起了：${JSON.stringify(s.collapsed)}`);

  // 6. 回概览 → 分组保持原状（不再全部收起）
  await page.evaluate(() => document.querySelector('.admin-nav-item[data-view="overview"]').click());
  await page.waitForTimeout(400);
  s = await page.evaluate(state);
  if (s.collapsed.teach || s.collapsed.account) fail(`${vp.name} 回概览把分组收起了：${JSON.stringify(s.collapsed)}`);

  // 7. 刷新 → 展开状态还在
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  const after = await page.evaluate(state);
  if (after.collapsed.teach || after.collapsed.account) fail(`${vp.name} 刷新后展开状态丢了：${JSON.stringify(after.collapsed)}`);
  if (!after.collapsed.match || !after.collapsed.system) fail(`${vp.name} 刷新后未打开的分组被误展开：${JSON.stringify(after.collapsed)}`);

  console.log(`${vp.name.padEnd(10)} 默认收起/独立展开/班级归组/切页保持/刷新保持 OK  两组展开时侧栏 ${classes.navScrollH}/${classes.navClientH}`);
  await reveal(page);
  await page.mouse.move(700, 320);
  await page.screenshot({ path: `${OUT}/admin-nav-${vp.name}.png` });
  await page.context().close();
}

// 8. 深链：#scores 要自动展开「赛事成绩」并高亮「竞速成绩」
{
  const page = await (await browser.newContext({ viewport: { width: 1366, height: 768 } })).newPage();
  await page.goto(`${BASE}/admin#scores`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  await reveal(page);
  // 未登录时 switchView 会在 await 处中断，手动再触发一次，模拟登录后的真实路径
  await page.evaluate(() => document.querySelector('.admin-nav-item[data-view="scores"]').click());
  await page.waitForTimeout(500);
  const s = await page.evaluate(state);
  if (s.activeView !== 'scores') fail(`深链 #scores 没高亮竞速成绩：${s.activeView}`);
  if (s.collapsed.match) fail('深链 #scores 没有自动展开「赛事成绩」分组');
  console.log(`深链 #scores  active=${s.activeView} 赛事成绩收起=${s.collapsed.match}`);
  await page.mouse.move(700, 320);
  await page.screenshot({ path: `${OUT}/admin-nav-deeplink-scores.png` });
  await page.context().close();
}

// 9. 窄屏图标条（≤960px 宽）：组头隐藏、13 项全部展开可见
{
  const page = await (await browser.newContext({ viewport: { width: 900, height: 800 } })).newPage();
  await open(page);
  const m = await page.evaluate(() => {
    const heads = [...document.querySelectorAll('.admin-nav-group-head')];
    const items = [...document.querySelectorAll('.admin-nav-item')];
    return {
      headHidden: heads.every((h) => getComputedStyle(h).display === 'none'),
      visibleItems: items.filter((i) => i.getBoundingClientRect().height > 20).length,
      total: items.length,
      sidebarW: Math.round(document.querySelector('.admin-sidebar').getBoundingClientRect().width),
    };
  });
  if (!m.headHidden) fail('窄屏图标条下组头没隐藏');
  if (m.visibleItems !== m.total) fail(`窄屏图标条下只显示了 ${m.visibleItems}/${m.total} 项`);
  console.log(`窄屏 900x800 侧栏宽=${m.sidebarW} 组头隐藏=${m.headHidden} 可见项=${m.visibleItems}/${m.total}`);
  await reveal(page);
  await page.mouse.move(700, 320);
  await page.screenshot({ path: `${OUT}/admin-nav-iconstrip.png` });
  await page.context().close();
}

await browser.close();

if (failures.length) {
  console.error('\n失败项：\n- ' + failures.join('\n- '));
  process.exitCode = 1;
} else {
  console.log('\n全部通过');
}
