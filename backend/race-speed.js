// 赛车模式的速度与档位模型。
//
// 设计意图：把「打对多少字」这个计数，换成「开得多快」这个状态。
//   速度是连续量，有惯性（加速要时间）、有阻力（松手会掉速），
//   于是玩家能感受到「飙起来」和「掉速」——这是打字练习里没有的手感。
//
// 全部是纯函数，不依赖房间状态，便于单测与复用。

// ── 车速标定 ────────────────────────────────────────────────────
// 速度单位用 km/h，只作为显示与手感，不直接等于距离。
// 标定基准：一名熟练学生用中文输入法打熟悉的短句，约 60~90 字/分；
// 高手可以到 120 字/分以上。于是把 60 字/分定在 3 档巡航，
// 120 字/分以上能打满 6 档，形成明确的成长空间。
const SPEED_MIN = 0;         // 完全停住
const SPEED_MAX = 320;       // 表底，超过按表底显示（避免仪表盘爆表）
// 目标车速 = 打字速度(字/秒) × 系数 + 怠速。
// 注意单位是「字/秒」而不是「字/分」，标定时务必按字/秒换算：
//   60 字/分 = 1.0 字/秒 → 1.0×130 + 40 = 170 km/h（约 3 档巡航）
//   100 字/分 = 1.67 字/秒 → 257 km/h（5 档）
//   130 字/分 = 2.17 字/秒 → 322 → 封顶 320（6 档极速）
// 这样一个熟练学生自然落在 3~4 档，冲满 6 档需要明显提速，成长空间清晰。
const CPS_TO_KMH = 130;
const IDLE_KMH = 40;

// 加减速的「惯性」参数（单位：km/h 每秒）。
// 加速慢、减速快，符合真实车辆，也让「断连击」的代价立刻可感。
const ACCEL_KMH_PER_S = 90;   // 连对时向目标速度逼近的速率
const BRAKE_KMH_PER_S = 150;  // 打错时的减速速率
const COAST_KMH_PER_S = 55;   // 松手滑行的自然减速

// ── 六档变速箱 ──────────────────────────────────────────────────
// 档位由车速决定，倍率是「每字得分」的放大系数。
// 高速高风险：档位越高，一次打错掉的档越多，但稳定的高速收益显著。
const GEARS = [
  { gear: 1, at: 0, multiplier: 1.0, label: '起步' },
  { gear: 2, at: 60, multiplier: 1.2, label: '提速' },
  { gear: 3, at: 130, multiplier: 1.5, label: '巡航' },
  { gear: 4, at: 195, multiplier: 2.0, label: '快跑' },
  { gear: 5, at: 250, multiplier: 2.5, label: '飞驰' },
  { gear: 6, at: 300, multiplier: 3.0, label: '极速' },
];

// 档位上限：只能通过持续打对字「升档」，但档位本身是车速的函数，
// 掉速自然掉档。这样「档位」不需要额外状态，永远和车速一致，不会出现状态不同步。
function gearOf(speed) {
  let current = GEARS[0];
  for (const g of GEARS) if (speed >= g.at) current = g;
  return current;
}
function gearMultiplier(speed) { return gearOf(speed).multiplier; }

// ── 打字速度滑动窗口 ────────────────────────────────────────────
// 用最近 WINDOW_MS 内的正确字数估实时速度，而不是全程平均：
// 全程平均会让「前期慢」一直拖着后期，玩家永远感受不到提速。
const WINDOW_MS = 6000;
// 记录每次正确输入的时刻，裁掉窗口外的事件后换算成「字/分」。
// 窗口内事件不足时按实际跨度折算，并给一个下限跨度避免开头爆出一个极高的假速度。
function typingSpeed(events, now, { windowMs = WINDOW_MS } = {}) {
  const recent = events.filter(at => now - at <= windowMs);
  if (recent.length < 2) return 0;
  const span = Math.max(now - recent[0], Math.min(windowMs, 1500));
  return recent.length / span * 60000;
}

// ── 主推进函数 ──────────────────────────────────────────────────
// 把「距上次推进的一段时间」按惯性推向目标速度。
// 返回新的车速，调用方负责把车速积分成距离。
//
// 关键：这里不直接「跳到」目标速度，而是按 dt 逼近。
// 直接跳会让速度随每次按键阶跃抖动，仪表盘看起来像坏了；
// 按惯性逼近才有指针缓缓推上去的手感。
function approachSpeed(current, target, dtMs, { coasting = false } = {}) {
  const dt = Math.max(0, dtMs) / 1000;
  if (dt === 0) return current;
  const rate = coasting ? COAST_KMH_PER_S : (target >= current ? ACCEL_KMH_PER_S : BRAKE_KMH_PER_S);
  const step = rate * dt;
  const delta = target - current;
  if (Math.abs(delta) <= step) return target;
  return current + Math.sign(delta) * step;
}

// 目标车速：由实时打字速度决定。
// 停止输入时目标不会立刻归零（那是滑行），所以目标本身有一个怠速下限，
// 「滑行」通过 coasting 分支单独处理。
function targetSpeed(typingCpm) {
  const raw = typingCpm / 60 * CPS_TO_KMH + IDLE_KMH;
  return Math.max(SPEED_MIN, Math.min(SPEED_MAX, raw));
}

// 距离推进：速度对时间积分。
// 系数标定目标——让「160 格」是一个真要跑满全程才到的目标：
//   80 字/分（4 档巡航 ~216 km/h）跑满 120 秒应略超 160 格，
//   慢速玩家（40 字/分）则应在时限内跑不完全程，靠排名分胜负。
// 216 km/h × 系数 × 120s ≈ 165 → 系数 ≈ 0.0064。
// 系数再大就会「人人提前冲线」，2 分钟的时限形同虚设。
const KMH_TO_CELLS_PER_S = 0.0064;
function advanceDistance(distance, speed, dtMs) {
  return distance + speed * KMH_TO_CELLS_PER_S * (Math.max(0, dtMs) / 1000);
}

module.exports = {
  SPEED_MIN, SPEED_MAX, CPS_TO_KMH, IDLE_KMH,
  ACCEL_KMH_PER_S, BRAKE_KMH_PER_S, COAST_KMH_PER_S,
  GEARS, gearOf, gearMultiplier,
  WINDOW_MS, typingSpeed,
  approachSpeed, targetSpeed, advanceDistance, KMH_TO_CELLS_PER_S,
};
