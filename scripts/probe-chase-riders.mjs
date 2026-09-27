// 探针：在真实页面上量「警察 / 小偷」两名骑手的屏幕位置，并判断是否落在深色路面带上。
// 通过 mock /api/auth/me 与 /api/chase 直接渲染指定局面，不写数据库。
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';

const base = process.env.CHASE_BASE || 'http://127.0.0.1:3000';
const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p => existsSync(p));

const TRACK = 520, HEADSTART = Number(process.env.CHASE_HEADSTART || 16);
let payload = null;
function buildState({ policePos, thiefPos, phase = 'running', result = null }) {
  const now = Date.now();
  const player = (role, pos) => ({
    id: role, seat: role, name: role === 'police' ? '警察' : '小偷', avatarUrl: null, role, bot: false,
    correct: 0, attempted: 0, wrong: 0, accuracy: 100, combo: 0, bestCombo: 0, score: 0, speedKmh: 40,
    distance: role === 'thief' ? pos - HEADSTART : pos, position: pos, progress: Math.round(pos / TRACK * 1000) / 10,
    sequence: 1, task: role === 'police' ? { id: 't1', sequence: 1, text: 'Practice makes perfect, and typing makes you faster.', typed: '' } : null, rank: 1
  });
  const players = [player('police', policePos), player('thief', thiefPos)];
  return {
    code: '5101', round: 'probe', phase, host: 'police', startsAt: now, startedAt: now,
    endsAt: phase === 'finished' ? now : now + 60_000, serverNow: now, remainingMs: 60_000, durationMs: 120_000, trackMeters: TRACK, thiefHeadstart: HEADSTART,
    players, me: players[0], result, events: [{ id: 1, text: '出发！警察开始追捕', at: now }]
  };
}

const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
payload = buildState({ policePos: 0, thiefPos: HEADSTART });
await page.route('**/api/auth/me', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ authenticated: true, user: { id: 1, username: 'probe', displayName: '探针', avatarUrl: null, isAdmin: false } }) }));
await page.route('**/api/chase**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) }));
await page.goto(`${base}/`, { waitUntil: 'networkidle' });
await page.getByText('游戏模式', { exact: false }).first().click();
await page.waitForTimeout(700);
await page.getByText('生死时速', { exact: false }).first().click();
await page.waitForTimeout(1500);

async function ridersAt(policePos, thiefPos, extra = {}) {
  payload = buildState({ policePos, thiefPos, ...extra });
  await page.waitForTimeout(1600); // 等 650ms 轮询 + 550ms 位移过渡
  return page.evaluate(() => {
    const track = document.querySelector('.chase-track').getBoundingClientRect();
    const box = document.querySelector('.chase-world').getBoundingClientRect();
    return {
      world: { w: Math.round(box.width), h: Math.round(box.height) },
      riders: [...document.querySelectorAll('.chase-rider')].map(r => {
        const rect = r.getBoundingClientRect();
        return {
          role: r.classList.contains('police') ? 'police' : 'thief',
          x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2),
          w: Math.round(rect.width), h: Math.round(rect.height),
          pxInWorld: [Math.round(rect.x + rect.width / 2 - box.x), Math.round(rect.y + rect.height / 2 - box.y)],
          trackOffset: [Math.round(track.width), Math.round(track.height), Math.round(track.x - box.x), Math.round(track.y - box.y)]
        };
      })
    };
  });
}
async function sampleLuma(points) {
  const shot = await page.screenshot({ type: 'png' });
  return page.evaluate(async ([b64, pts]) => {
    const img = new Image();
    await new Promise(res => { img.onload = res; img.src = 'data:image/png;base64,' + b64; });
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
    return pts.map(([x, y]) => {
      const d = ctx.getImageData(x, y, 1, 1).data;
      return { at: [x, y], rgb: [d[0], d[1], d[2]], luma: Math.round(0.2126 * d[0] + 0.7152 * d[1] + 0.0722 * d[2]) };
    });
  }, [shot.toString('base64'), points]);
}
async function roadBand() {
  const shot = await page.screenshot({ type: 'png' });
  return page.evaluate(async (b64) => {
    const img = new Image();
    await new Promise(res => { img.onload = res; img.src = 'data:image/png;base64,' + b64; });
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
    const lum = (x, y) => { const d = ctx.getImageData(x, y, 1, 1).data; return 0.2126 * d[0] + 0.7152 * d[1] + 0.0722 * d[2]; };
    const scan = (fixed, vertical) => {
      const runs = []; let start = null;
      for (let i = 0; i < (vertical ? c.height : c.width); i++) {
        const x = vertical ? fixed : i, y = vertical ? i : fixed;
        const dark = lum(x, y) < 70;
        if (dark && start === null) start = i;
        if (!dark && start !== null) { if (i - start > 8) runs.push([start, i - 1]); start = null; }
      }
      if (start !== null) runs.push([start, (vertical ? c.height : c.width) - 1]);
      return runs;
    };
    return { size: [c.width, c.height], verticalMid: scan(Math.round(c.width / 2), true), horizontalMid: scan(Math.round(c.height / 2), false) };
  }, shot.toString('base64'));
}

