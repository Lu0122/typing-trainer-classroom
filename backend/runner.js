const crypto = require('node:crypto');

const COUNTDOWN_MS = 3000, GRACE_MS = 350, LEVEL_STEPS = 6, RECOVERY_MS = 2600;
const TURN_ANGLE = Math.PI / 3;
// 难度不再三档跳变，而是按「关卡进度」和「已玩时长」里更大的那个连续上升：
// 打得慢、一直卡在简单关卡时，时长也会把难度推上去。
const DIFFICULTY_RAMP_LEVELS = 14;
const DIFFICULTY_RAMP_MS = 8 * 60 * 1000;
// 单一词池，按目标长度就近取词：词越长越难，不用再维护三套档位。
const WORDS = {
  english: [
    'run', 'sun', 'dash', 'gold', 'wind', 'rock', 'lake', 'wild', 'leaf', 'gate', 'fire', 'moon', 'star', 'path', 'tree', 'jump',
    'stone', 'river', 'torch', 'trail', 'ridge', 'cliff', 'brave', 'swift', 'glide', 'chase', 'light', 'shadow', 'canyon', 'jungle',
    'forest', 'bridge', 'escape', 'silver', 'island', 'hidden', 'flower', 'secret', 'sprint', 'valley', 'lantern', 'compass',
    'harvest', 'whisper', 'crystal', 'ancient', 'journey', 'mystery', 'freedom', 'horizon', 'sunrise', 'guardian', 'sunlight',
    'mountain', 'explorer', 'treasure', 'adventure', 'discovery', 'waterfall', 'lightning', 'wilderness',
    'ancient gate', 'silver bridge', 'hidden valley', 'golden lantern', 'brave explorer', 'escape the dark', 'follow the light',
    'sunlit path', 'stone steps', 'swift river', 'rocky trail',
    'silver waterfall', 'ancient stone gate', 'hidden forest path', 'cross the old bridge', 'follow the north star',
    'keep moving forward', 'never stop moving on', 'run across the bridge', 'trust your own rhythm',
    'keep your eyes ahead', 'run toward the light', 'follow the river home', 'reach the golden gate',
    'hold your steady pace', 'chase the morning sun', 'brave the hidden path',
    'keep your rhythm steady', 'climb the broken stairs'
  ],
  chinese: [
    '出发', '奔跑', '石桥', '星光', '前进', '远方', '山谷', '跳跃', '勇气', '宝藏', '火把', '藤蔓',
    '出发吧', '向前跑', '别停下', '稳住手', '穿过石桥', '寻找宝藏', '跨过断桥', '点亮火把', '穿越丛林', '放松双手',
    '沿着星光跑', '保持好节奏', '稳住呼吸', '追逐阳光', '保持专注节奏', '穿越藤蔓密林', '沿着星光前进', '跨过断桥向前',
    '每一步都是进步', '相信自己的力量', '专注眼前的道路', '勇敢迎接挑战', '专注眼前的路别回头', '沿着星光一直向前跑',
    '勇敢迎接每一个挑战', '保持节奏别让双手僵住', '一步一步穿过这片密林',
    '专注眼前的路不要回头看', '相信自己的力量一直向前跑', '每一步进步都值得被记住', '稳住呼吸让双手保持节奏',
    '穿过藤蔓密林就能看见古塔', '沿着星光一直向前不要停下', '勇敢迎接每一个新的挑战吧', '专注眼前的道路一步一步向前',
    '相信自己的力量就能走得更远', '保持稳定的节奏穿过整片密林', '每一步都是进步别让双手僵住', '沿着星光一直向前跑去寻找宝藏',
    '勇敢迎接每一个新挑战不要回头', '专注眼前的道路一步一步走向远方',
    '保持专注的节奏就能穿过密林', '相信自己的双手可以稳住节奏',
    '沿着星光的方向一直跑到终点', '勇敢地穿过藤蔓密林寻找宝藏', '相信自己的节奏就能走得更远',
    '专注眼前的每一步就能走得更远', '稳住呼吸让节奏带着你穿过密林', '相信自己的双手可以保持好节奏',
    '每一步都值得被记住别让双手僵住', '保持稳定的节奏就能穿过整片密林', '相信自己的力量一直向前不要停下'
  ]
};
const ACTIONS = ['jump', 'slide', 'left', 'right'];
const ACTION_LABELS = { jump: '跳过断桥', slide: '滑过石门', left: '向左避障', right: '向右避障' };
// 英文题的中文意思，显示在题目下方，让学生知道自己在打什么。
// 中文题本身已经是中文，不需要翻译，所以只维护英文这张表。
const EN_MEANINGS = {
  run: '奔跑', sun: '太阳', dash: '冲刺', gold: '黄金', wind: '风', rock: '岩石', lake: '湖泊', wild: '荒野的',
  leaf: '树叶', gate: '大门', fire: '火焰', moon: '月亮', star: '星星', path: '小路', tree: '树木', jump: '跳跃',
  stone: '石头', river: '河流', torch: '火把', trail: '小径', ridge: '山脊', cliff: '悬崖', brave: '勇敢的',
  swift: '迅速的', glide: '滑翔', chase: '追逐', light: '光线', shadow: '影子', canyon: '峡谷', jungle: '丛林',
  forest: '森林', bridge: '桥梁', escape: '逃脱', silver: '银色的', island: '岛屿', hidden: '隐藏的',
  flower: '花朵', secret: '秘密', sprint: '疾跑', valley: '山谷', lantern: '灯笼', compass: '指南针',
  harvest: '收获', whisper: '低语', crystal: '水晶', ancient: '古老的', journey: '旅程', mystery: '谜团',
  freedom: '自由', horizon: '地平线', sunrise: '日出', guardian: '守护者', sunlight: '阳光',
  mountain: '高山', explorer: '探险家', treasure: '宝藏', adventure: '冒险', discovery: '发现',
  waterfall: '瀑布', lightning: '闪电', wilderness: '荒野',
  'ancient gate': '古老的大门', 'silver bridge': '银色桥梁', 'hidden valley': '隐秘山谷',
  'golden lantern': '金色灯笼', 'brave explorer': '勇敢的探险家', 'escape the dark': '逃离黑暗',
  'follow the light': '追随光明', 'sunlit path': '阳光小径', 'stone steps': '石阶',
  'swift river': '湍急的河流', 'rocky trail': '岩石小径', 'silver waterfall': '银色瀑布', 'ancient stone gate': '古老石门',
  'hidden forest path': '隐秘森林小径', 'cross the old bridge': '走过旧桥', 'follow the north star': '跟随北极星',
  'keep moving forward': '继续向前', 'never stop moving on': '永不停步', 'run across the bridge': '跑过石桥',
  'trust your own rhythm': '相信自己的节奏', 'keep your rhythm steady': '保持节奏稳定',
  'climb the broken stairs': '攀爬破损的阶梯',
  'keep your eyes ahead': '目光看向前方', 'run toward the light': '奔向光明', 'follow the river home': '沿河回家',
  'reach the golden gate': '抵达金色大门', 'hold your steady pace': '保持稳定步伐', 'chase the morning sun': '追逐朝阳',
  'brave the hidden path': '勇闯隐秘小径'
};
function meaningOf(language, text) {
  return language === 'english' ? (EN_MEANINGS[text] || '') : '';
}
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };

