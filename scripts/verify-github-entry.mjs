// 验收：前台右下角浮动 GitHub 入口 + 后台侧栏 GitHub 入口在各视口是否真的可见可点。
// 用法：BASE=http://127.0.0.1:3000 node scripts/verify-github-entry.mjs
// 后台登录态不是必需的：侧栏几何与登录无关，脚本直接揭开 #admin-shell 来量。
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const OUT = 'output/github-entry';
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: '1920x1080', width: 1920, height: 1080 },
  { name: '1440x900', width: 1440, height: 900 },
  { name: '1366x768', width: 1366, height: 768 },
  { name: '1280x720', width: 1280, height: 720 },
];

// 普通页面：浮动入口必须出现且在视口内、可点。
const NORMAL_PAGES = ['home', 'challenge-home', 'english-home', 'pinyin-home', 'growth', 'leaderboard'];

// 用 elementFromPoint 判断「真的能点」，只看 rect 会把被遮挡的按钮误判为可见。
const probe = (sel) => {
  const el = document.querySelector(sel);
  if (!el) return { found: false };
  const r = el.getBoundingClientRect();
  const hit = document.elementFromPoint(
    Math.min(Math.max(r.left + r.width / 2, 0), innerWidth - 1),
    Math.min(Math.max(r.top + r.height / 2, 0), innerHeight - 1),
  );
  return {
    found: true,
    top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right),
    inViewport: r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth,
    clickable: !!hit && (hit === el || el.contains(hit)),
  };
};

const browser = await chromium.launch({ channel: 'chrome' });
const failures = [];

for (const vp of VIEWPORTS) {
  const page = await (await browser.newContext({ viewport: { width: vp.width, height: vp.height } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  for (const hash of NORMAL_PAGES) {
    await page.goto(`${BASE}/#${hash}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1800);
    const m = await page.evaluate(probe, '.app-github-float');
    const scroll = await page.evaluate(() => ({ docH: document.documentElement.scrollHeight, winH: innerHeight }));
    // 版权和入口是同一组（.app-corner）：必须同框，且版权不能被按钮压住。
    const corner = await page.evaluate(() => {
      const wrap = document.querySelector('.app-corner');
      const pill = document.querySelector('.app-github-float');
      const copy = document.querySelector('.copyright-mark');
      if (!wrap || !pill || !copy) return { ok: false, reason: `缺少元素 wrap=${!!wrap} pill=${!!pill} copy=${!!copy}` };
      const a = pill.getBoundingClientRect();
      const b = copy.getBoundingClientRect();
      const overlap = !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
      return {
        ok: wrap.contains(pill) && wrap.contains(copy) && !overlap,
        inViewport: a.right <= innerWidth && a.bottom <= innerHeight && b.left >= 0,
        overlap,
        gap: Math.round(b.left - a.left),
      };
    });
    if (!(m.found && m.inViewport && m.clickable)) failures.push(`前台 ${vp.name} #${hash} 浮动入口不可用：${JSON.stringify(m)}`);
    if (!corner.ok || !corner.inViewport) failures.push(`前台 ${vp.name} #${hash} 版权与入口位置异常：${JSON.stringify(corner)}`);
    console.log(`前台 ${vp.name.padEnd(10)} #${hash.padEnd(15)} ${JSON.stringify(m)} 版权同组=${corner.ok} 滚动 ${scroll.docH}/${scroll.winH}`);
  }
  await page.screenshot({ path: `${OUT}/front-${vp.name}.png` });

  // 游戏大厅是整页一屏，浮动入口必须隐藏，不能压住操作区。
  await page.goto(`${BASE}/#home`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.click('.course-card.battle');
  await page.waitForTimeout(2500);
  const lobby = await page.evaluate(() => ({
    lobby: !!document.querySelector('.game-lobby'),
    float: !!document.querySelector('.app-github-float'),
  }));
  if (!lobby.lobby) failures.push(`前台 ${vp.name} 没能进入游戏大厅，无法验证隐藏逻辑`);
  else if (lobby.float) failures.push(`前台 ${vp.name} 游戏大厅仍显示浮动入口`);
  console.log(`前台 ${vp.name.padEnd(10)} 游戏大厅       大厅=${lobby.lobby} 浮动入口=${lobby.float ? '仍在（应隐藏）' : '已隐藏'}`);
  if (errors.length) failures.push(`前台 ${vp.name} 有 JS 报错：${errors.slice(0, 3).join(' | ')}`);
  await page.context().close();
}

for (const vp of VIEWPORTS) {
  const page = await (await browser.newContext({ viewport: { width: vp.width, height: vp.height } })).newPage();
  await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);
  await page.evaluate(() => {
    document.querySelector('#admin-shell')?.removeAttribute('hidden');
    const login = document.querySelector('#login-view');
    if (login) login.style.display = 'none';
  });
  await page.waitForTimeout(300);
  const m = await page.evaluate(() => {
    const nav = document.querySelector('.admin-nav');
    const link = document.querySelector('.sidebar-github-link');
    // 侧栏改成二级菜单后，其余分组是收起的，末项不可见属正常；这里只要求「当前页那一项」没被切掉。
    const active = document.querySelector('.admin-nav-item.is-active');
    const navRect = nav.getBoundingClientRect();
    const activeRect = active?.getBoundingClientRect();
    const r = link.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return {
      navNeedScroll: nav.scrollHeight > nav.clientHeight + 1,
      activeNavItemVisible: activeRect ? activeRect.height > 0 && activeRect.bottom <= navRect.bottom + 1 : null,
      top: Math.round(r.top), bottom: Math.round(r.bottom),
      inViewport: r.top >= 0 && r.bottom <= innerHeight,
      clickable: !!hit && (hit === link || link.contains(hit)),
    };
  });
  if (!(m.inViewport && m.clickable)) failures.push(`后台 ${vp.name} GitHub 入口不可用：${JSON.stringify(m)}`);
  if (!m.activeNavItemVisible) failures.push(`后台 ${vp.name} 当前高亮菜单被侧栏切掉`);
  console.log(`后台 ${vp.name.padEnd(10)} ${JSON.stringify(m)}`);
  await page.screenshot({ path: `${OUT}/admin-${vp.name}.png` });
  await page.context().close();
}

await browser.close();

if (failures.length) {
  console.error('\n失败项：\n- ' + failures.join('\n- '));
  process.exitCode = 1;
} else {
  console.log('\n全部通过');
}