async function geometry() {
  const rects = await page.evaluate(() => {
    const info = {};
    for (const sel of ['.chase-world', '.chase-track', '.chase-track-outline']) {
      const el = document.querySelector(sel);
      const r = el?.getBoundingClientRect();
      info[sel] = r ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } : null;
    }
    return info;
  });
  const shot = await page.screenshot({ type: 'png' });
  const profiles = await page.evaluate(async (b64) => {
    const img = new Image();
    await new Promise(res => { img.onload = res; img.src = 'data:image/png;base64,' + b64; });
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
    const lum = (x, y) => { const d = ctx.getImageData(x, y, 1, 1).data; return Math.round(0.2126 * d[0] + 0.7152 * d[1] + 0.0722 * d[2]); };
    const vertical = [], horizontal = [];
    for (let y = 120; y <= 420; y += 10) vertical.push(`${y}:${lum(720, y)}`);
    for (let x = 160; x <= 1280; x += 20) horizontal.push(`${x}:${lum(x, 450)}`);
    const dark = (v) => { const out = []; let s = null; v.forEach(([pos, l]) => { if (l < 70 && s === null) s = pos; if (l >= 70 && s !== null) { if (pos - s >= 8) out.push([s, pos - 10]); s = null; } }); return out; };
    const parse = arr => arr.map(t => t.split(':').map(Number));
    return {
      verticalDark: dark(parse(vertical)), horizontalDark: dark(parse(horizontal)),
      vertical: vertical.join(' '), horizontal: horizontal.join(' ')
    };
  }, shot.toString('base64'));
  return { rects, profiles };
}

console.log('元素几何：', JSON.stringify((await geometry()).rects));
console.log('深色区间 竖向x=720：', JSON.stringify((await geometry()).profiles.verticalDark), ' 横向y=450：', JSON.stringify((await geometry()).profiles.horizontalDark));
console.log('视口/容器与深色路面带(暗区区间)：', JSON.stringify(await roadBand()));
const band = await roadBand();
const cy = band.size[1] / 2, cx = band.size[0] / 2;
const rowY = 450;
const mid = await ridersAt(0, HEADSTART);
console.log('世界尺寸与赛道偏移：', JSON.stringify(mid.riders[0].trackOffset), JSON.stringify(mid.world));
console.log('\n警察沿环道一周（position -> 屏幕坐标，及该点是否为深色路面）：');
const lumaPoints = [];
const ring = [];
for (const p of [0, 65, 130, 195, 260, 325, 390, 455]) {
  const data = await ridersAt(p, HEADSTART);
  const police = data.riders.find(r => r.role === 'police');
  ring.push({ p, police });
  lumaPoints.push(police.pxInWorld);
}
const lumas = await sampleLuma(lumaPoints);
ring.forEach((item, i) => console.log(`  position=${String(item.p).padStart(3)} -> 屏幕(${String(item.police.x).padStart(4)},${String(item.police.y).padStart(3)}) 世界(${String(item.police.pxInWorld[0]).padStart(4)},${String(item.police.pxInWorld[1]).padStart(3)}) 亮度=${String(lumas[i].luma).padStart(3)} ${lumas[i].luma < 70 ? '沥青' : '非路面'}`));

const start = await ridersAt(0, HEADSTART);
const police = start.riders.find(r => r.role === 'police'), thief = start.riders.find(r => r.role === 'thief');
console.log(`\n开局：警察(${police.x},${police.y}) 小偷(${thief.x},${thief.y}) 间距=${Math.round(Math.hypot(police.x - thief.x, police.y - thief.y))}px`);
await page.screenshot({ path: 'output/chase-start.png' });
const caught = await ridersAt(67.5, 66.9);
const p2 = caught.riders.find(r => r.role === 'police'), t2 = caught.riders.find(r => r.role === 'thief');
console.log(`判定追上(位置 67.5 vs 66.9)：警察(${p2.x},${p2.y}) 小偷(${t2.x},${t2.y}) 间距=${Math.round(Math.hypot(p2.x - t2.x, p2.y - t2.y))}px`);
await page.screenshot({ path: 'output/chase-caught.png' });
const far = await ridersAt(400, 16);
const p3 = far.riders.find(r => r.role === 'police'), t3 = far.riders.find(r => r.role === 'thief');
console.log(`警察落后很多(位置 400 vs 16)：间距=${Math.round(Math.hypot(p3.x - t3.x, p3.y - t3.y))}px`);
const now = Date.now();
const finished = await ridersAt(80, 120, {
  phase: 'finished',
  result: { outcome: 'escaped', winnerRole: 'thief', endedAt: now, durationMs: 120_000, players: [], retired: [] }
});
const resultText = await page.evaluate(() => document.querySelector('.chase-result')?.innerText.replace(/\n/g, ' | '));
console.log('两分钟到点、小偷在前时的结算面板：', resultText);
await page.screenshot({ path: 'output/chase-escaped.png' });
await ridersAt(80, 120, {
  phase: 'finished',
  result: { outcome: 'caught', winnerRole: 'police', endedAt: now, durationMs: 62_000, players: [], retired: [] }
});
console.log('警察追上时的结算面板：', await page.evaluate(() => document.querySelector('.chase-result')?.innerText.replace(/\n/g, ' | ')));
await ridersAt(0, HEADSTART, {
  phase: 'finished',
  result: { outcome: 'caught', winnerRole: 'police', endedAt: now, durationMs: 30_000, players: [], retired: [], left: true }
});
console.log('对手掉线时的结算面板：', await page.evaluate(() => document.querySelector('.chase-result')?.innerText.replace(/\n/g, ' | ')));
await page.screenshot({ path: 'output/probe-chase-riders.png' });
await browser.close();