// 0 = 刚出发，1 = 最难。取两条曲线里更大的那条，避免「打得慢就一直很简单」。
function difficultyOf(level, activeMs = 0) {
  const byLevel = (level - 1) / DIFFICULTY_RAMP_LEVELS;
  const byTime = (Number.isFinite(activeMs) ? activeMs : 0) / DIFFICULTY_RAMP_MS;
  return Math.max(0, Math.min(1, Math.max(byLevel, byTime)));
}

// 英文 6→20 个字符，中文 3→14 个字。起步就比原来的 3 字母词长，越往后越长。
function targetLength(language, difficulty) {
  return language === 'chinese'
    ? Math.round(3 + 11 * difficulty)
    : Math.round(6 + 14 * difficulty);
}

// 长度够了还要给足时间：每字符预算随难度收紧（英文 700→480ms，中文 1000→720ms，
// 中文起步多给 1.4 秒，是留给输入法选字上屏的）。
function durationFor(language, length, difficulty) {
  const base = language === 'chinese' ? 2400 : 1000;
  const perChar = language === 'chinese' ? 1000 - 280 * difficulty : 700 - 220 * difficulty;
  const floor = language === 'chinese' ? 3300 : 2400;
  return Math.round(Math.max(floor, base + perChar * length));
}

// 取长度在目标 ±1 以内的词：容差收到 0 会出现「同长度只有一两个词」，
// 于是同一关反复出同一个词（实测 wilderness 连出 9 次）。
// 下标 = 本轮固定偏移 + 题号，保证相邻两题一定不同，并且能把候选池轮一遍。
// 偏移只能用 seed（每轮固定），混进每题都变的 hash 就又会撞车。
function runOffset(seed) {
  return crypto.createHash('sha256').update(`offset:${seed}`).digest()[0];
}

