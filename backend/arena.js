const crypto = require('node:crypto');
const { LESSONS } = require('./boss');
const { buildChart, judgeKey, expireNotes, accuracyOf, comboMultiplier, GRADE_KEYS, GRADES,
  JUDGE_PERFECT_MS, JUDGE_GREAT_MS, JUDGE_GOOD_MS, JUDGE_MISS_MS, LANE_COUNT, LANE_LAYOUT, LANE_LABELS, BEAT_MS, BPM } = require('./rhythm-chart');
const { SPEED_MAX, GEARS, gearOf, typingSpeed, approachSpeed, targetSpeed, advanceDistance, WINDOW_MS } = require('./race-speed');

const MODES = {
  // 赛车：4 人一间的小房间。autoMatch 表示打开页面（GET state）时自动匹配进房，
  // 课堂场景里学生不需要先点「加入」，进页面即组队开跑。
  race: { title: '打字赛车', durationMs: 120000, target: 160, capacity: 4, autoMatch: true },
  rhythm: { title: '字母音游', durationMs: 90000, target: null, capacity: 60, autoMatch: false }
};
const GATHER_MS = 20000, OFFLINE_MS = 20000, RESULT_MS = 15000;
// 旧版满员自动发车的兼容常量；赛车现由房主手动触发 10 秒发车流程。
const FULL_ROOM_START_MS = 3000;
// 房主点击开始后只保留一次 5 秒倒计时。
const RACE_PREPARE_MS = 0, RACE_COUNTDOWN_MS = 5000, RACE_LAUNCH_MS = RACE_COUNTDOWN_MS;

// 音游模式：谱面由 buildChart 按对局 round 确定性生成，前端与服务端各算一份，不必互传。
const RHYTHM_LEAD_MS = 3000;      // 真正开赛前的准备倒计时，期间不下发音符
// 方块从出现到抵达判定线的下落时长（前端据此定位）。
// 这是「反应时间」的核心参数：太长则屏幕太空、节奏感弱；太短则新手来不及看清字母。
// 112 BPM（半拍 268ms）下，2600ms 大约让 8~10 个方块同屏，
// 既保留「一眼看出下一个要按什么」的预读空间，也不至于挤压判定。
const RHYTHM_FALL_MS = 2600;
// 难度按玩家独立保存：共用同一份谱面，但每个人可选择自己的下落时间与判定窗口。
const RHYTHM_DIFFICULTIES = {
  easy: { id: 'easy', label: '简单', fallMs: 6800, perfectMs: JUDGE_PERFECT_MS, greatMs: 190, goodMs: 300, missMs: 430 },
  normal: { id: 'normal', label: '普通', fallMs: RHYTHM_FALL_MS, perfectMs: JUDGE_PERFECT_MS, greatMs: JUDGE_GREAT_MS, goodMs: JUDGE_GOOD_MS, missMs: JUDGE_MISS_MS },
  hard: { id: 'hard', label: '困难', fallMs: 1900, perfectMs: 50, greatMs: 95, goodMs: 150, missMs: 240 },
};
const RHYTHM_KEYS_MAX = 32;       // 单次请求最多携带的按键数量，防止刷分
const RHYTHM_FUTURE_TOLERANCE_MS = 250;
// 常态漏键结算的「上报周期余量」。
// 前端每秒轮询一次，并把这一秒内按下的键攒成一个批次上报；轮询（read）与按键（write）
// 是两个独立请求，read 经常先到。批次本身也可能覆盖好几秒的按键。
// 如果结算线贴着当前时刻走，那些「已经按下但还没上报」的音符会在判定前被算成漏键。
// 因此常态结算只处理「明显已经过时」的音符：留出的余量大于一次典型批次的跨度，
// 剩下的交给 press 按每个按键自己的时间戳精确结算。
// 这样既保证发呆/掉线的玩家会被记为漏键，又不会误伤正常游玩。
const RHYTHM_SETTLE_GRACE_MS = 6000;

// 赛车模式：打字速度 → 车速 → 前进距离（模型见 race-speed.js）。
// 连对提速、错字减速，档位由车速决定，档位倍率放大每字得分。
// 错字同时「回退一档」——比单纯掉速更有痛感，也更容易被玩家理解（「降档了」）。
const RACE_WRONG_SPEED_FACTOR = 0.62;  // 错字后车速直接乘以该系数
// 纠错：把错字删掉重打（退格）不计过错，但也不给速度奖励。
// 「纯纠错输入」= 只包含退格与重打正确字，不引入新的正确进度。

const multiplier = combo => combo >= 60 ? 3 : combo >= 30 ? 2 : combo >= 10 ? 1.5 : 1;

