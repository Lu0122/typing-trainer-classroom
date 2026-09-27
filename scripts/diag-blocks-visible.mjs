// 诊断：方块为什么没画出来。
//
// 现象：canvas.dataset.notes = 9（Vue 层确实把 9 个音符交给舞台了），
//       但截图里看不到任何方块。
//
// 最可疑的是这一轮新加的实例化 UV 属性 aAtlas ——
// 它通过 onBeforeCompile 注入着色器。如果属性名/类型没对上，
// 或者 customProgramCacheKey 让 three 复用了旧程序，
// 方块就可能整批消失（顶点被裁掉或矩阵没生效）。
//
// 本脚本在浏览器里直接读 WebGL 程序的编译状态与实例网格的计数，
// 把「是着色器炸了」还是「是矩阵没写」区分开。
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:3111';
const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));

const login = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'student_db52e21b6c37', password: 'test1234' }),
});
const cookie = (login.headers.getSetCookie?.() || []).map(c => c.split(';')[0]).join('; ');

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await context.addCookies(cookie.split('; ').map(p => {
  const [name, ...v] = p.split('='); return { name, value: v.join('='), domain: '127.0.0.1', path: '/' };
}));
const page = await context.newPage();
const logs = [];
page.on('console', m => logs.push(`${m.type()}: ${m.text()}`));
page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message));

await page.goto(`${BASE}/#rhythm`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
const click = async (re) => {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const b = page.locator('.arena-game button:visible', { hasText: re }).first();
    if (await b.count()) { await b.click({ timeout: 3000 }).catch(() => {}); return; }
    await page.waitForTimeout(250);
  }
};
await click(/加入音游挑战/);
await page.waitForTimeout(1000);
await click(/单人试练|立即开始/);
await page.waitForFunction(async () => {
  try { const d = await (await fetch('/api/arena/rhythm')).json(); return d.phase === 'running' && !!d.chart; }
  catch { return false; }
}, { timeout: 30000 }).catch(() => {});
await page.waitForFunction(() => !document.querySelector('.rn-countdown'), { timeout: 15000 }).catch(() => {});
await page.waitForFunction(() => Number(document.querySelector('.rn-stage > canvas')?.dataset.notes || 0) >= 3, { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(150);

// 读 WebGL 侧的真实现状：程序是否链成功、绘制调用里有多少个实例。
const diag = await page.evaluate(() => {
  const canvas = document.querySelector('.rn-stage canvas');
  const gl = canvas?.getContext('webgl2') || canvas?.getContext('webgl');
  const out = {
    notes: canvas?.dataset.notes,
    judgeRatio: canvas?.dataset.judgeRatio,
    // 画布是否真的被画过内容（全透明说明什么都没渲染）
    contextExists: !!gl,
  };
  if (gl) {
    out.glError = gl.getError();
    out.vendor = gl.getParameter(gl.VENDOR);
    out.version = gl.getParameter(gl.VERSION);
    // 统计当前帧片元着色器有没有因为编译失败而回退成空程序
    out.programs = gl.getParameter(gl.CURRENT_PROGRAM) ? 'has-current' : 'none';
  }
  return out;
});

// 直接读像素：统计画布中央区域的非透明像素比例。
// 方块是亮青色，若为 0 说明确实没画出来。
const pixels = await page.evaluate(async () => {
  const canvas = document.querySelector('.rn-stage canvas');
  const r = canvas.getBoundingClientRect();
  const scale = canvas.width / r.width;
  const tmp = document.createElement('canvas');
  tmp.width = canvas.width; tmp.height = canvas.height;
  const ctx = tmp.getContext('2d');
  ctx.drawImage(canvas, 0, 0);
  const data = ctx.getImageData(0, 0, tmp.width, tmp.height).data;
  let opaque = 0, bright = 0, total = 0;
  // 只统计中央竖直条带（赛道所在处），避开左右空白
  const x0 = Math.floor(tmp.width * 0.3), x1 = Math.floor(tmp.width * 0.7);
  for (let y = 0; y < tmp.height; y += 3) {
    for (let x = x0; x < x1; x += 3) {
      const i = (y * tmp.width + x) * 4;
      const a = data[i + 3];
      total++;
      if (a > 10) opaque++;
      // 方块本体是亮青：G 与 B 都高、R 相对低
      if (data[i + 1] > 110 && data[i + 2] > 110 && a > 120) bright++;
    }
  }
  return { total, opaque, bright, opaquePct: +(opaque / total * 100).toFixed(2), brightPct: +(bright / total * 100).toFixed(2), scale };
});

console.log('舞台状态：', JSON.stringify(diag));
console.log('像素统计：', JSON.stringify(pixels));
console.log('控制台：', logs.length ? logs.slice(0, 8).join('\n  ') : '无');
await browser.close();