function pickTexts(pool, target, sequence, offset, exclude = '') {
  // 窗口只往上放 2 个字符、绝不往下取：否则目标 6 时会把 5 字符的 stone 放进来，
  // 又回到「第 1 关太简单」的老问题。
  const windowed = pool.filter((text) => {
    const length = [...text].length;
    return length >= target && length <= target + 2;
  });
  // 窗口空说明这个长度附近没词，退回最近的若干条，别让题目出不来。
  const distances = pool.map((text) => Math.abs([...text].length - target));
  const best = Math.min(...distances);
  const near = windowed.length ? windowed : pool.filter((text, index) => distances[index] <= best + 1);
  // 升关时目标长度会跳，候选池随之变化，光靠下标轮转仍可能撞上一题；这里再排一次。
  const candidates = near.length > 1 ? near.filter((text) => text !== exclude) : near;
  const start = offset + sequence;
  const text = candidates[start % candidates.length];
  // 岔路要两个字头不同，否则两个选项打起来没区别；顺着池子往后找第一个字头不同的。
  let otherText = text;
  for (let step = 1; step < candidates.length; step += 1) {
    const candidate = candidates[(start + step) % candidates.length];
    if (candidate[0] !== text[0]) { otherText = candidate; break; }
  }
  if (otherText === text) otherText = pool.find((item) => item[0] !== text[0]) || text;
  return { text, otherText };
}

function challengeFor(seed, sequence, language, activeMs = 0, excludeText = '') {
  const level = 1 + Math.floor((sequence - 1) / LEVEL_STEPS);
  const difficulty = difficultyOf(level, activeMs);
  const hash = crypto.createHash('sha256').update(`${seed}:${sequence}`).digest();
  const { text, otherText } = pickTexts(WORDS[language], targetLength(language, difficulty), sequence, runOffset(seed), excludeText);
  const action = sequence % 5 === 0 ? 'fork' : ACTIONS[(sequence - 1 + hash[0] % 3) % ACTIONS.length];
  const choices = action === 'fork' ? [
    { direction: 'left', name: '藤蔓密林', text, hint: meaningOf(language, text) },
    { direction: 'right', name: '晨光古塔', text: otherText, hint: meaningOf(language, otherText) }
  ] : undefined;
  // 岔路两条都要打完才安全，所以按较长的那条算时间。
  const longest = choices ? Math.max([...text].length, [...otherText].length) : [...text].length;
  const duration = durationFor(language, longest, difficulty);
  return { sequence, level, difficulty: Number(difficulty.toFixed(2)), text, hint: meaningOf(language, text), action, label: action === 'fork' ? '岔路选择' : ACTION_LABELS[action], duration, ...(choices ? { choices, selection: 'left' } : {}) };
}

