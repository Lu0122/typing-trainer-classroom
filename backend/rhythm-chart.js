// 下落式音游的核心：谱面生成与按键判定。
//
// 设计要点
// - 26 个字母全开放，所以「按哪个键」不由轨道决定，而由「哪个待判定音符离判定线最近且字母匹配」决定。
//   一次请求携带最近若干次按键（{ key, at }），服务端据此逐个对谱面判定。
// - 横向只分四条道。字母按真实键盘的手区/行区分入 0..3 道，同字母恒定同一条道，
//   于是「道」承载两件事：视觉上的纵深分区，以及「这个键该用哪只手」的提示。
//   判定仍然与道位完全无关（只看键盘按键，本游戏不接收触点坐标）。
// - 谱面是纯函数生成的：同一个 seed 一定得到同一份谱面，前端和服务端各自算出完全一致的音符时间轴，
//   因此前端可以把方块画在下落轨迹的正确位置上，服务端则独立完成判定，两边不需要互传整份谱面。
// - 判定只看「按键时刻与音符目标时刻的差值」，与网络往返无关，因为前端上报的是本地按键时间戳
//   （已用服务端下发的时钟偏移换算到服务端时间轴）。

const crypto = require('node:crypto');

// 判定窗口（毫秒）。相对判定线的时间差绝对值。
const JUDGE_PERFECT_MS = 70;   // 完美：±70ms
const JUDGE_GREAT_MS = 130;    // 优秀：±130ms
const JUDGE_GOOD_MS = 210;     // 良好：±210ms
// 超过 GOOD 窗口但仍在「漏键」容限内：不扣分、只断连击；再远则记为漏键（Miss）。
const JUDGE_MISS_MS = 320;

const GRADES = {
  perfect: { score: 300, weight: 1, label: 'PERFECT' },
  great: { score: 200, weight: 0.7, label: 'GREAT' },
  good: { score: 100, weight: 0.4, label: 'GOOD' },
  miss: { score: 0, weight: 0, label: 'MISS' },
};
const GRADE_KEYS = ['perfect', 'great', 'good', 'miss'];

// 谱面节奏参数：BPM 与每小节的音符密度。
const BPM = 112;
const BEAT_MS = Math.round(60000 / BPM);
const BEATS_PER_BAR = 4;

// 音符密度曲线：开局热身、中段加密、高潮后回落，形成难度起伏。
// 数组内是「本小节第几拍（支持半拍）」上有音符。
//
// 三条硬约束：
// 1. 每个方案都要覆盖到小节最后一拍附近，否则谱面尾部会拖出无声空档
//    （相邻小节之间只在「上一小节最后一拍」到「下一小节第 0 拍」处才产生间隔）。
// 2. 每个方案内部不得出现空拍，相邻音符间隔必须统一。
//    如果同一小节里既有整拍又有半拍，间隔就会在 536 / 268 之间横跳，
//    而 268ms 已经低于判定窗口（320ms），玩家几乎来不及分开两次按键。
//    唯一例外：同拍双押（同一拍上两个音符），它们由两只手同时按下，
//    不构成「同一只手来不及分两次」的问题。
// 3. 小节之间不得留空。半速呼吸小节写成 [0, 2] 会让第 2 拍之后空掉一拍半，
//    开局第四拍之后正好踩到这一条，屏幕上会出现约 1.3 秒的空白。
//    所以呼吸小节统一用 [0, 2, 3]，末尾补第 3 拍，收尾间隔仍是 1 拍。
//
// 因此前两小节刻意做成整拍（热身、间隔 536ms），随后切入纯半拍（536 -> 268ms 平滑加速），
// 最后两小节连续 0.5 拍，小节之间的间隔也恰好是 0.5 拍，整段提速不会出现忽快忽慢。
const HALF = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5];
const DENSITY = [
  // 小节按 8 循环：0-2 热身，3-4 常规，5-6 加密，7 高潮
  [0, 1, 2, 3],   // 整拍（间隔 1 拍）
  [0, 2, 3],      // 半速呼吸：第 1 拍休止，末尾补第 3 拍避免小节间留空
  [0, 1, 2, 3],   // 整拍（间隔 1 拍）
  [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], // 半拍（间隔 0.5 拍）
  [0, 1, 2, 3],   // 整拍：与前后半拍小节形成「密—疏—密」的呼吸
  HALF,
  HALF,           // 高潮：连续两小节半拍
  HALF,
];
// 开局第 0 小节专用的拍点序列（单位：拍）。
//
// 方块从顶部落到判定线要走满整个 fallMs，所以「第一个音符的时刻」就等于
// 「第一个方块可以按的时刻」。若首个音符停在 0ms（第 1 拍），玩家开局后要干等
// 近 2 秒才有方块进入可判定区域，屏幕上看着像游戏没加载出来。
//
// 做法：跳过第 0 拍，让第一个音符直接落在「第 0.5 拍」（268ms），
// 之后每半拍一个，全程踩在 0.5 拍网格上，间隔干净均匀。
// 这样首个方块在开局约 0.27s 就已可判定，比原来提前 0.27s，
// 又不会与后续音符撞车。
const OPENING_AT_BEATS = [0.5, 1, 1.5, 2, 2.5, 3, 3.5];
// 首个音符的落地时刻（ms），由上面的拍点换算而来，供前端提示与测试引用。
const OPENING_AT_MS = Math.round(0.5 * BEAT_MS);