class ArenaRoom {
  constructor(mode, { now = Date.now, record = () => {}, save = () => {} } = {}) {
    if (!MODES[mode]) throw new Error('Unknown arena mode');
    this.mode = mode; this.rules = MODES[mode]; this.now = now; this.record = record; this.save = save;
    // 房间号由分配方（installArena 的房间池）设置，跨局保持不变，用于界面展示「房间: 1024」。
    this.no = null;
    this.reset();
  }
  reset() {
    this.round = crypto.randomUUID(); this.phase = 'waiting'; this.players = new Map(); this.retired = [];
    this.host = null; this.startsAt = null; this.launchRequestedAt = null; this.startedAt = null; this.endsAt = null; this.result = null;
    this.chart = null;
  }
  fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
  tick() {
    if (this.phase === 'finished') { if (this.now() >= this.result.endedAt + RESULT_MS) this.reset(); return; }
    if (this.phase === 'running' && this.now() >= this.endsAt) { this.finish('timeout'); return; }
    for (const p of this.players.values()) if (this.now() - p.seen > OFFLINE_MS) this.remove(p);
    // 常态结算漏键：玩家长时间不按键（发呆、掉线回来、整段空窗）时，过期音符要判成漏键，
    // 否则只有按下一次键才会结算，成绩会虚高。
    //
    // 结算线必须留出充足余量，不能贴着当前 elapsed 走：
    // 前端每秒轮询一次并把这一秒内的按键攒成批次上报，read（state）与 write（press）
    // 是两个独立请求，state 常常先于 press 到达；批次本身也可能覆盖好几秒的按键。
    // 若按当前 elapsed 结算，还没上报的那批按键对应的音符会在判定前就被算成漏键。
    // 所以这里只结算「明显过时」的音符，精确结算交给 press 按每个按键自己的时间戳完成。
    if (this.mode === 'rhythm' && this.phase === 'running' && this.startedAt !== null) {
      const sweepAt = Math.max(0, this.now() - this.startedAt) - RHYTHM_SETTLE_GRACE_MS;
      if (sweepAt > 0) {
        for (const p of this.players.values()) {
          if (p.chart && sweepAt > p.lastKeyAt) this.settleMisses(p, sweepAt);
        }
      }
    }
    // 赛车：即使玩家一个键都不按，速度也要随时间推进（滑行减速）。
    // 否则「停手」不会掉速，速度模型就退化成「只要按过就一直满速」。
    if (this.mode === 'race' && this.phase === 'running') {
      for (const p of this.players.values()) this.advanceSpeed(p, this.now());
    }
    if (!this.players.has(this.host)) this.host = this.players.keys().next().value ?? null;
    if (!this.players.size) {
      if (this.phase === 'running') this.finish('all_left');
      else { this.startsAt = null; this.launchRequestedAt = null; }
    } else if (this.phase === 'waiting' && this.startsAt !== null && this.now() >= this.startsAt) this.begin();
  }
  join(user) {
    this.tick();
    let p = this.players.get(user.id);
    if (!p) {
      if (this.phase !== 'waiting') this.fail('本局已开始，可先观战，下一局再加入', 409);
      if (this.players.size >= this.rules.capacity) this.fail(`房间已满，最多 ${this.rules.capacity} 人`, 409);
      // lane 是稳定的道位编号（按加入顺序），前端用它固定每个人的车色；
      // 车道行按名次排序，但颜色跟人走，超车时认的是车不是道。
      p = { id: user.id, name: user.displayName, avatarUrl: user.avatarUrl || null, seat: crypto.randomUUID(),
        lane: this.players.size % 4, seen: this.now(), correct: 0, attempted: 0, combo: 0, bestCombo: 0, score: 0, sequence: 1,
        task: null, lastAdvance: null, lastSaved: 0,
        beatHits: 0, perfectHits: 0, beatStreak: 0, bestBeatStreak: 0, lastBeatGrade: '', lastBeatId: 0,
        // 赛车模式专用：车速 / 距离 / 打字速度窗口。
        //   speed    当前车速（km/h），有惯性，由 typingSpeed() 算出的目标速度逼近
        //   distance 速度对时间积分得到的前进格数，是排名与胜负的唯一依据
        //   gear     当前档位（由 speed 推导，不单独维护，避免状态不同步）
        //   maxGear  本局达到过的最高档，结算时展示
        //   hitTimes 最近若干次「打对字」的时刻，用于估算实时打字速度
        //   lastSpeedAt 上次推进速度的时刻，用于把 tick 之间的空档也积分进距离
        speed: 0, distance: 0, gear: 1, maxGear: 1, hitTimes: [], lastSpeedAt: null, topSpeed: 0, ready: false,
        // 音游模式专用：游标指向下一个待判定音符，counts 记录各判定等级数量。
        chart: null, cursor: 0, resolved: null, lastKeyAt: 0,
        counts: { perfect: 0, great: 0, good: 0, miss: 0 }, lastGrade: '', lastGradeId: 0, lastOffsetMs: 0,
        difficulty: 'easy' };
      this.players.set(p.id, p);
    }
    p.seen = this.now();
    if (this.host === null) this.host = p.id;
    // 赛车由房主手动发车；音游仍保留集结后自动开始。
    if (this.mode !== 'race' && this.startsAt === null && this.phase === 'waiting') this.startsAt = this.now() + GATHER_MS;
    return this.state(user.id);
  }
  begin() {
    this.phase = 'running'; this.startedAt = this.now(); this.endsAt = this.now() + this.rules.durationMs;
    // 音游谱面按对局 round 生成，同局所有玩家共享同一份，无需网络传输。
    const chart = this.mode === 'rhythm'
      ? buildChart(this.round, this.rules.durationMs)
      : null;
    // 各难度在 chartForDifficulty 中按自己的下落时长后移谱面。
    // 简单档把谱面密度降至四分之一：减少音符数量，同时留出更长的下落反应时间。
    // this.chart 仍代表默认简单谱面，保持既有读谱出口与默认玩家节奏一致。
    const easyChart = chart ? this.chartForDifficulty(chart, 'easy') : null;
    this.chart = easyChart;
    for (const p of this.players.values()) {
      this.newTask(p);
      if (chart) this.prepareChart(p, this.chartForDifficulty(chart, p.difficulty));
      // 赛车：以开赛时刻作为速度积分的起点，否则第一段距离会被算进等待时间。
      if (this.mode === 'race') { p.speed = 0; p.distance = 0; p.hitTimes = []; p.lastSpeedAt = this.startedAt; p.topSpeed = 0; p.gear = 1; p.maxGear = 1; }
    }
  }
  chartForDifficulty(chart, difficulty) {
    if (!chart) return chart;
    const fallMs = (RHYTHM_DIFFICULTIES[difficulty] || RHYTHM_DIFFICULTIES.easy).fallMs;
    // 第一张卡片开赛后才从顶部入场，走满该难度的 fallMs 后到线。
    // 尾部留出判定窗口；重新编号保持 cursor 和 note.id 一致。
    const notes = chart.notes.filter((note, index) => (difficulty !== 'easy' || index % 4 === 0)
      && note.at + fallMs < chart.durationMs - BEAT_MS)
      .map((note, id) => ({ ...note, id, at: note.at + fallMs }));
    return { ...chart, notes };
  }
  prepareChart(p, chart) {
    p.chart = chart; p.cursor = 0; p.resolved = new Set();
    p.counts = { perfect: 0, great: 0, good: 0, miss: 0 };
    p.lastGrade = ''; p.lastGradeId = 0; p.lastOffsetMs = 0;
    // -1 表示尚未收到任何按键，这样才能接受 at = 0 的第一个音符。
    p.lastKeyAt = -1;
    p.lastKeyKeys = new Set();
  }
  start(id, body = {}) {
    this.tick();
    if (id !== this.host || this.players.get(id)?.seat !== body.seat) this.fail('只有房主可以提前开始', 403);
    if (this.phase !== 'waiting') this.fail('比赛已开始', 409);
    if (this.mode === 'rhythm' && body.launchCountdown) {
      if (this.launchRequestedAt !== null) return this.state(id);
      this.launchRequestedAt = this.now(); this.startsAt = this.launchRequestedAt + RHYTHM_LEAD_MS;
      return this.state(id);
    }
    if (this.mode === 'race' && body.launchCountdown) {
      const notReady = [...this.players.values()].filter(player => player.id !== this.host && !player.ready);
      if (notReady.length) this.fail(`还有 ${notReady.length} 位选手未准备`, 409);
      if (this.startsAt !== null) return this.state(id);
      this.launchRequestedAt = this.now(); this.startsAt = this.launchRequestedAt + RACE_LAUNCH_MS;
      return this.state(id);
    }
    this.begin(); return this.state(id);
  }
  ready(id, body = {}) {
    if (this.mode !== 'race') this.fail('当前模式不支持准备状态', 409);
    this.tick();
    const player = this.players.get(id);
    if (!player || player.seat !== body.seat) this.fail('身份已失效，请重新进入房间', 409);
    if (this.phase !== 'waiting' || this.startsAt !== null) this.fail('发车流程已经开始，不能更改准备状态', 409);
    if (id === this.host) this.fail('房主使用开始发车按钮', 409);
    player.ready = body.ready !== false;
    player.seen = this.now();
    return this.state(id);
  }
  newTask(p) {
    p.task = { id: crypto.randomUUID(), sequence: p.sequence, text: LESSONS[(p.sequence - 1) % LESSONS.length], typed: '' };
  }
  // ── 赛车：速度推进 ──────────────────────────────────────────────
  // 把「距上次推进的时间」按惯性推向目标速度，并把这段速度积分成前进距离。
  //
  // 为什么必须单独抽出来、且在 tick() 里也调用：
  //   距离是速度对时间的积分，而速度会随时间自然衰减（滑行）。
  //   如果只在按键时推进，那么「停手 5 秒」这段时间完全不计入，
  //   车速会停在原地不动 —— 既没有滑行手感，也让「停手有代价」失效。
  //   所以每次读状态、每次按键都要推进一次，用 lastSpeedAt 精确切分时间段。
  advanceSpeed(p, now) {
    if (this.mode !== 'race') return;
    const at = p.lastSpeedAt === null ? now : Math.max(p.lastSpeedAt, now);
    const dt = at - (p.lastSpeedAt ?? at);
    p.lastSpeedAt = at;
    if (dt <= 0) return;
    // 目标速度来自最近的打字速度；没有近期输入时目标回落到怠速，
    // 再叠加「滑行」分支的自然减速，形成松手后缓缓掉速的观感。
    const recent = p.hitTimes.filter(t => at - t <= WINDOW_MS);
    const target = recent.length ? targetSpeed(typingSpeed(p.hitTimes, at)) : 0;
    const coasting = recent.length === 0;
    p.speed = approachSpeed(p.speed, coasting ? Math.min(p.speed, target) : target, dt, { coasting });
    if (p.speed < 0.5) p.speed = 0;
    p.distance = advanceDistance(p.distance, p.speed, dt);
    p.topSpeed = Math.max(p.topSpeed || 0, p.speed);
    p.gear = gearOf(p.speed).gear;
    p.maxGear = Math.max(p.maxGear || 1, p.gear);
    // 只保留窗口内的事件，避免数组随对局时长无限增长。
    if (p.hitTimes.length > 64) p.hitTimes = p.hitTimes.filter(t => at - t <= WINDOW_MS * 2);
  }
  // 打错：直接拉低车速（自然带来降档效果），并丢掉一部分「近期正确」的历史。
  //   - 车速乘系数：立刻可感的惩罚，但不是归零，给玩家「还能救回来」的空间。
  //   - 丢掉最早的若干个事件（不是全部）：让目标速度随之下调。
  //     全清会让速度瞬间掉到怠速、手感断裂，过于严苛。
  penalize(p) {
    p.speed = Math.max(0, p.speed * RACE_WRONG_SPEED_FACTOR);
    p.hitTimes = p.hitTimes.slice(Math.ceil(p.hitTimes.length / 2));
    p.gear = Math.max(1, gearOf(p.speed).gear);
    p.maxGear = Math.max(p.maxGear || 1, p.gear);
  }
  player(id, seat) {
    this.tick();
    const p = this.players.get(id);
    if (!p || p.seat !== seat) this.fail('参赛身份已失效，请等待下一局重新加入', 409);
    if (this.phase !== 'running') this.fail('当前比赛未开始或已结束', 409);
    p.seen = this.now(); return p;
  }
  type(id, body = {}) {
    const p = this.player(id, body.seat);
    if (this.mode !== 'race') this.fail('音游请通过字母按键参与判定', 400);
    if (body.ticket !== p.task.id) this.fail('题目已更新，请同步后继续', 409);
    // 注意：text 会被跨段顺延逻辑重新赋值，必须是 let。
    let text = body.text;
    if (typeof text !== 'string' || !text.startsWith(p.task.typed) || text.length > p.task.text.length || text.length - p.task.typed.length > 16) this.fail('请按顺序输入当前段落');
    if (text === p.task.typed) return this.state(id);
    if (p.attempted + text.length - p.task.typed.length > 16 + Math.floor((this.now() - this.startedAt) / 1000 * 20)) this.fail('输入过快，请正常练习', 429);
    // 先把「距上次按键的这段时间」按当前速度积分成距离，再处理这次输入。
    this.advanceSpeed(p, this.now());
    let reachedFinish = false;
    // 段末自动衔接：打满一段自动换下一段，玩家全程不需要按回车。
    // 赛车不该为「换段」停下来操作 —— 那会打断速度积累，也破坏竞速的连贯感。
    // 用 while 而不是 if，因为一次请求理论上最多推进 16 个字，
    // 而最后一段可能不足 16 字，需要连续跨过多个段落边界。
    let guard = 0;
    while (guard++ < 4) {
      const t = p.task;
      for (let i = t.typed.length; i < text.length; i++) {
        p.attempted++;
        if (text[i] === t.text[i]) {
          p.correct++; p.combo++; p.bestCombo = Math.max(p.bestCombo, p.combo);
          // 每字得分按当前档位倍率放大：跑得越快，一个字越值钱。
          // 这是「速度与换挡」的核心激励 —— 提速不只是跑得远，还直接提高得分效率。
          p.score += Math.round(gearOf(p.speed).multiplier * 10) / 10;
          p.hitTimes.push(this.now());
        } else {
          p.combo = 0;
          this.penalize(p);
        }
        if (p.distance >= this.rules.target) { reachedFinish = true; break; }
      }
      t.typed = text;
      if (reachedFinish) break;
      // 本段已打满：自动接下一段，并把多余的字顺延到新段落继续判定。
      if (t.typed.length < t.text.length) break;
      const carry = text.slice(t.typed.length);
      p.sequence++; this.newTask(p);
      if (!carry.length) break;
      // 顺延到新段落的字必须重新校验前缀，只保留与新课文匹配的部分。
      text = p.task.typed + carry.slice(0, p.task.text.length);
      if (!carry.startsWith(p.task.text.slice(0, Math.min(carry.length, p.task.text.length)))) {
        // 跨段后字不再匹配（新课文不同），丢弃顺延部分：玩家按新课文继续输入即可。
        // 这里不判定为错误 —— 换段失败不是玩家的错。
        break;
      }
    }
    if (reachedFinish) this.finish('finish', p.id);
    else if (this.now() - p.lastSaved >= 2000) { this.recordPlayer(p, false); p.lastSaved = this.now(); }
    return this.state(id);
  }
  // 音游按键：一次请求携带若干次按键 { key, at }。
  // 谱面音符的 at 是「相对开局」的毫秒偏移，因此这里统一把按键时刻换算成相对偏移再判定，
  // 避免绝对时间戳与相对谱面混用。
  // 把已经被跳过的音符结算为漏键。
  // 抽成独立方法是必要的：漏键结算原本只在 press() 里做，如果玩家整段不按键
  // （发呆、手跟不上、掉线回来），那些音符就永远不会被记为漏键，成绩会虚高。
  // 因此每次读取房间状态时也要结算一次。
  // 注意：结算线取 max(nowElapsed, lastKeyAt)，因为批次里最后一个按键的 at 可能晚于 now
  // （判定容差允许略微提前上报），否则会把刚判过的音符又算成漏键。
  rhythmDifficulty(p) {
    return RHYTHM_DIFFICULTIES[p?.difficulty] || RHYTHM_DIFFICULTIES.easy;
  }
  chooseDifficulty(id, body = {}) {
    if (this.mode !== 'rhythm') this.fail('当前模式不支持难度选择', 409);
    if (this.phase !== 'waiting') this.fail('比赛开始后不能更改难度', 409);
    const p = this.players.get(id);
    if (!p || !body.seat || p.seat !== body.seat) this.fail('身份已失效，请重新进入房间', 409);
    const difficulty = String(body.difficulty || '');
    if (!RHYTHM_DIFFICULTIES[difficulty]) this.fail('难度不存在', 400);
    p.difficulty = difficulty;
    return this.state(id);
  }
  settleMisses(p, at) {
    if (!p.chart) return [];
    const expired = expireNotes(p.chart, p.cursor, at, p.resolved, this.rhythmDifficulty(p));
    const missed = [];
    for (const note of expired.missed) {
      p.resolved.add(note.id);
      p.counts.miss++; p.attempted++; p.combo = 0;
      p.lastGrade = 'miss'; p.lastGradeId++; p.lastOffsetMs = 0;
      missed.push({ key: note.letter, grade: 'miss', offsetMs: 0, noteId: note.id, expired: true });
    }
    if (missed.length) p.keys = missed;
    if (expired.nextCursor > p.cursor) p.cursor = expired.nextCursor;
    return missed;
  }
  press(id, body = {}) {
    if (this.mode !== 'rhythm') this.fail('赛车请输入当前段落', 400);
    const p = this.player(id, body.seat);
    if (body.round && body.round !== this.round) this.fail('对局已更新，请重新同步', 409);
    if (!p.chart) this.fail('谱面尚未生成，请同步后重试', 409);
    const keys = Array.isArray(body.keys) ? body.keys : [];
    if (!keys.length) return this.state(id);
    if (keys.length > RHYTHM_KEYS_MAX) this.fail('按键过快，请正常游玩', 429);
    const now = this.now();
    const nowElapsed = Math.max(0, now - this.startedAt);
    const results = [];
    // 按键包必须按上报时刻排序后再判定。
    // 前端可能把一小段连续按键攒成一个请求，而批次里每个 key 各自带自己的 at；
    // 判定与漏键结算都依赖「时间单调推进」，乱序会让 judgeKey 的窗口提前 break。
    const ordered = keys.map(item => {
      const rawElapsed = Number(item?.at);
      // 前端上报的是「相对开局」的毫秒偏移；同时兼容直接传绝对时间戳。
      const reported = Number.isFinite(rawElapsed)
        ? (rawElapsed > 1e6 ? rawElapsed - this.startedAt : rawElapsed)
        : nowElapsed;
      // 保留每个按键自己的时刻；拒绝未来按键，避免提前提交整局谱面得分。
      if (!/^[a-z]$/i.test(String(item?.key || '')) || !Number.isFinite(rawElapsed)
        || reported < 0 || reported > nowElapsed + RHYTHM_FUTURE_TOLERANCE_MS) this.fail('按键时间或字母无效，请同步后重试', 400);
      return { key: item.key, el: reported };
    }).sort((a, b) => a.el - b.el);
    for (const { key, el } of ordered) {
      // 必须递增（允许相等，同一时刻的多次按键各自匹配不同音符），防止重放旧包重复计分
      if (el < p.lastKeyAt) continue;
      if (el !== p.lastKeyAt) p.lastKeyKeys.clear();
      const upperKey = key.toUpperCase();
      if (p.lastKeyKeys.has(upperKey)) continue;
      p.lastKeyKeys.add(upperKey);
      // 先按这个按键自己的时刻结算真正过期的音符，再从尚可命中的音符查找。
      // 这样长时间停手后恢复输入仍能命中，旧漏键也不会清空这次新建立的连击。
      results.push(...this.settleMisses(p, el));
      const hit = judgeKey(p.chart, p.cursor, key, el, p.resolved, this.rhythmDifficulty(p));
      if (!hit) {
        // 按了键但没有对应音符：不扣分，只中断连击并提示。
        p.combo = 0; p.lastGrade = 'miss'; p.lastGradeId++; p.lastOffsetMs = 0;
        results.push({ key: String(key || '').toUpperCase(), grade: 'miss', offsetMs: 0, noteId: -1 });
      } else {
        p.resolved.add(hit.note.id);
        // 游标只跳过已处理的音符。命中后面的字母不能吞掉前面尚待判定的音符。
        while (p.cursor < p.chart.notes.length && p.resolved.has(p.chart.notes[p.cursor].id)) p.cursor++;
        const grade = hit.grade;
        p.counts[grade]++;
        p.lastGrade = grade; p.lastGradeId++; p.lastOffsetMs = Math.round(el - hit.note.at);
        p.combo++; p.bestCombo = Math.max(p.bestCombo, p.combo);
        p.correct++;
        p.score += Math.round(GRADES[grade].score * comboMultiplier(p.combo));
        if (grade === 'perfect') p.perfectHits++;
        p.beatHits++; p.beatStreak++; p.bestBeatStreak = Math.max(p.bestBeatStreak, p.beatStreak);
        p.attempted++;
        results.push({ key: String(key || '').toUpperCase(), grade, offsetMs: Math.round(el - hit.note.at), noteId: hit.note.id });
      }
      p.lastKeyAt = el;
    }
    // 收尾结算：把批次最后一个按键之后、已经越过失键容限的音符补记为漏键。
    // 这批音符不可能再被命中，提前结算可以让前端立刻看到漏键反馈。
    results.push(...this.settleMisses(p, Math.max(nowElapsed - RHYTHM_SETTLE_GRACE_MS, p.lastKeyAt)));
    p.keys = results;
    if (now - p.lastSaved >= 2000) { this.recordPlayer(p, false); p.lastSaved = now; }
    return this.state(id);
  }
  next(id, body = {}) {
    const p = this.player(id, body.seat);
    if (body.ticket === p.lastAdvance) return this.state(id);
    if (body.ticket !== p.task.id) this.fail('题目已更新，请同步后继续', 409);
    // 赛车已改为「打满自动换段」，前端不再需要手动换段。
    // 这里保留接口是为了兼容旧客户端，且必须幂等：直接返回当前状态，不打断车速。
    if (this.mode === 'race') return this.state(id);
    if (p.task.typed.length !== p.task.text.length) this.fail('输入完整一段后再继续');
    p.lastAdvance = p.task.id; p.sequence++; this.newTask(p); this.recordPlayer(p, false);
    return this.state(id);
  }
  recordPlayer(p, finalized) {
    if (!p.attempted || this.startedAt === null) return;
    const at = Math.min(this.now(), this.result?.endedAt ?? this.endsAt);
    this.record({ mode: this.mode, round: this.round, player: p, finalized, at, durationMs: Math.max(1000, at - this.startedAt) });
  }
  publicPlayer(p) {
    const duration = Math.max(1000, Math.min(this.now(), this.result?.endedAt ?? this.endsAt ?? this.now()) - (this.startedAt ?? this.now()));
    const counts = p.counts || { perfect: 0, great: 0, good: 0, miss: 0 };
    const judged = counts.perfect + counts.great + counts.good + counts.miss;
    const gear = gearOf(p.speed || 0);
    // 距离保留一位小数：速度是连续量，整数化会让「一格之差」频繁并列，排名抖动。
    const distance = Math.round((p.distance || 0) * 10) / 10;
    return { id: p.id, seat: p.seat, name: p.name, avatarUrl: p.avatarUrl, lane: p.lane ?? 0, correct: p.correct, attempted: p.attempted,
      accuracy: this.mode === 'rhythm' ? accuracyOf(counts) : (p.attempted ? Math.round(p.correct / p.attempted * 100) : 100),
      combo: p.combo, bestCombo: p.bestCombo,
      multiplier: this.mode === 'rhythm' ? comboMultiplier(p.combo) : gear.multiplier, score: p.score, speed: Math.round(p.correct / duration * 60000), sequence: p.sequence,
      beatHits: p.beatHits || 0, perfectHits: p.perfectHits || 0, beatStreak: p.beatStreak || 0, bestBeatStreak: p.bestBeatStreak || 0,
      lastBeatGrade: p.lastBeatGrade || '', lastBeatId: p.lastBeatId || 0,
      // 赛车：车速 / 档位 / 前进距离。
      speedKmh: Math.round(p.speed || 0), topSpeedKmh: Math.round(p.topSpeed || 0),
      gear: gear.gear, gearLabel: gear.label, gearMultiplier: gear.multiplier, maxGear: p.maxGear || 1,
      distance, distancePct: this.mode === 'race' ? Math.min(100, Math.round(distance / this.rules.target * 1000) / 10) : 0,
      // 音游进度：已判定音符数与谱面总音符数，用于排行榜展示完成度。
      counts, judged, totalNotes: p.chart ? p.chart.notes.length : 0,
      grade: p.lastGrade || '', gradeId: p.lastGradeId || 0, lastOffsetMs: p.lastOffsetMs || 0,
      ready: !!p.ready,
      progress: this.mode === 'race' ? Math.min(100, Math.round(distance / this.rules.target * 100))
        : p.chart ? Math.min(100, Math.round(p.cursor / Math.max(1, p.chart.notes.length) * 100)) : 0 };
  }
  // 赛车用「距离 + 车速」，音游用「得分 + 准确率」。
  // 关键：赛车的排名依据必须与胜负判定（先到 target 格）一致，
  // 否则会出现「先冲线的人排名反而更低」这种自相矛盾的结果。
  ranked() {
    const rows = [...this.players.values()].map(p => this.publicPlayer(p));
    if (this.mode === 'race') {
      rows.sort((a, b) => b.distance - a.distance || b.speedKmh - a.speedKmh || b.accuracy - a.accuracy
        || b.bestCombo - a.bestCombo || a.id - b.id);
    } else {
      rows.sort((a, b) => b.score - a.score || b.accuracy - a.accuracy
        || b.counts.perfect - a.counts.perfect || b.bestCombo - a.bestCombo || a.id - b.id);
    }
    let rank = 1;
    return rows.map((p, i) => {
      if (i && (this.mode === 'race'
        ? p.distance !== rows[i - 1].distance
        : p.score !== rows[i - 1].score || p.accuracy !== rows[i - 1].accuracy || p.perfectHits !== rows[i - 1].perfectHits)) rank = i + 1;
      return { ...p, rank };
    });
  }
  remove(p) { this.recordPlayer(p, true); if (this.phase === 'running') this.retired.push({ ...this.publicPlayer(p), left: true }); this.players.delete(p.id); }
  leave(id, seat) { const p = this.players.get(id); if (p?.seat === seat) this.remove(p); this.tick(); return { ok: true }; }
  finish(outcome, winnerId = null) {
    if (this.phase !== 'running') return;
    if (this.mode === 'rhythm') {
      const at = Math.min(this.now(), this.endsAt) - this.startedAt;
      for (const p of this.players.values()) this.settleMisses(p, at);
    }
    // 结算前把每个人的速度推进到最后时刻，避免「最后一秒的距离」丢失。
    if (this.mode === 'race') { const at = this.now(); for (const p of this.players.values()) this.advanceSpeed(p, at); }
    const ranking = this.ranked();
    // 胜负判定与排名依据必须一致：
    //   冲线（outcome='finish'）由冲线者胜出；超时则名次第一者胜出。
    // 原实现用 score > 0 过滤，而 race 的 score 与 distance 是两套算法，
    // 会出现「先冲线的人因为 score 较低而落选」的矛盾结果。
    const winners = outcome === 'all_left' ? [] : outcome === 'finish'
      ? ranking.filter(p => winnerId ? p.id === winnerId : p.rank === 1)
      : ranking.filter(p => p.rank === 1 && (this.mode === 'race' ? p.distance > 0 : p.score > 0));
    this.result = { id: this.round, mode: this.mode, outcome, endedAt: Math.min(this.now(), this.endsAt), ranking, retired: this.retired,
      winners, durationSeconds: Math.max(1, Math.ceil((Math.min(this.now(), this.endsAt) - this.startedAt) / 1000)) };
    this.save(this.result);
    for (const p of this.players.values()) this.recordPlayer(p, true);
    this.phase = 'finished';
  }
  state(id) {
    const player = this.players.get(id); if (player) player.seen = this.now();
    this.tick(); const me = this.players.get(id);
    const elapsed = this.startedAt !== null ? Math.max(0, this.now() - this.startedAt) : 0;
    const players = this.ranked();
    // 音游谱面随每次响应下发。谱面是按 round 确定性生成的，同局所有人一致；
    // 前端据此把方块画在正确的下落位置，服务端仍独立判定，不依赖前端结果。
    // lanes 一并下发道位标签（左上/左下/右上/右下），前端四条道的标题与服务端分区保持一致，
    // 避免两边各自硬编码一份字母表而漂移。
    const rhythmDifficulty = this.mode === 'rhythm' ? this.rhythmDifficulty(me) : null;
    const playerChart = me?.chart || this.chart;
    const chart = this.mode === 'rhythm' && playerChart && this.phase === 'running'
      ? { seed: playerChart.seed, beatMs: playerChart.beatMs, bpm: playerChart.bpm,
          leadMs: RHYTHM_LEAD_MS, fallMs: rhythmDifficulty.fallMs, laneCount: LANE_COUNT,
          lanes: LANE_LABELS.map((label, index) => ({ index, label, keys: LANE_LAYOUT[index] })),
          totalNotes: playerChart.notes.length,
          // 只发还没被本人判定掉、且在下落窗口内的音符，控制在 60 个以内，避免响应过大。
          // 首屏还包含开局进场时间：前端会先缓存谱面，等方块从顶部入场后再显示，
          // 这样首个可判定音符也有完整的下落路径，不会在判定线附近突然出现。
          notes: playerChart.notes
            .filter(n => !(me?.resolved?.has(n.id)) && n.at - elapsed < rhythmDifficulty.fallMs + RHYTHM_LEAD_MS + 600 && n.at - elapsed > -rhythmDifficulty.missMs)
            .slice(0, 60)
            .map(n => ({ id: n.id, letter: n.letter, at: n.at, lane: n.lane })) }
      : this.mode === 'rhythm' ? { bpm: BPM, beatMs: BEAT_MS, fallMs: rhythmDifficulty.fallMs,
          laneCount: LANE_COUNT, lanes: LANE_LABELS.map((label, index) => ({ index, label, keys: LANE_LAYOUT[index] })),
          totalNotes: 0, notes: [] } : null;
    const readyCount = this.mode === 'race' ? [...this.players.values()].filter(player => player.ready || player.id === this.host).length : 0;
    const allReady = this.mode === 'race' && this.players.size > 0 && readyCount === this.players.size;
    return { mode: this.mode, title: this.rules.title, target: this.rules.target, durationSeconds: this.rules.durationMs / 1000,
      round: this.round, phase: this.phase, serverNow: this.now(), startsAt: this.startsAt, startedAt: this.startedAt, endsAt: this.endsAt, host: this.host,
      launchRequestedAt: this.launchRequestedAt,
      readyCount, allReady,
      capacity: this.rules.capacity, roomNo: this.no,
      elapsed, chart,
      judgement: this.mode === 'rhythm' ? { perfectMs: rhythmDifficulty.perfectMs, greatMs: rhythmDifficulty.greatMs, goodMs: rhythmDifficulty.goodMs, missMs: rhythmDifficulty.missMs } : null,
      // 赛车：把档位表下发给前端，仪表盘的刻度与阈值必须与服务端判定完全一致。
      gears: this.mode === 'race' ? { max: SPEED_MAX, list: GEARS, windowMs: WINDOW_MS } : null,
      players, me: me ? { ...players.find(p => p.id === id), difficulty: me.difficulty, task: me.task ? { ...me.task } : null,
        keys: me.keys || [] } : null, result: this.result };
  }
}