class RunnerRun {
  constructor({ userId, language = 'english', now = Date.now, onFinish = () => {}, saved }) {
    this.now = now; this.onFinish = onFinish;
    if (saved) Object.assign(this, saved);
    else {
      this.id = crypto.randomUUID(); this.userId = userId; this.language = language;
      this.createdAt = now(); this.phase = 'countdown'; this.startsAt = now() + COUNTDOWN_MS;
      this.lives = 3; this.passed = 0; this.cleared = 0; this.score = 0; this.distance = 0;
      this.correct = 0; this.attempted = 0; this.combo = 0; this.bestCombo = 0;
      this.activeMs = 0; this.lastTickAt = this.startsAt; this.lastInputId = 0;
      this.task = null; this.event = null; this.endedAt = null; this.reason = null;
    }
    this.routeTurns ||= []; this.heading ||= 0; this.turnCount ||= 0;
    this.observedAt ??= this.lastTickAt;
    if (this.task && !Number.isFinite(this.task.routeAt)) this.task.routeAt = this.distance + Math.max(0, this.task.deadline + GRACE_MS - this.lastTickAt) / 1000 * this.speed;
  }
  get level() { return 1 + Math.floor(this.passed / LEVEL_STEPS); }
  get speed() { return 8 + Math.min(13, (this.level - 1) * .55); }
  get accuracy() { return this.attempted ? Math.round(this.correct / this.attempted * 100) : 100; }
  newTask(at) {
    const spec = challengeFor(this.id, this.passed + 1, this.language, this.activeMs, this.task?.text || '');
    this.task = { ...spec, id: crypto.randomUUID(), startsAt: at, deadline: at + spec.duration,
      routeAt: this.distance + (spec.duration + GRACE_MS) / 1000 * this.speed, typed: '', cleared: false };
  }
  tick() {
    const time = this.now();
    this.observedAt = time;
    if (this.phase === 'countdown' && time >= this.startsAt) {
      this.phase = 'running'; this.lastTickAt = this.startsAt;
      if (this.pausedPhase === 'recovering') {
        this.phase = 'recovering';
        this.recovery.at = this.startsAt - (RECOVERY_MS - this.pausedRecoveryMs);
        this.recovery.until = this.startsAt + this.pausedRecoveryMs;
      } else if (this.task) {
        this.task.startsAt = this.startsAt;
        this.task.deadline = this.startsAt + this.pausedRemaining;
      } else this.newTask(this.startsAt);
    }
    if (!['running', 'recovering'].includes(this.phase)) return;
    // 每次先走到障碍结算点，再更新速度，避免长时间断线凭空跑远。
    while (['running', 'recovering'].includes(this.phase)) {
      if (this.phase === 'recovering') {
        if (time < this.recovery.until) return;
        const at = this.recovery.until;
        if (this.lives <= 0) { this.finish('collision', at); return; }
        this.recovery = null; this.phase = 'running'; this.lastTickAt = at; this.newTask(at);
      }
      const boundary = this.task.deadline + GRACE_MS;
      const end = Math.min(time, boundary), elapsed = Math.max(0, end - this.lastTickAt);
      this.distance += elapsed / 1000 * this.speed; this.activeMs += elapsed; this.lastTickAt = end;
      if (time < boundary) break;
      if (!this.task.cleared) {
        this.lives--; this.combo = 0;
        this.event = { sequence: this.task.sequence, action: this.task.action, outcome: 'miss', at: boundary };
        this.recovery = { sequence: this.task.sequence, action: this.task.action, at: boundary, until: boundary + RECOVERY_MS, distance: this.distance };
        this.passed++; this.phase = 'recovering';
        continue;
      }
      if (this.task.action === 'fork') {
        const from = this.heading, direction = this.task.selection;
        this.heading += direction === 'left' ? -TURN_ANGLE : TURN_ANGLE;
        this.routeTurns.push({ sequence: this.task.sequence, distance: this.distance, from, to: this.heading, direction });
        this.routeTurns = this.routeTurns.slice(-8); this.turnCount++;
        this.routeName = this.task.choices.find(choice => choice.direction === direction).name;
      }
      this.passed++;
      this.newTask(boundary);
    }
  }
  type(body) {
    this.tick();
    if (body.ticket !== this.task?.id) fail('障碍已更新，请继续输入新的文字', 409);
    if (!Number.isSafeInteger(body.inputId) || body.inputId < 1) fail('输入序号不正确');
    if (body.inputId <= this.lastInputId) return;
    if (this.phase !== 'running') fail('当前不能输入', 409);
    const maxLength = Math.max(this.task.text.length, ...(this.task.choices || []).map(choice => choice.text.length));
    if (typeof body.text !== 'string' || body.text.length > maxLength + 8 || /[\r\n\x00-\x1f]/.test(body.text)) fail('输入内容不正确');
    if (this.task.cleared) { this.lastInputId = body.inputId; return; }
    let previous = this.task.typed;
    if (this.task.action === 'fork') {
      const direction = body.direction || this.task.selection;
      const choice = this.task.choices.find(item => item.direction === direction);
      if (!choice) fail('请选择左路或右路');
      if (direction !== this.task.selection) previous = '';
      this.task.selection = direction; this.task.text = choice.text;
    }
    const target = this.task.text;
    let common = 0;
    while (common < Math.min(previous.length, body.text.length) && previous[common] === body.text[common]) common++;
    for (let i = common; i < body.text.length; i++) {
      this.attempted++;
      if (body.text[i] === target[i]) this.correct++;
    }
    this.lastInputId = body.inputId; this.task.typed = body.text;
    if (body.text === target) {
      this.task.cleared = true; this.cleared++; this.combo++; this.bestCombo = Math.max(this.combo, this.bestCombo);
      this.score += Math.round((100 + target.length * 10) * (1 + Math.min(2, Math.floor(this.combo / 10) * .25)) * (1 + (this.level - 1) * .1));
      this.event = { sequence: this.task.sequence, action: this.task.action, direction: this.task.selection, outcome: 'clear', at: this.now() };
    }
  }
  pause() {
    this.tick();
    if (!['running', 'countdown', 'recovering'].includes(this.phase)) return;
    if (this.phase !== 'countdown') this.pausedRemaining = this.task ? Math.max(-GRACE_MS, this.task.deadline - this.now()) : null;
    if (!(this.phase === 'countdown' && this.pausedPhase === 'recovering')) { this.pausedPhase = this.phase; this.pausedAt = this.now(); }
    if (this.phase === 'recovering') this.pausedRecoveryMs = Math.max(0, this.recovery.until - this.now());
    this.phase = 'paused';
  }
  resume() {
    if (this.phase !== 'paused') fail('当前没有暂停的游戏', 409);
    this.startsAt = this.now() + COUNTDOWN_MS; this.phase = 'countdown';
  }
  finish(reason = 'exit', at = this.now()) {
    if (this.phase === 'finished') return;
    this.phase = 'finished'; this.reason = reason; this.endedAt = at; this.onFinish(this);
  }
  snapshot() {
    const { now, onFinish, ...saved } = this;
    return saved;
  }
  state() {
    this.tick();
    return { ...this.snapshot(), level: this.level, speed: this.speed, accuracy: this.accuracy,
      serverNow: this.now(), levelProgress: this.passed % LEVEL_STEPS, levelSteps: LEVEL_STEPS,
      upcoming: (() => {
        let routeAt = this.task?.routeAt ?? this.distance;
        return [1, 2].map(ahead => {
          const spec = challengeFor(this.id, (this.task?.sequence ?? this.passed + 1) + ahead, this.language, this.activeMs, this.task?.text || '');
          routeAt += (spec.duration + GRACE_MS) / 1000 * (8 + Math.min(13, (spec.level - 1) * .55));
          return { ...spec, routeAt };
        });
      })() };
  }
}

