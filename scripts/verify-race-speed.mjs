// 验证竞速赛车改造后的完整链路：
//   速度模型 → 档位 → 距离 → 自动换段 → 冲线 → 排名与胜负一致。
// 通过真实 HTTP 接口驱动，避免「单测过了但接口不对」的盲区。
import { chromium } from 'playwright-core';

const BASE = process.env.BASE || 'http://127.0.0.1:3131';
const login = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'student_db52e21b6c37', password: 'test1234' }),
});
if (!login.ok) { console.log('登录失败', login.status); process.exit(0); }
const cookie = (login.headers.getSetCookie?.() || []).map(c => c.split(';')[0]).join('; ');
const api = async (path = '', body) => {
  // 注意：path 必须给默认值 ''，否则 api() 会拼成 /api/arena/raceundefined 而 404。
  // 另外 /join /start /type /leave 都是 POST，即使不带参数也要显式传 {}；
  // 若把 body 留成 undefined，helper 会退化成 GET，命中 /api 的 404 兜底。
  const r = await fetch(`${BASE}/api/arena/race${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const d = await r.json();
  if (!r.ok) throw Object.assign(new Error(`${path || '<state>'} → ${d.message || 'failed'}`), { status: r.status });
  return d;
};

// 服务端是共享的公共房间：若上一局还在进行中，/join 会返回「本局已开始，可先观战」，
// 此时 st.me 为 null。先轮询等房间回到 waiting（结算后有 15 秒冷却）再报名。
let st = null;
for (let i = 0; i < 120; i++) {
  const probe = await api();
  if (probe.phase === 'waiting') { st = await api('/join', {}); break; }
  await new Promise(r => setTimeout(r, 500));
}
if (!st?.me) { console.log('房间一直不在等待状态，退出'); process.exit(0); }
const seat = st.me.seat;
console.log('已加入 · phase =', st.phase, '· 目标', st.target, '格');

// 等房主开局（单人时即刻开始），否则等集结倒计时走完。
if (st.phase === 'waiting') {
  if (st.host) { try { st = await api('/start', { seat }); } catch {} }
  for (let i = 0; i < 160 && st.phase !== 'running'; i++) {
    await new Promise(r => setTimeout(r, 300));
    st = await api();
  }
}
console.log('开局 · phase =', st.phase);
if (st.phase !== 'running') { console.log('未进入 running，退出'); process.exit(0); }

// 档位表应当下发
console.log('档位表:', st.gears ? `${st.gears.list.length} 档, 表底 ${st.gears.max}` : '✗ 缺失');

// 以约 90 字/分的节奏输入（每 660ms 一个字），直到冲线或超时
const perChar = 660;
const samples = [];
let lastSeq = st.me.task.sequence;
let segJumps = 0;
const t0 = Date.now();

while (Date.now() - t0 < 150000) {
  const me = st.me;
  if (!me || st.phase !== 'running') break;
  const tk = me.task;
  const ch = tk.text[tk.typed.length];
  if (ch) {
    const caret = tk.typed.length;
    st = await api('/type', { seat, ticket: tk.id, text: tk.typed + ch });
  }
  if (st.me?.task.sequence !== lastSeq) { segJumps++; lastSeq = st.me.task.sequence; }
  if (segJumps || samples.length < 3 || samples.length % 20 === 0) {
    samples.push({ seq: st.me?.task.sequence, kmh: st.me?.speedKmh, gear: st.me?.gear, dist: st.me?.distance });
  }
  await new Promise(r => setTimeout(r, perChar));
}

const me = st.me;
console.log('');
console.log('=== 过程采样 ===');
samples.filter((s, i) => i % Math.max(1, Math.floor(samples.length / 8)) === 0)
  .forEach(s => console.log(`  第${s.seq}段  ${String(s.kmh).padStart(3)} km/h  ${s.gear}档  距离 ${s.dist} 格`));
console.log('');
console.log('=== 结果 ===');
console.log('自动换段次数 =', segJumps, '（未调用任何 /next）');
console.log('末速 =', me?.speedKmh, 'km/h  档位 =', me?.gear, '  峰值 =', me?.topSpeedKmh, 'km/h  最高档 =', me?.maxGear);
console.log('前进距离 =', me?.distance, '/', st.target, '格');
console.log('phase =', st.phase, ' outcome =', st.result?.outcome);
if (st.result) {
  console.log('排名:');
  st.result.ranking.forEach(p => console.log(`  第${p.rank}名 ${p.name}  ${p.distance} 格  ${p.speedKmh} km/h  ${p.maxGear}档  得分 ${p.score}`));
  const win = st.result.winners[0];
  const top = st.result.ranking[0];
  console.log('冠军 =', win?.name, '| 榜首 =', top?.name, '→', win && top && win.name === top.name ? '✓ 胜负与排名一致' : '✗ 不一致');
}
await api('/leave', { seat });