// ── 房间池与自动匹配 ────────────────────────────────────────────
// 老实现是一个模式一个全局大房间（60 人同场）。赛车改为 4 人一间后，
// 同一时刻必须能并存多个房间：进页面的人自动被分进「未满且等待中」的房间，
// 没有就开一间新的。membership 记录「谁在哪间房」，之后所有请求都据此找房，
// 前端不需要感知房间号，API 路径保持不变。
function createHub(mode, opts) {
  const seed = new ArenaRoom(mode, opts);
  const hub = {
    mode, opts, rooms: [seed], membership: new Map(), seq: 1024,
    // 分配房间：已有有效成员身份则原样返回；否则挑一间等待中未满的房，没有就开新房间。
    // fresh=true 时跳过复用，强制开一间全新房间（「创建房间」用）。
    matchmake(user, { fresh = false } = {}) {
      const mine = this.membership.get(user.id);
      if (!fresh && mine && mine.players.has(user.id)) return mine;
      if (mine) this.membership.delete(user.id);
      this.prune();
      let room = fresh ? null : this.rooms.find(r => r.phase === 'waiting' && r.players.size < r.rules.capacity);
      if (!room) { room = new ArenaRoom(this.mode, this.opts); room.no = this.seq++; this.rooms.push(room); }
      this.membership.set(user.id, room);
      return room;
    },
    // 邀请码就是房间号。只允许加入仍在等待且未满的赛车房间。
    joinByCode(user, code) {
      const roomNo = Number.parseInt(String(code || '').trim(), 10);
      if (!Number.isInteger(roomNo)) throw Object.assign(new Error('请输入正确的邀请码'), { status: 400 });
      this.prune();
      const room = this.rooms.find(item => item.no === roomNo);
      if (!room) throw Object.assign(new Error('邀请码不存在或房间已关闭'), { status: 404 });
      room.tick();
      if (!room.players.size) throw Object.assign(new Error('房间已关闭'), { status: 404 });
      if (room.players.has(user.id)) return room;
      if (room.phase !== 'waiting') throw Object.assign(new Error('比赛已经开始，请创建或加入其他房间'), { status: 409 });
      if (room.players.size >= room.rules.capacity) throw Object.assign(new Error('房间已满'), { status: 409 });
      const old = this.roomOf(user.id);
      if (old && old !== room && old.phase !== 'waiting') throw Object.assign(new Error('你已有进行中的赛车，请先结束当前对局'), { status: 409 });
      if (old && old !== room) { const player = old.players.get(user.id); if (player) old.leave(user.id, player.seat); }
      this.membership.set(user.id, room);
      return room;
    },
    // 解析请求所属房间：成员已不在房内（离线移除 / 已换房 / 房间重开）视为无房间。
    roomOf(id) {
      const room = this.membership.get(id);
      if (room && room.players.has(id)) return room;
      this.membership.delete(id);
      return null;
    },
    // 回收空房：等待中无人或结算完人都走光的房间直接丢弃，需要时再开新的。
    // 正在对局与还有人看结算的房间保留。
    prune() { this.rooms = this.rooms.filter(r => r.players.size > 0); },
  };
  return hub;
}