function installRunner(app, { db, requireUser, now }) {
  db.exec(`CREATE TABLE IF NOT EXISTS runner_runs (
    id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    language TEXT NOT NULL, started_at INTEGER NOT NULL, ended_at INTEGER,
    distance REAL NOT NULL DEFAULT 0, score INTEGER NOT NULL DEFAULT 0, level INTEGER NOT NULL DEFAULT 1,
    accuracy REAL NOT NULL DEFAULT 100, state_json TEXT NOT NULL
  ); CREATE INDEX IF NOT EXISTS idx_runner_rank ON runner_runs(language, ended_at, distance DESC);
  CREATE INDEX IF NOT EXISTS idx_runner_user ON runner_runs(user_id, started_at DESC);`);
  const active = new Map();
  const persist = run => db.prepare(`UPDATE runner_runs SET ended_at=?, distance=?, score=?, level=?, accuracy=?, state_json=? WHERE id=?`)
    .run(run.endedAt, run.distance, run.score, run.level, run.accuracy, JSON.stringify(run.snapshot()), run.id);
  const finish = run => db.transaction(() => {
    persist(run);
    if (!run.attempted) return;
    db.prepare(`INSERT INTO training_sessions(user_id,mode,lesson_title,correct_chars,wrong_chars,accuracy,speed,duration_ms,completed_at,source_key,is_finalized)
      VALUES(?, 'runner', ?, ?, ?, ?, ?, ?, ?, ?, 1) ON CONFLICT(source_key) WHERE source_key IS NOT NULL DO NOTHING`)
      .run(run.userId, `遗迹逃亡 · 第 ${run.level} 关`, run.correct, run.attempted - run.correct, run.accuracy,
        Math.round(run.correct / Math.max(1000, run.activeMs) * 60000), run.activeMs, run.endedAt, `runner:${run.id}`);
  })();
  function current(userId, runId) {
    let run = active.get(userId);
    if (!run) {
      const row = db.prepare('SELECT state_json FROM runner_runs WHERE user_id=? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1').get(userId);
      if (row) {
        const saved = JSON.parse(row.state_json);
        run = new RunnerRun({ now, onFinish: finish, saved });
        // 重启后恢复为暂停，使用最后保存的剩余时间，不让服务器停机消耗生命。
        if (run.phase !== 'paused') {
          if (!(run.phase === 'countdown' && run.pausedPhase === 'recovering')) { run.pausedPhase = run.phase; run.pausedAt = run.observedAt; }
          if (run.phase === 'recovering') run.pausedRecoveryMs = Math.max(0, run.recovery.until - run.observedAt);
          if (run.phase !== 'countdown') run.pausedRemaining = run.task ? Math.max(-GRACE_MS, run.task.deadline - run.lastTickAt) : null;
          run.phase = 'paused';
        }
        active.set(userId, run); persist(run);
      }
    }
    if (runId && run?.id !== runId) {
      const row = db.prepare('SELECT * FROM runner_runs WHERE id=? AND user_id=?').get(runId, userId);
      if (!row) fail('这局游戏不属于当前账号', 404);
      if (row.ended_at === null) fail('游戏已更新，请同步后重试', 409);
      return new RunnerRun({ now, onFinish: finish, saved: JSON.parse(row.state_json) });
    }
    if (runId && !run) fail('游戏不存在', 404);
    return run;
  }
  const route = fn => (req, res, next) => { try { res.json(fn(req)); } catch (error) { if (error.status) res.status(error.status).json({ message: error.message }); else next(error); } };
  app.get('/api/runner', requireUser, route(req => {
    const run = current(req.user.id);
    if (!run) return { phase: 'idle', serverNow: now() };
    const state = run.state(); persist(run); return state;
  }));
  app.post('/api/runner/start', requireUser, route(req => {
    const language = req.body.language || 'english';
    if (!['english', 'chinese'].includes(language)) fail('请选择中文或英文');
    const previous = current(req.user.id);
    // 请求重试不创建第二局；再次挑战只在结算后开放。
    if (previous) { previous.tick(); persist(previous); if (previous.phase !== 'finished') return previous.state(); }
    const run = new RunnerRun({ userId: req.user.id, language, now, onFinish: finish });
    db.prepare('INSERT INTO runner_runs(id,user_id,language,started_at,state_json) VALUES(?,?,?,?,?)')
      .run(run.id, req.user.id, language, run.createdAt, JSON.stringify(run.snapshot()));
    active.set(req.user.id, run); return run.state();
  }));
  for (const action of ['type', 'pause', 'resume', 'finish']) app.post(`/api/runner/${action}`, requireUser, route(req => {
    if (typeof req.body.runId !== 'string') fail('请提供当前游戏编号');
    const run = current(req.user.id, req.body.runId);
    if (!run) fail('请先开始游戏', 409);
    if (action === 'type') run.type(req.body);
    else if (action === 'finish') { run.tick(); run.finish(); }
    else run[action]();
    const state = run.state(); persist(run); return state;
  }));
  app.get('/api/runner/leaderboard', route(req => {
    const language = req.query.language || 'english', period = req.query.period || 'all';
    if (!['english', 'chinese'].includes(language) || !['all', 'today'].includes(period)) fail('排行榜筛选不正确');
    // 日榜按北京时间零点划分，使用传入时钟，避免执行主机时区影响结果。
    const dayStart = Math.floor((now() + 8 * 3600000) / 86400000) * 86400000 - 8 * 3600000;
    const rows = db.prepare(`WITH personal AS (
      SELECT r.*, u.display_name AS name, ROW_NUMBER() OVER(PARTITION BY r.user_id ORDER BY r.distance DESC,r.score DESC,r.accuracy DESC,r.ended_at ASC,r.id) AS personal_rank
      FROM runner_runs r JOIN users u ON u.id=r.user_id
      WHERE r.ended_at IS NOT NULL AND r.score>0 AND r.language=? AND u.is_active=1 AND r.ended_at>=?
    ), ranked AS (
      SELECT *, ROW_NUMBER() OVER(ORDER BY distance DESC,score DESC,accuracy DESC,ended_at ASC,id) AS rank FROM personal WHERE personal_rank=1
    ) SELECT user_id AS userId,name,distance,score,level,accuracy,rank FROM ranked ORDER BY rank`).all(language, period === 'today' ? dayStart : 0);
    const mapRow = row => ({ ...row, distance: Math.floor(row.distance), isCurrentUser: row.userId === req.user?.id });
    return { rows: rows.slice(0, 20).map(mapRow), myBest: rows.find(row => row.userId === req.user?.id) ? mapRow(rows.find(row => row.userId === req.user?.id)) : null, total: rows.length, period, language };
  }));
}
module.exports = { RunnerRun, challengeFor, difficultyOf, targetLength, durationFor, installRunner, COUNTDOWN_MS, GRACE_MS, LEVEL_STEPS, RECOVERY_MS };