// 生成一份确定性谱面。
// seed 由对局 round 派生，保证同一局内所有玩家看到的谱面完全一致。
// 小节数由对局时长反推：durationMs 必须被铺满，否则后半局会没有方块可打。
function buildChart(seed, durationMs) {
  const rng = mulberry32(hashSeed(seed));
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const notes = [];
  const totalBeats = Math.floor(durationMs / BEAT_MS);
  const bars = Math.max(1, Math.floor(totalBeats / BEATS_PER_BAR));
  let lastLetter = '';

  for (let bar = 0; bar < bars; bar++) {
    // 第 0 小节用开场专用的拍点序列，其余小节按密度曲线循环。
    const pattern = bar === 0 ? OPENING_AT_BEATS : DENSITY[(bar - 1) % DENSITY.length];
    for (const offsetBeat of pattern) {
      const at = Math.round((bar * BEATS_PER_BAR + offsetBeat) * BEAT_MS);
      if (at >= durationMs - BEAT_MS) continue;
      let letter = letters[Math.floor(rng() * letters.length)];
      // 连续重复会让玩家无法区分是漏键还是重按，这里强制换一个字母。
      if (letter === lastLetter) letter = letters[(letters.indexOf(letter) + 1 + Math.floor(rng() * 5)) % letters.length];
      lastLetter = letter;
      // 横向位置：按上面的四道分区映射，同一字母恒定落在同一道，
      // 玩家可以建立「该字母属于哪只手、哪条道」的固定印象。
      const lane = LETTER_LANE.get(letter);
      notes.push({ id: notes.length, letter, at, lane });
    }
  }
  // 按时间排序后回填自增 id，保证判定时按下标推进。
  notes.sort((a, b) => a.at - b.at || a.lane - b.lane);
  notes.forEach((note, index) => { note.id = index; });
  return { seed, bpm: BPM, beatMs: BEAT_MS, totalBeats, bars, notes, durationMs };
}

// 四道布局：26 个字母按真实键盘的「手区 + 行区」映射到 0..3 道。
//
// 分区规则（左手在左两道、右手在右两道；上排在各自一侧的上方）：
//   道 0（左上）  Q W E R T
//   道 1（左下）  A S D F G / Z X C V B
//   道 2（右上）  Y U I O P
//   道 3（右下）  H J K L / N M
//
// 每个字母恒定落在同一条道，于是「道」同时承担两件事：视觉上的纵深分区，
// 以及「这个键该用哪只手、大致在键盘哪个方位」的提示。
// 判定仍与道位完全无关（只看按键时刻与音符时刻的差值），所以分区按教学直觉划分即可。
const LANE_LAYOUT = ['QWERT', 'ASDFGZXCVB', 'YUIOP', 'HJKLNM'];
const LANE_LABELS = ['左上', '左下', '右上', '右下'];
const LANE_COUNT = LANE_LAYOUT.length;
// 字面量校验：26 个字母必须不重不漏地落在四条道上（漏一个就会在 buildChart 里拿到 undefined 道位）。
const LETTER_LANE = new Map();
LANE_LAYOUT.forEach((keys, lane) => { for (const key of keys) LETTER_LANE.set(key, lane); });
for (let i = 0; i < 26; i++) {
  const letter = String.fromCharCode(65 + i);
  if (!LETTER_LANE.has(letter)) throw new Error(`四道分区遗漏字母 ${letter}`);
}

