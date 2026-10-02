const crypto = require('node:crypto');

const COUNTDOWN_MS = 3000, GRACE_MS = 350, LEVEL_STEPS = 10;
const WORDS = {
  english: [
    ['run', 'sun', 'jump', 'tree', 'path', 'gold', 'wind', 'rock', 'lake', 'wild', 'leaf', 'gate', 'fire', 'dash', 'moon', 'star'],
    ['temple', 'forest', 'bridge', 'escape', 'silver', 'island', 'hidden', 'flower', 'secret', 'jungle', 'sprint', 'canyon', 'torch', 'valley', 'stone', 'brave'],
    ['adventure', 'discovery', 'waterfall', 'treasure', 'mountain', 'explorer', 'guardian', 'sunlight', 'ancient', 'courage', 'journey', 'mystery', 'horizon', 'freedom']
  ],
  chinese: [
    ['出发', '奔跑', '森林', '勇气', '星光', '前进', '石桥', '发现', '宝藏', '远方', '山谷', '跳跃'],
    ['保持专注', '勇往直前', '穿越丛林', '跨越石桥', '寻找宝藏', '追逐阳光', '放松双手', '稳住节奏', '继续前进', '探索遗迹'],
    ['每一步都是进步', '相信自己的力量', '专注眼前的道路', '勇敢迎接新挑战', '沿着星光向前跑', '保持准确的节奏', '探索未知的世界', '坚持就能走更远']
  ]
};
const ACTIONS = ['jump', 'slide', 'left', 'right'];
const ACTION_LABELS = { jump: '跳过断桥', slide: '滑过石门', left: '向左避障', right: '向右避障' };
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
function challengeFor(seed, sequence, language) {
  const level = 1 + Math.floor((sequence - 1) / LEVEL_STEPS);
  const hash = crypto.createHash('sha256').update(`${seed}:${sequence}`).digest();
  const tier = level < 3 ? 0 : level < 7 ? 1 : 2;
  const pool = WORDS[language][tier];
  const action = ACTIONS[(sequence - 1 + hash[0] % 3) % ACTIONS.length];
  // 中文长度随难度增加，给输入法留足完整上屏时间。
  const duration = language === 'chinese'
    ? Math.max(3300, 6500 + tier * 1100 - (level - 1) * 180)
    : Math.max(2400, 4800 + tier * 600 - (level - 1) * 180);
  return { sequence, level, text: pool[hash[1] % pool.length], action, label: ACTION_LABELS[action], duration };
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
  }
  get level() { return 1 + Math.floor(this.passed / LEVEL_STEPS); }
  get speed() { return 8 + Math.min(13, (this.level - 1) * .55); }
  get accuracy() { return this.attempted ? Math.round(this.correct / this.attempted * 100) : 100; }
  newTask(at) {
    const spec = challengeFor(this.id, this.passed + 1, this.language);
    this.task = { ...spec, id: crypto.randomUUID(), startsAt: at, deadline: at + spec.duration, typed: '', cleared: false };
  }
  tick() {
    const time = this.now();
    if (this.phase === 'countdown' && time >= this.startsAt) {
      this.phase = 'running'; this.lastTickAt = this.startsAt;
      if (this.task) {
        this.task.startsAt = this.startsAt;
        this.task.deadline = this.startsAt + this.pausedRemaining;
      } else this.newTask(this.startsAt);
    }
    if (this.phase !== 'running') return;
    // 每次先走到障碍结算点，再更新速度，避免长时间断线凭空跑远。
    while (this.phase === 'running') {
      const boundary = this.task.deadline + GRACE_MS;
      const end = Math.min(time, boundary), elapsed = Math.max(0, end - this.lastTickAt);
      this.distance += elapsed / 1000 * this.speed; this.activeMs += elapsed; this.lastTickAt = end;
      if (time < boundary) break;
      if (!this.task.cleared) {
        this.lives--; this.combo = 0;
        this.event = { sequence: this.task.sequence, action: this.task.action, outcome: 'miss', at: boundary };
      }
      this.passed++;
      if (this.lives <= 0) this.finish('collision', boundary);
      else this.newTask(boundary);
    }
  }
  type(body) {
    this.tick();
    if (body.ticket !== this.task?.id) fail('障碍已更新，请继续输入新的文字', 409);
    if (!Number.isSafeInteger(body.inputId) || body.inputId < 1) fail('输入序号不正确');
    if (body.inputId <= this.lastInputId) return;
    if (this.phase !== 'running') fail('当前不能输入', 409);
    if (typeof body.text !== 'string' || body.text.length > this.task.text.length + 8 || /[\r\n\x00-\x1f]/.test(body.text)) fail('输入内容不正确');
    if (this.task.cleared) { this.lastInputId = body.inputId; return; }
    const previous = this.task.typed, target = this.task.text;
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
      this.event = { sequence: this.task.sequence, action: this.task.action, outcome: 'clear', at: this.now() };
    }
  }
  pause() {
    this.tick();
    if (!['running', 'countdown'].includes(this.phase)) return;
    this.pausedRemaining = this.task ? Math.max(0, this.task.deadline - this.now()) : null;
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
      upcoming: [1, 2].map(ahead => challengeFor(this.id, this.passed + ahead + 1, this.language)) };
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
    db.prepare(`INSERT INTO training_sessions(user_id,mode,lesson_title,correct_chars,wrong_chars,accuracy,speed,duration_ms,completed_at,source_key)
      VALUES(?, 'runner', ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(source_key) WHERE source_key IS NOT NULL DO NOTHING`)
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
          run.pausedRemaining = run.task ? Math.max(0, run.task.deadline - run.lastTickAt) : null;
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
module.exports = { RunnerRun, challengeFor, installRunner, COUNTDOWN_MS, GRACE_MS, LEVEL_STEPS };
