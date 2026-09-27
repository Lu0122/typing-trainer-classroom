// 量一下游戏页在 100vh 内到底超了多少，以及各区块占多高。
// 目的：找出「页面要滚动」的具体来源，而不是凭感觉压缩。
import { chromium } from 'playwright-core';

const BASE = process.env.BASE || 'http://127.0.0.1:3131';
const HOST = new URL(BASE).hostname;
const login = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'student_db52e21b6c37', password: 'test1234' }),
});
if (!login.ok) { console.log('login failed', login.status); process.exit(0); }
const cookie = (login.headers.getSetCookie?.() || []).map(c => c.split(';')[0]).join('; ');

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addCookies(cookie.split('; ').map(p => {
  const [name, ...v] = p.split('='); return { name, value: v.join('='), domain: HOST, path: '/' };
}));

const sizes = [
  { w: 1440, h: 900, label: '1440x900 常见笔记本' },
  { w: 1366, h: 768, label: '1366x768 教室机' },
  { w: 1920, h: 1080, label: '1920x1080 台式' },
  { w: 1280, h: 720, label: '1280x720 最小的投影' },
];

const measure = async (mode, size) => {
  const page = await context.newPage();
  await page.setViewportSize({ width: size.w, height: size.h });
  await page.goto(`${BASE}/#${mode}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const out = await page.evaluate(() => {
    const rect = sel => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { h: Math.round(r.height), top: Math.round(r.top), bottom: Math.round(r.bottom) }; };
    return {
      innerHeight: window.innerHeight,
      scrollHeight: document.documentElement.scrollHeight,
      bodyScroll: document.body.scrollHeight,
      header: rect('.arena-header'),
      layout: rect('.arena-layout'),
      stage: rect('.arena-stage'),
      board: rect('.arena-board'),
      input: rect('.arena-input-panel'),
      field: rect('.rn-field'),
      tracks: rect('.arena-tracks'),
      // 音游舞台内部的逐项高度，用来定位「谁把轨道挤扁了」
      stageHeader: rect('.arena-stage > header'),
      rn: rect('.rn'),
      rnStats: rect('.rn-stats'),
      rnFoot: rect('.rn-foot'),
      rnKeyboard: rect('.rn-keyboard'),
      rnLegend: rect('.rn-legend'),
      feedback: rect('.arena-hit-feedback'),
      trackNote: rect('.arena-track-note'),
      // 赛车专属：仪表盘 / 档位 / 赛道 / 速度表容器
      rb: rect('.rb'),
      rbDash: rect('.rb-dash'),
      rbGauge: rect('.rb-gauge'),
      rbGearbox: rect('.rb-gearbox'),
      rbTrack: rect('.rb-track'),
    };
  });
  await page.close();
  return out;
};

for (const mode of ['rhythm', 'race']) {
  console.log(`\n===== ${mode} =====`);
  for (const size of sizes) {
    const m = await measure(mode, size);
    const over = m.scrollHeight - m.innerHeight;
    console.log(`\n${size.label}  (${size.w}x${size.h})`);
    console.log(`  需要滚动: ${over > 0 ? '是' : '否'}  超出 ${over}px   (scrollHeight=${m.scrollHeight} / innerHeight=${m.innerHeight})`);
    console.log(`  header ${m.header?.h}  layout ${m.layout?.h}  stage ${m.stage?.h}  board ${m.board?.h}  input ${m.input?.h}`);
    if (m.field) {
      console.log(`  音游轨道 ${m.field.h}px   赛道 ${m.tracks?.h ?? '-'}`);
      console.log(`  [舞台内部] stageHeader ${m.stageHeader?.h}  rn ${m.rn?.h}  stats ${m.rnStats?.h}  foot ${m.rnFoot?.h}  键盘 ${m.rnKeyboard?.h}  legend ${m.rnLegend?.h}  提示条 ${m.feedback?.h}  说明 ${m.trackNote?.h}`);
    }
    if (m.rb) {
      console.log(`  仪表盘 ${m.rbDash?.h}px  表盘 ${m.rbGauge?.h}px  档位 ${m.rbGearbox?.h}px  赛道 ${m.rbTrack?.h}px`);
    }
    console.log(`  最低元素底部: ${Math.max(m.stage?.bottom ?? 0, m.input?.bottom ?? 0)}`);
  }
}
await browser.close();