// 判定单个按键落在哪个音符上。
// resolved 是本次对局已经判定掉的音符 id 集合（含同一批次内刚判过的），
// 这样同一批次里的连续按键可以各自命中相邻音符，而不会反复选中同一个。
// 返回 { note, grade, offsetMs }，找不到可判定的音符时返回 null。
function judgeKey(chart, cursor, key, at, resolved, windows = {}) {
  const perfectMs = windows.perfectMs ?? JUDGE_PERFECT_MS;
  const greatMs = windows.greatMs ?? JUDGE_GREAT_MS;
  const goodMs = windows.goodMs ?? JUDGE_GOOD_MS;
  const missMs = windows.missMs ?? JUDGE_MISS_MS;
  const upper = String(key || '').toUpperCase();
  if (!/^[A-Z]$/.test(upper)) return null;
  let best = null;
  // 向后看有限个音符：判定窗口很窄，玩家不可能跨太多音符命中。
  for (let i = cursor; i < chart.notes.length && i < cursor + 12; i++) {
    const note = chart.notes[i];
    const delta = at - note.at;
    if (delta > missMs) continue;             // 这个音符已经过去太久了
    if (delta < -goodMs - 40) break;          // 还没到能判定的时间范围
    if (resolved?.has(note.id)) continue;     // 同一批次内已经判过，跳过
    if (note.letter !== upper) continue;
    const offset = Math.abs(delta);
    if (offset > goodMs) continue;
    if (!best || offset < best.offsetMs) best = { note, offsetMs: offset };
  }
  if (!best) return null;
  const grade = best.offsetMs <= perfectMs ? 'perfect'
    : best.offsetMs <= greatMs ? 'great'
      : 'good';
  return { note: best.note, grade, offsetMs: best.offsetMs };
}

// 把已经越过失键容限、尚未被击中的音符结算为漏键。
// 返回本次新产生的漏键列表。
function expireNotes(chart, cursor, at, resolved, windows = {}) {
  const missMs = windows.missMs ?? JUDGE_MISS_MS;
  const missed = [];
  let i = cursor;
  while (i < chart.notes.length && at - chart.notes[i].at > missMs) {
    if (!resolved.has(chart.notes[i].id)) missed.push(chart.notes[i]);
    i++;
  }
  return { missed, nextCursor: i };
}

// 准确率：按判定等级加权。Perfect 记 100%，Great 70%，Good 40%，Miss 0%。
function accuracyOf(counts) {
  const total = counts.perfect + counts.great + counts.good + counts.miss;
  if (!total) return 100;
  const weighted = counts.perfect + counts.great * GRADES.great.weight + counts.good * GRADES.good.weight;
  return Math.round(weighted / total * 100);
}

// 得分倍率：连击越高倍率越高，断连击回到 1。
function comboMultiplier(combo) {
  if (combo >= 100) return 3;
  if (combo >= 60) return 2.5;
  if (combo >= 30) return 2;
  if (combo >= 15) return 1.5;
  if (combo >= 5) return 1.2;
  return 1;
}

function hashSeed(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

module.exports = {
  buildChart, judgeKey, expireNotes, accuracyOf, comboMultiplier, GRADE_KEYS,
  JUDGE_PERFECT_MS, JUDGE_GREAT_MS, JUDGE_GOOD_MS, JUDGE_MISS_MS, GRADES,
  BEAT_MS, BPM, BEATS_PER_BAR, LANE_COUNT, LANE_LAYOUT, LANE_LABELS, LETTER_LANE, OPENING_AT_MS, DENSITY,
};
