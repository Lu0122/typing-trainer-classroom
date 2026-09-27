// 布局验收：在多个分辨率下打开音游页面，覆盖「等待开局」与「比赛进行中」两种状态，
// 检查整页无滚动条、赛道占比达标、相机探针命中目标。
//
// 为什么必须跑浏览器：CSS 的 flex/grid 收敛结果与 three.js 的 canvas 尺寸
// 只有真实渲染引擎能给出。脚本按 aria 与文本定位元素，不依赖易变的 DOM 层级。
import { chromium } from 'playwright-core';
import { mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = process.env.ARENA_BASE || 'http://127.0.0.1:4173';
const OUT = resolve('output');
mkdirSync(OUT, { recursive: true });

// 项目只装了 playwright-core（不含浏览器二进制）。用系统已安装的 Chrome/Edge 频道的
// 可执行文件直接启动 —— 避免为了跑一次验收去下载一份 Chromium。
const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
];
const executablePath = CHROME_CANDIDATES.find(p => existsSync(p));
if (!executablePath) {
  console.error('未找到 Chrome / Edge，无法运行布局验收。');
  process.exit(2);
}

const VIEWPORTS = [
  { name: '1366x768', width: 1366, height: 768 },
  { name: '1440x900', width: 1440, height: 900 },
  { name: '1920x1080', width: 1920, height: 1080 },
  { name: '2560x1440', width: 2560, height: 1440 },
];

const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
let failures = 0;
const rows = [];

for (const vp of VIEWPORTS) {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  // 大视口下 three.js 首帧 + 构建产物加载较慢，给足超时，避免误判成布局失败。
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message)));

  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  // 路径：首页 →「游戏模式」→ 游戏大厅 →「音游模式」卡片。
  // 大厅里四张卡片都是 button，文本各自带若干行描述，用正则匹配卡片标题所在的那张。
  await page.getByText('游戏模式', { exact: false }).first().click();
  await page.waitForTimeout(900);
  await page.locator('button', { hasText: '字母音游' }).first().click();
  await page.waitForTimeout(2500);

  const shot = async (tag) => {
    await page.screenshot({ path: resolve(OUT, `arena-${vp.name}-${tag}.png`) });
  };
  await shot('waiting');

  // 量测：整页滚动、赛道与右列的几何关系
  const metrics = await page.evaluate(() => {
    const q = (sel) => document.querySelector(sel);
    const rect = (sel) => { const el = q(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.left), y: Math.round(r.top) }; };
    const layout = rect('.arena-layout');
    const stage = rect('.arena-stage');
    const board = rect('.arena-board');
    const field = rect('.rn-field');
    const canvas = q('.rn-stage > canvas');
    const probe = canvas ? {
      judgeRatio: canvas.dataset.judgeRatio,
      farRatio: canvas.dataset.farRatio,
      notes: canvas.dataset.notes,
      lanes: canvas.dataset.lanes,
    } : null;
    return {
      overflowY: document.documentElement.scrollHeight - document.documentElement.clientHeight,
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      layout, stage, board, field, probe,
      ratio: layout && stage && board ? +(stage.w / board.w).toFixed(2) : null,
      fieldAspect: field ? +(field.w / field.h).toFixed(2) : null,
      hasInputPanel: !!q('.arena-input-panel'),
    };
  });

  // 开局后连拍，抓一个方块正在下落的帧
  await page.getByRole('button', { name: /加入音游挑战|单人试练|立即开始/ }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
  await shot('midgame');
  const running = await page.evaluate(() => {
    const canvas = document.querySelector('.rn-stage > canvas');
    return canvas ? { notes: canvas.dataset.notes, judgeRatio: canvas.dataset.judgeRatio, farRatio: canvas.dataset.farRatio } : null;
  });

  // 判定线对齐与布局结构是本轮的验收目标。
  // 「局中方块数」不参与判定：未登录时服务端拒绝入局，赛场上自然没有方块 ——
  // 那是账号态而非布局问题，会误报。方块渲染由 scripts/verify-rhythm-timeline.mjs 单独覆盖。
  const pass =
    metrics.overflowY <= 0 && metrics.overflowX <= 0 &&
    metrics.ratio !== null && metrics.ratio >= 3.5 && metrics.ratio <= 4.6 &&
    metrics.stage.h > metrics.board.h * 0.9 &&
    !metrics.hasInputPanel &&
    running && Math.abs(Number(running.judgeRatio) - 0.86) < 0.06 &&
    Number(running.farRatio) > 0.10 &&
    errors.length === 0;
  if (!pass) failures++;

  rows.push({ vp: vp.name, ...metrics, running, errors: errors.length, pass });
  console.log(`${vp.name}: 滚动Y=${metrics.overflowY} X=${metrics.overflowX} | 赛道 ${metrics.stage.w}×${metrics.stage.h} | 右列 ${metrics.board.w} | 比例 ${metrics.ratio}:1 | 赛道区宽高比 ${metrics.fieldAspect} | 音游无输入面板=${!metrics.hasInputPanel} | 局中方块 ${running?.notes} judge=${running?.judgeRatio} far=${running?.farRatio} | ${pass ? 'PASS' : 'FAIL'}`);
  if (errors.length) console.log('  页面错误:', errors.slice(0, 3).join(' | '));
  await context.close();
}

await browser.close();
console.log(`\n${failures === 0 ? '全部通过' : failures + ' 项未通过'}（截图见 output/arena-*.png）`);
process.exit(failures === 0 ? 0 : 1);
