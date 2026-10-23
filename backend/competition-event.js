// 比赛赛事引擎：个人用时淘汰赛（M1）
//
// 与旧 competition.js 的区别
//   旧：90 秒内比谁打对的字多（字数赛），房间只在内存里。
//   新：打完整篇比谁快（用时赛），赛事/轮次/成绩全部落库，进程重启能恢复。
//
// 赛程（单日快赛）
//   draft 建赛 → registration 检录 → running 第 N 轮 → … → finished
//   每轮按用时排名，保留 ceil(人数 × 保留比例)，剩 3 人及以下进入决赛轮不再淘汰。
//
// 完成判定
//   打完整篇（输入长度到齐）**且** 准确率 ≥ 门槛，才算完成并记录用时。
//   只比用时会诱导乱敲，所以准确率是硬门槛。
//
// 参数全部来自 config，代码里不写死任何时长。

const crypto = require('node:crypto');
const { textAt } = require('./competition-texts');

const DEFAULT_CONFIG = Object.freeze({
  registrationMs: 10 * 60_000, // 检录时长
  countdownMs: 3_000, // 开赛前全屏倒计时
  roundMs: 3 * 60_000, // 每轮时长上限
  gapMs: 60_000, // 轮间间隔
  resultMs: 30_000, // 成绩展示
  accuracyThreshold: 95, // 完成所需准确率
  keepRatio: 0.5, // 每轮保留比例
  level: 'standard', // 题库档位
  capacity: 60, // 报名上限
  maxBatch: 16 // 单次提交上限
});

const FINAL_ROUND_SIZE = 3; // 剩 3 人及以下进决赛轮
const MIN_PLAYERS = 2;

function accuracyOf(correct, attempted) {
  return attempted ? Math.round((correct / attempted) * 100) : 100;
}

function fail(message, status = 400) {
  throw Object.assign(new Error(message), { status });
}

class CompetitionEvent {
  constructor(db, { now = Date.now } = {}) {
    this.db = db;
    this.now = now;
    this.ensureSchema();
  }

  ensureSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS competitions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        kind TEXT NOT NULL,
        schedule TEXT NOT NULL,
        status TEXT NOT NULL,
        config_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        started_at INTEGER,
        ended_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS competition_rounds (
        id TEXT PRIMARY KEY,
        competition_id TEXT NOT NULL,
        round_no INTEGER NOT NULL,
        text TEXT NOT NULL,
        level TEXT NOT NULL,
        duration_ms INTEGER NOT NULL,
        keep_count INTEGER NOT NULL,
        is_final INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL,
        planned_at INTEGER,
        started_at INTEGER,
        ended_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS competition_entries (
        competition_id TEXT NOT NULL,
        user_id INTEGER NOT NULL,
        seat TEXT NOT NULL,
        team_id TEXT,
        joined_at INTEGER NOT NULL,
        reached_round INTEGER NOT NULL DEFAULT 0,
        final_rank INTEGER,
        status TEXT NOT NULL DEFAULT 'active',
        PRIMARY KEY (competition_id, user_id)
      );
      CREATE TABLE IF NOT EXISTS competition_round_results (
        round_id TEXT NOT NULL,
        user_id INTEGER NOT NULL,
        typed TEXT NOT NULL DEFAULT '',
        correct INTEGER NOT NULL DEFAULT 0,
        attempted INTEGER NOT NULL DEFAULT 0,
        elapsed_ms INTEGER,
        finished_at INTEGER,
        rank INTEGER,
        advanced INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (round_id, user_id)
      );
    `);
  }

  // ------------------------------------------------------------ 建赛与检录

  create({ name = '打字比赛', config = {} } = {}) {
    const id = crypto.randomUUID();
    const merged = { ...DEFAULT_CONFIG, ...(config || {}) };
    this.db.prepare(`INSERT INTO competitions (id, name, kind, schedule, status, config_json, created_at)
      VALUES (?, ?, 'individual', 'single', 'draft', ?, ?)`)
      .run(id, String(name).slice(0, 40), JSON.stringify(merged), this.now());
    return { id, name, config: merged, status: 'draft' };
  }

  get(id) {
    const row = this.db.prepare('SELECT * FROM competitions WHERE id = ?').get(id);
    if (!row) fail('赛事不存在', 404);
    return row;
  }

  configOf(row) {
    return { ...DEFAULT_CONFIG, ...JSON.parse(row.config_json) };
  }

  openRegistration(id) {
    const row = this.get(id);
    if (row.status !== 'draft') fail('只有草稿状态的赛事可以开启检录');
    this.db.prepare('UPDATE competitions SET status = ? WHERE id = ?').run('registration', id);
    return this.state(id);
  }

  join(id, user) {
    const row = this.get(id);
    if (row.status !== 'registration') fail('赛事不在检录阶段，无法加入');
    const config = this.configOf(row);
    const existing = this.db.prepare('SELECT * FROM competition_entries WHERE competition_id = ? AND user_id = ?').get(id, user.id);
    if (existing) return existing;
    const total = this.db.prepare('SELECT COUNT(*) AS n FROM competition_entries WHERE competition_id = ?').get(id).n;
    if (total >= config.capacity) fail('报名人数已满', 409);
    const seat = crypto.randomUUID();
    this.db.prepare(`INSERT INTO competition_entries (competition_id, user_id, seat, joined_at, status)
      VALUES (?, ?, ?, ?, 'active')`).run(id, user.id, seat, this.now());
    return this.db.prepare('SELECT * FROM competition_entries WHERE competition_id = ? AND user_id = ?').get(id, user.id);
  }

  // ------------------------------------------------------------ 轮次

  activeEntries(id) {
    return this.db.prepare(`SELECT * FROM competition_entries
      WHERE competition_id = ? AND status = 'active' ORDER BY joined_at, user_id`).all(id);
  }

  runningRound(id) {
    return this.db.prepare(`SELECT * FROM competition_rounds
      WHERE competition_id = ? AND status = 'running' ORDER BY round_no DESC LIMIT 1`).get(id);
  }

  latestRound(id) {
    return this.db.prepare(`SELECT * FROM competition_rounds
      WHERE competition_id = ? ORDER BY round_no DESC LIMIT 1`).get(id);
  }

  roundOf(id, roundId) {
    const round = this.db.prepare('SELECT * FROM competition_rounds WHERE id = ? AND competition_id = ?').get(roundId, id);
    if (!round) fail('轮次不存在', 404);
    return round;
  }

  beginRound(id) {
    const row = this.get(id);
    if (row.status === 'finished') fail('赛事已结束');
    if (!['registration', 'running'].includes(row.status)) fail('当前不能开始新一轮');
    if (this.runningRound(id)) fail('本轮还在进行中，请先结算');

    const active = this.activeEntries(id);
    if (active.length < MIN_PLAYERS) fail(`至少需要 ${MIN_PLAYERS} 名选手`);

    const config = this.configOf(row);
    const previous = this.latestRound(id);
    const roundNo = (previous?.round_no || 0) + 1;
    const isFinal = active.length <= FINAL_ROUND_SIZE ? 1 : 0;
    const keepCount = isFinal ? active.length : Math.max(MIN_PLAYERS, Math.ceil(active.length * config.keepRatio));
    const text = textAt(config.level, roundNo - 1);
    const roundId = crypto.randomUUID();
    const now = this.now();

    this.db.prepare(`INSERT INTO competition_rounds
      (id, competition_id, round_no, text, level, duration_ms, keep_count, is_final, status, started_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'running', ?)`)
      .run(roundId, id, roundNo, text, config.level, config.roundMs, keepCount, isFinal, now);

    this.db.prepare(`UPDATE competitions SET status = 'running', started_at = COALESCE(started_at, ?) WHERE id = ?`)
      .run(now, id);

    for (const entry of active) {
      this.db.prepare(`INSERT INTO competition_round_results (round_id, user_id) VALUES (?, ?)
        ON CONFLICT(round_id, user_id) DO NOTHING`).run(roundId, entry.user_id);
    }
    return this.state(id);
  }

  // ------------------------------------------------------------ 作答

  submit(id, userId, text) {
    const row = this.get(id);
    if (row.status !== 'running') fail('赛事不在进行中');
    const round = this.runningRound(id);
    if (!round) fail('当前没有进行中的轮次');
    const config = this.configOf(row);
    const now = this.now();
    if (now >= round.started_at + round.duration_ms) fail('本轮时间已到', 409);

    const entry = this.db.prepare('SELECT * FROM competition_entries WHERE competition_id = ? AND user_id = ?').get(id, userId);
    if (!entry || entry.status !== 'active') fail('你不在本轮参赛名单中', 403);

    const result = this.db.prepare('SELECT * FROM competition_round_results WHERE round_id = ? AND user_id = ?').get(round.id, userId);
    if (!result) fail('本轮成绩记录缺失', 409);
    if (result.finished_at) return this.state(id);

    const previous = result.typed || '';
    if (typeof text !== 'string'
      || !text.startsWith(previous)
      || text.length > round.text.length
      || text.length - previous.length > config.maxBatch) {
      fail('请按顺序输入当前段落');
    }
    if (text === previous) return this.state(id);

    let correct = result.correct;
    let attempted = result.attempted;
    for (let index = previous.length; index < text.length; index += 1) {
      attempted += 1;
      if (text[index] === round.text[index]) correct += 1;
    }

    const accuracy = accuracyOf(correct, attempted);
    const complete = text.length === round.text.length && accuracy >= config.accuracyThreshold;
    const finishedAt = complete ? now : null;
    const elapsedMs = complete ? Math.max(0, now - round.started_at) : null;

    this.db.prepare(`UPDATE competition_round_results
      SET typed = ?, correct = ?, attempted = ?, finished_at = ?, elapsed_ms = ?
      WHERE round_id = ? AND user_id = ?`)
      .run(text, correct, attempted, finishedAt, elapsedMs, round.id, userId);

    // 注意：一个人打完**不结算整轮**，本轮继续到时限或全员完成（由 tick 处理）
    return this.state(id);
  }

  // 时限到，或本轮所有人都已打完 → 自动结算
  tick(id) {
    const round = this.runningRound(id);
    if (!round) return;
    const active = this.activeEntries(id);
    if (!active.length) return;
    const done = this.db.prepare('SELECT COUNT(*) AS n FROM competition_round_results WHERE round_id = ? AND finished_at IS NOT NULL')
      .get(round.id).n;
    const timeUp = this.now() >= round.started_at + round.duration_ms;
    if (timeUp || done >= active.length) this.settle(id);
  }

  // ------------------------------------------------------------ 结算与晋级

  settle(id) {
    const row = this.get(id);
    const round = this.runningRound(id);
    if (!round) fail('当前没有进行中的轮次');

    const now = this.now();
    const entries = this.activeEntries(id);
    const results = new Map(
      this.db.prepare('SELECT * FROM competition_round_results WHERE round_id = ?').all(round.id)
        .map((item) => [item.user_id, item])
    );

    const rows = entries.map((entry) => {
      const result = results.get(entry.user_id) || { typed: '', correct: 0, attempted: 0, elapsed_ms: null, finished_at: null };
      return {
        entry,
        correct: result.correct,
        attempted: result.attempted,
        accuracy: accuracyOf(result.correct, result.attempted),
        elapsedMs: result.elapsed_ms,
        finished: result.finished_at !== null
      };
    });

    // 完成者按用时升序，未完成者排在后面按字数降序
    rows.sort((a, b) => {
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      if (a.finished) return a.elapsedMs - b.elapsedMs || b.accuracy - a.accuracy;
      return b.correct - a.correct || b.accuracy - a.accuracy;
    });

    const keepCount = round.keep_count;
    const advance = (entry) => this.db.prepare(`UPDATE competition_entries
      SET status = ?, reached_round = ?, final_rank = ? WHERE competition_id = ? AND user_id = ?`);

    rows.forEach((item, index) => {
      const rank = index + 1;
      const advanced = rank <= keepCount ? 1 : 0;
      this.db.prepare(`UPDATE competition_round_results SET rank = ?, advanced = ? WHERE round_id = ? AND user_id = ?`)
        .run(rank, advanced, round.id, item.entry.user_id);
      if (advanced) advance().run('active', round.round_no, null, id, item.entry.user_id);
      else advance().run('eliminated', round.round_no, null, id, item.entry.user_id);
    });

    this.db.prepare('UPDATE competition_rounds SET status = ?, ended_at = ? WHERE id = ?')
      .run('settled', now, round.id);

    if (round.is_final) this.finish(id);
    return this.state(id);
  }

  finish(id) {
    const row = this.get(id);
    if (row.status === 'finished') return this.state(id);
    const round = this.latestRound(id);
    if (!round || round.status !== 'settled') fail('还没有已结算的轮次');

    // 全部参赛者一起排：打到更后面的轮次优先，同轮按该轮名次
    const ranked = this.db.prepare(`
      SELECT e.user_id, e.reached_round, rr.rank
      FROM competition_entries e
      LEFT JOIN competition_rounds r
        ON r.competition_id = e.competition_id AND r.round_no = e.reached_round
      LEFT JOIN competition_round_results rr
        ON rr.round_id = r.id AND rr.user_id = e.user_id
      WHERE e.competition_id = ?
      ORDER BY e.reached_round DESC, COALESCE(rr.rank, 999) ASC, e.joined_at ASC
    `).all(id);

    const setRank = this.db.prepare('UPDATE competition_entries SET final_rank = ? WHERE competition_id = ? AND user_id = ?');
    ranked.forEach((item, index) => setRank.run(index + 1, id, item.user_id));

    this.db.prepare(`UPDATE competitions SET status = 'finished', ended_at = ? WHERE id = ?`).run(this.now(), id);
    return this.state(id);
  }

  // ------------------------------------------------------------ 对外状态

  state(id) {
    this.tick(id);
    const row = this.get(id);
    const config = this.configOf(row);
    const round = this.runningRound(id) || this.latestRound(id);
    const entries = this.db.prepare(`SELECT e.*, u.display_name AS name
      FROM competition_entries e LEFT JOIN users u ON u.id = e.user_id
      WHERE e.competition_id = ? ORDER BY e.joined_at, e.user_id`).all(id);
    const results = round
      ? new Map(this.db.prepare('SELECT * FROM competition_round_results WHERE round_id = ?').all(round.id)
        .map((item) => [item.user_id, item]))
      : new Map();

    const players = entries.map((entry) => {
      const result = results.get(entry.user_id) || null;
      return {
        userId: entry.user_id,
        name: entry.name || `选手${entry.user_id}`,
        seat: entry.seat,
        status: entry.status,
        reachedRound: entry.reached_round,
        finalRank: entry.final_rank,
        typed: result?.typed || '',
        correct: result?.correct || 0,
        attempted: result?.attempted || 0,
        accuracy: accuracyOf(result?.correct || 0, result?.attempted || 0),
        elapsedMs: result?.elapsed_ms ?? null,
        finished: result?.finished_at != null,
        rank: result?.rank ?? null,
        advanced: result?.advanced === 1
      };
    });

    const ranking = players
      .filter((player) => player.rank !== null)
      .sort((a, b) => a.rank - b.rank);

    return {
      id: row.id,
      name: row.name,
      status: row.status,
      config,
      round: round
        ? {
          id: round.id,
          no: round.round_no,
          status: round.status,
          text: round.text,
          level: round.level,
          durationMs: round.duration_ms,
          keepCount: round.keep_count,
          isFinal: round.is_final === 1,
          startsAt: round.started_at,
          endsAt: round.started_at === null ? null : round.started_at + round.duration_ms
        }
        : null,
      serverNow: this.now(),
      playerCount: players.filter((player) => player.status === 'active').length,
      players,
      ranking
    };
  }
}

module.exports = { CompetitionEvent, DEFAULT_CONFIG, FINAL_ROUND_SIZE, MIN_PLAYERS, accuracyOf };