function installArena(app, { db, requireUser, now }) {
  db.exec('CREATE TABLE IF NOT EXISTS arena_results (id TEXT PRIMARY KEY, mode TEXT NOT NULL, ended_at INTEGER NOT NULL, result_json TEXT NOT NULL)');
  const record = ({ mode, round, player, finalized, at, durationMs }) => {
    db.prepare(`INSERT INTO training_sessions (user_id, mode, lesson_title, correct_chars, wrong_chars, accuracy, speed, duration_ms, completed_at, source_key, is_finalized)
      VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(source_key) WHERE source_key IS NOT NULL DO UPDATE SET
      lesson_title=excluded.lesson_title, correct_chars=excluded.correct_chars, wrong_chars=excluded.wrong_chars,
      accuracy=excluded.accuracy, speed=excluded.speed, duration_ms=excluded.duration_ms, completed_at=excluded.completed_at, is_finalized=excluded.is_finalized`)
      .run(player.id, mode, MODES[mode].title + (finalized ? '（已结算）' : '（进行中）'), player.correct, player.attempted - player.correct,
        mode === 'rhythm' ? accuracyOf(player.counts) : Math.round(player.correct / player.attempted * 100), Math.round(player.correct / durationMs * 60000), durationMs, at, `${mode}:${round}:${player.seat}`, finalized ? 1 : 0);
  };
  const save = result => db.prepare('INSERT OR IGNORE INTO arena_results VALUES (?,?,?,?)').run(result.id, result.mode, result.endedAt, JSON.stringify(result));
  const hubs = Object.fromEntries(Object.keys(MODES).map(mode => [mode, createHub(mode, { now, record, save })]));
  const route = fn => (req, res, next) => {
    if (!Object.hasOwn(hubs, req.params.mode)) return res.status(404).json({ message: '游戏模式不存在' });
    try { res.json(fn(hubs[req.params.mode], req)); } catch (error) { if (error.status) res.status(error.status).json({ message: error.message }); else next(error); }
  };
  const roomOf = (hub, req) => hub.roomOf(req.user.id);
  app.locals.raceLobby = {
    create(user) { const hub=hubs.race; const old=hub.roomOf(user.id); if(old) { old.tick(); if(old.phase !== 'waiting') throw Object.assign(new Error('你已有正在进行的赛车，请先返回房间'),{status:409}); return old.state(user.id); } return hub.matchmake(user,{fresh:true}).join(user); },
    join(user,code) { return hubs.race.joinByCode(user,code).join(user); },
    inspect(code) { const hub=hubs.race; hub.prune(); const room=hub.rooms.find(r=>String(r.no)===String(code)); if(!room)return null; room.tick(); return {phase:room.phase,count:room.players.size,capacity:room.rules.capacity}; }
  };
  app.locals.rhythmLobby = {
    create(user) { const hub=hubs.rhythm; const old=hub.roomOf(user.id); if(old) { old.tick(); if(old.phase !== 'waiting') throw Object.assign(new Error('你已有进行中的音游，请先返回房间'),{status:409}); return old.state(user.id); } return hub.matchmake(user).join(user); },
    join(user,code) { return hubs.rhythm.joinByCode(user,code).join(user); },
    inspect(code) { const hub=hubs.rhythm; hub.prune(); const room=hub.rooms.find(r=>String(r.no)===String(code)); if(!room)return null; room.tick(); return {phase:room.phase,count:room.players.size,capacity:room.rules.capacity}; }
  };
  app.get('/api/arena/:mode', requireUser, route((hub, req) => {
    // 赛车：进入页面即自动匹配并加入房间（GET 也是一次「到场」）；
    // 音游保留先加入再游玩的流程，未加入时读到的是大厅房间的等待态。
    const mine = roomOf(hub, req);
    if (mine) return mine.state(req.user.id);
    // 赛车大厅显式请求 lobby=1 时只展示模式选择，不触发自动匹配。
    if (hub.mode === 'race' && req.query?.lobby === '1') return new ArenaRoom(hub.mode, hub.opts).state(req.user.id);
    return MODES[hub.mode].autoMatch ? hub.matchmake(req.user).join(req.user) : hub.rooms[0].state(req.user.id);
  }));
  app.post('/api/arena/:mode/join', requireUser, route((hub, req) => hub.matchmake(req.user).join(req.user)));
  // 创建房间：先退掉当前房（无论传什么 seat，按服务端记录的身份退），再开一间全新房间并加入。
  app.post('/api/arena/:mode/create', requireUser, route((hub, req) => {
    const old = hub.roomOf(req.user.id);
    if (old) { const p = old.players.get(req.user.id); if (p) old.leave(req.user.id, p.seat); }
    return hub.matchmake(req.user, { fresh: true }).join(req.user);
  }));
  app.post('/api/arena/:mode/join-code', requireUser, route((hub, req) => hub.joinByCode(req.user, req.body?.code).join(req.user)));
  for (const action of ['start', 'type', 'next', 'press', 'chooseDifficulty', 'ready']) app.post(`/api/arena/:mode/${action}`, requireUser, route((hub, req) => {
    const room = roomOf(hub, req);
    if (!room) { const err = new Error('请先进入房间'); err.status = 409; throw err; }
    const body = action === 'start' && hub.mode === 'race' ? { ...req.body, launchCountdown: true } : req.body;
    return room[action](req.user.id, body);
  }));
  app.post('/api/arena/:mode/leave', requireUser, route((hub, req) => {
    const room = roomOf(hub, req);
    if (room) room.leave(req.user.id, req.body?.seat);
    // 空房立即从房间池释放；seq 只增不减，因此旧邀请码永远不会被重新分配。
    hub.prune();
    return { ok: true };
  }));
}
module.exports = { ArenaRoom, installArena, MODES, multiplier, GATHER_MS, RESULT_MS, FULL_ROOM_START_MS,
  RACE_PREPARE_MS, RACE_COUNTDOWN_MS, RACE_LAUNCH_MS,
  RACE_WRONG_SPEED_FACTOR,
  accuracyOf, comboMultiplier,
  RHYTHM_LEAD_MS, RHYTHM_FALL_MS, RHYTHM_DIFFICULTIES, RHYTHM_KEYS_MAX, RHYTHM_SETTLE_GRACE_MS, RHYTHM_FUTURE_TOLERANCE_MS,
  JUDGE_PERFECT_MS, JUDGE_GREAT_MS, JUDGE_GOOD_MS, JUDGE_MISS_MS, GRADES, GRADE_KEYS,
  LANE_COUNT, LANE_LAYOUT, LANE_LABELS, BEAT_MS, BPM };
