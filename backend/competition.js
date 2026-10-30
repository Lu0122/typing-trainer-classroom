// 比赛模式：多轮晋级赛。
//
// 赛程（个人赛）
//   waiting 检录 → qualifier 初赛 90 秒 → break 公布晋级 20 秒 → final 决赛 60 秒 → finished
//   初赛按正确字数取前 FINALISTS 名晋级；未晋级者留在房间观战，不再计分。
//
// 赛程（团队赛）
//   waiting → qualifier 90 秒 → finished。团队赛只打一轮，比红蓝两队总正确字数。
//
// 为什么让赛程自动推进
//   本项目没有独立的主持台，如果轮次要靠人点，比赛就会卡在「初赛结束没人开决赛」。
//   所以 tick() 里按 endsAt 自动切换阶段，老师只需要保证网络和投影。
//   房主（第一个加入的人）仍可以点「立即开始」把检录期提前结束。
//
// 公平性
//   - 计时全在服务端，客户端只负责显示。
//   - 逐字比对原始字符串，前端提交必须是已结算部分的前缀扩展，且单次最多 16 字。
//   - 速率窗口：3 秒内累计新增超过 45 字（15 字/秒）记为一次异常。
//     人类打字极限约 10 字/秒，正常选手 2~4 字/秒，这个阈值不会误伤，
//     但足以拦住「绕过前端直接打接口刷分」。
//   - 异常累计 3 次 → 本轮成绩作废（仍可留在房间观战，不会被踢）。

const crypto = require('node:crypto');
const { textAt } = require('./competition-texts');

const GATHER_MS = 240_000; // 检录期 4 分钟，够一个班陆续登录
const QUALIFIER_MS = 90_000;
const BREAK_MS = 20_000;
const FINAL_MS = 60_000;
const RESULT_MS = 30_000;
const FINALISTS = 16;
const CAPACITY = 60;
const OFFLINE_MS = 30_000;
const ROUND_MS = QUALIFIER_MS; // 兼容旧引用

const RATE_WINDOW_MS = 3_000;
const RATE_WINDOW_LIMIT = 45;
const SUSPECT_LIMIT = 3;
const MAX_BATCH = 16;

const LIVE_PHASES = new Set(['qualifier', 'final']);
const PHASE_LABELS = Object.freeze({
  waiting: '检录中',
  qualifier: '初赛',
  break: '公布晋级',
  final: '决赛',
  finished: '已结束'
});

function accuracyOf(stats) {
  return stats.attempted ? Math.round((stats.correct / stats.attempted) * 100) : 100;
}

function emptyStats() {
  return { correct: 0, attempted: 0, speed: null, durationMs: 0 };
}

class CompetitionRoom {
  constructor(mode, { now = Date.now, record = () => {}, save = () => {} } = {}) {
    if (!['personal', 'team'].includes(mode)) throw new Error('比赛类型不正确');
    this.mode = mode;
    this.now = now;
    this.record = record;
    this.save = save;
    this.config = {
      gatherMs: GATHER_MS,
      qualifierMs: QUALIFIER_MS,
      breakMs: BREAK_MS,
      finalMs: FINAL_MS,
      resultMs: RESULT_MS,
      finalists: FINALISTS,
      capacity: CAPACITY,
      rateWindowMs: RATE_WINDOW_MS,
      rateWindowLimit: RATE_WINDOW_LIMIT,
      suspectLimit: SUSPECT_LIMIT
    };
    this.reset();
  }

  reset() {
    this.round = crypto.randomUUID();
    this.phase = 'waiting';
    this.players = new Map();
    this.host = null;
    this.startsAt = null;
    this.phaseStartedAt = null;
    this.endsAt = null;
    this.result = null;
    this.rounds = { qualifier: null, final: null };
    this.events = [];
    this.eventId = 0;
  }

  fail(message, status = 400) {
    throw Object.assign(new Error(message), { status });
  }

  event(text, kind = 'info') {
    this.events.push({ id: ++this.eventId, text, kind, at: this.now() });
    this.events = this.events.slice(-18);
  }

  isLive() {
    return LIVE_PHASES.has(this.phase);
  }

  levelOf(phase = this.phase) {
    return phase === 'final' ? 'challenge' : 'standard';
  }

  nextText(player) {
    const level = this.levelOf();
    player.task = {
      id: crypto.randomUUID(),
      sequence: player.sequence,
      level,
      text: textAt(level, player.sequence - 1),
      typed: ''
    };
  }

  // ---------------------------------------------------------------- 选手进出

  createPlayer(user) {
    const teamCounts = { red: 0, blue: 0 };
    for (const item of this.players.values()) if (item.team) teamCounts[item.team] += 1;
    const team = this.mode === 'team' ? (teamCounts.red <= teamCounts.blue ? 'red' : 'blue') : null;
    return {
      id: user.id,
      name: user.displayName,
      avatarUrl: user.avatarUrl || null,
      seat: crypto.randomUUID(),
      team,
      seen: this.now(),
      joinedAt: this.now(),
      sequence: 1,
      task: null,
      lastAdvance: null,
      lastSaved: 0,
      stats: { qualifier: emptyStats(), final: emptyStats() },
      qualified: false,
      qualifiedRank: null,
      suspectCount: 0,
      disqualified: false,
      typeLog: []
    };
  }

  join(user) {
    this.tick();
    if (this.phase === 'finished') this.fail('本场已结束，请等待下一场');
    if (this.phase !== 'waiting') this.fail('比赛已经开始，本场无法再加入，请等待下一场');
    let player = this.players.get(user.id);
    if (!player) {
      if (this.players.size >= this.config.capacity) this.fail('比赛人数已满，请稍后再试', 409);
      player = this.createPlayer(user);
      this.players.set(user.id, player);
      if (this.host === null) this.host = user.id;
      this.event(`${player.name} 加入${this.mode === 'team' ? (player.team === 'red' ? '红队' : '蓝队') : '比赛'}`);
    }
    player.seen = this.now();
    if (this.startsAt === null) this.startsAt = this.now() + this.config.gatherMs;
    return this.state(user.id);
  }

  start(id) {
    this.tick();
    if (id !== this.host) this.fail('只有房主可以提前开始', 403);
    if (this.phase !== 'waiting') this.fail('当前不能开始新比赛');
    if (this.players.size < 1) this.fail('至少需要 1 名选手');
    this.enterPhase('qualifier');
    return this.state(id);
  }

  remove(player) {
    for (const phase of ['qualifier', 'final']) this.recordStats(player, phase, true);
    this.players.delete(player.id);
  }

  leave(id, seat) {
    const player = this.players.get(id);
    if (player && player.seat === seat) {
      this.remove(player);
      this.event(`${player.name} 离开了比赛`);
    }
    this.tick();
    return { ok: true };
  }

  // ---------------------------------------------------------------- 时钟推进

  tick() {
    const now = this.now();
    if (this.phase === 'finished') {
      if (now >= this.result.endedAt + this.config.resultMs) this.reset();
      return;
    }
    // 只在检录期清理离线选手。
    // 一旦开赛就永不剔除：浏览器切到后台会把轮询压到 1 分钟一次，
    // 中途把人踢掉会让「晋级了却打不了决赛」这种事故无法挽回。
    if (this.phase === 'waiting') {
      for (const player of [...this.players.values()]) {
        if (now - player.seen > OFFLINE_MS) this.remove(player);
      }
    }
    if (!this.players.has(this.host)) this.host = this.players.keys().next().value ?? null;
    if (!this.players.size) {
      this.startsAt = null;
      return;
    }
    if (this.phase === 'waiting') {
      if (this.startsAt === null) this.startsAt = now + this.config.gatherMs;
      if (now >= this.startsAt) this.enterPhase('qualifier');
      return;
    }
    if (this.endsAt !== null && now >= this.endsAt) this.advance();
  }

  enterPhase(phase) {
    const now = this.now();
    this.phase = phase;
    this.phaseStartedAt = now;
    if (phase === 'qualifier') {
      this.startsAt = now;
      this.endsAt = now + this.config.qualifierMs;
      for (const player of this.players.values()) {
        player.joinedAt = now;
        player.sequence = 1;
        player.stats.qualifier = emptyStats();
        player.typeLog = [];
        player.task = null;
        this.nextText(player);
      }
      this.event(`初赛开始，${Math.round(this.config.qualifierMs / 1000)} 秒，${this.players.size} 人参赛`, 'start');
      return;
    }
    if (phase === 'break') {
      this.endsAt = now + this.config.breakMs;
      for (const player of this.players.values()) player.task = null;
      const count = [...this.players.values()].filter((player) => player.qualified).length;
      this.event(`初赛结束，${count} 人晋级决赛`, 'break');
      return;
    }
    if (phase === 'final') {
      this.endsAt = now + this.config.finalMs;
      for (const player of this.players.values()) {
        player.stats.final = emptyStats();
        player.sequence = 1;
        player.typeLog = [];
        player.task = null;
        if (player.qualified) this.nextText(player);
      }
      this.event(`决赛开始，${Math.round(this.config.finalMs / 1000)} 秒，只有晋级选手计分`, 'start');
    }
  }

  advance() {
    if (this.phase === 'qualifier') {
      this.settleQualifier();
      if (this.mode === 'team') {
        this.finish('timeout');
        return;
      }
      this.enterPhase('break');
      return;
    }
    if (this.phase === 'break') {
      this.enterPhase('final');
      return;
    }
    if (this.phase === 'final') {
      this.settleFinal();
      this.finish('timeout');
    }
  }

  // ---------------------------------------------------------------- 结算

  settleQualifier() {
    if (this.rounds.qualifier) return;
    const duration = Math.max(1000, this.now() - this.phaseStartedAt);
    const rows = [];
    for (const player of this.players.values()) {
      const stats = player.stats.qualifier;
      stats.durationMs = duration;
      stats.speed = Math.round((stats.correct / duration) * 60000);
      rows.push({ player, stats });
    }
    rows.sort((a, b) => b.stats.correct - a.stats.correct
      || accuracyOf(b.stats) - accuracyOf(a.stats)
      || b.stats.speed - a.stats.speed);
    const valid = rows.filter((row) => !row.player.disqualified);
    const slots = this.mode === 'team' ? 0 : Math.min(this.config.finalists, valid.length);
    let rank = 0;
    this.rounds.qualifier = rows.map((row) => {
      const isValid = !row.player.disqualified;
      if (isValid) rank += 1;
      row.player.qualified = isValid && rank <= slots;
      row.player.qualifiedRank = isValid ? rank : null;
      return this.rankingRow(row.player, row.stats, isValid ? rank : null);
    });
    this.event(
      this.mode === 'team'
        ? '初赛结算完成，正在统计红蓝两队总分'
        : `初赛结算完成，前 ${slots} 名晋级决赛`,
      'settle'
    );
  }

  settleFinal() {
    if (this.rounds.final) return;
    const duration = Math.max(1000, this.now() - this.phaseStartedAt);
    const rows = [];
    for (const player of this.players.values()) {
      if (!player.qualified) continue;
      const stats = player.stats.final;
      stats.durationMs = duration;
      stats.speed = Math.round((stats.correct / duration) * 60000);
      rows.push({ player, stats });
    }
    rows.sort((a, b) => b.stats.correct - a.stats.correct
      || accuracyOf(b.stats) - accuracyOf(a.stats)
      || b.stats.speed - a.stats.speed);
    let rank = 0;
    this.rounds.final = rows.map((row) => {
      const isValid = !row.player.disqualified;
      if (isValid) rank += 1;
      return this.rankingRow(row.player, row.stats, isValid ? rank : null);
    });
    const champion = this.rounds.final.find((row) => row.rank === 1) || null;
    this.event(`决赛结束，冠军：${champion?.name ?? '无'}`, 'finish');
  }

  rankingRow(player, stats, rank) {
    return {
      rank,
      id: player.id,
      name: player.name,
      avatarUrl: player.avatarUrl || null,
      team: player.team,
      correct: stats.correct,
      attempted: stats.attempted,
      wrong: stats.attempted - stats.correct,
      accuracy: accuracyOf(stats),
      speed: stats.speed ?? 0,
      qualified: player.qualified,
      disqualified: player.disqualified,
      flagged: player.suspectCount > 0
    };
  }

  finish(outcome) {
    if (this.phase === 'finished') return;
    if (this.phase === 'qualifier') this.settleQualifier();
    if (this.phase === 'final') this.settleFinal();
    const now = this.now();
    const participants = [...this.players.values()].map((player) => this.publicPlayer(player));
    const teams = this.mode === 'team'
      ? ['red', 'blue'].map((team) => {
        const members = participants.filter((player) => player.team === team);
        return {
          team,
          correct: members.reduce((sum, player) => sum + player.correct, 0),
          attempted: members.reduce((sum, player) => sum + player.attempted, 0),
          members
        };
      })
      : [];
    const qualifierRanking = this.rounds.qualifier || [];
    const finalRanking = this.rounds.final || [];
    const winner = this.mode === 'team'
      ? teams.slice().sort((a, b) => b.correct - a.correct || b.attempted - a.attempted)[0] || null
      : finalRanking.find((row) => row.rank === 1) || qualifierRanking.find((row) => row.rank === 1) || null;
    this.result = {
      id: this.round,
      mode: this.mode,
      outcome,
      endedAt: now,
      config: { ...this.config },
      qualifier: { ranking: qualifierRanking },
      final: { ranking: finalRanking },
      participants,
      ranking: finalRanking.length ? finalRanking : qualifierRanking,
      teams,
      winner,
      rows: this.buildExportRows()
    };
    this.save(this.result);
    for (const player of this.players.values()) {
      for (const phase of ['qualifier', 'final']) this.recordStats(player, phase, true);
    }
    this.phase = 'finished';
    this.endsAt = now;
    this.event(
      this.mode === 'team'
        ? `${winner?.team === 'red' ? '红队' : '蓝队'} 获胜，总正确字数 ${winner?.correct ?? 0}`
        : `本场结束，冠军：${winner?.name ?? '无'}`,
      'finish'
    );
  }

  // ---------------------------------------------------------------- 作答

  requirePlayer(id, seat) {
    this.tick();
    const player = this.players.get(id);
    if (!player || player.seat !== seat) this.fail('身份已失效，请重新加入比赛', 409);
    if (!this.isLive()) this.fail('当前不是作答阶段', 409);
    if (this.phase === 'final' && !player.qualified) this.fail('你未晋级决赛，正在观战', 403);
    if (player.disqualified) this.fail('本轮成绩已作废，可以继续观战', 403);
    player.seen = this.now();
    return player;
  }

  type(id, body = {}) {
    const player = this.requirePlayer(id, body.seat);
    const task = player.task;
    if (!task) this.fail('题目尚未下发，请稍候', 409);
    if (body.ticket !== task.id) this.fail('题目已更新，请同步后继续', 409);
    const text = body.text;
    if (typeof text !== 'string'
      || !text.startsWith(task.typed)
      || text.length > task.text.length
      || text.length - task.typed.length > MAX_BATCH) {
      this.fail('请按顺序输入当前段落');
    }
    if (text === task.typed) return this.state(id);
    const stats = player.stats[this.phase];
    for (let index = task.typed.length; index < text.length; index++) {
      stats.attempted += 1;
      if (text[index] === task.text[index]) stats.correct += 1;
    }
    const added = text.length - task.typed.length;
    task.typed = text;
    this.auditRate(player, added);
    if (this.now() - player.lastSaved >= 2000) {
      this.recordStats(player, this.phase, false);
      player.lastSaved = this.now();
    }
    return this.state(id);
  }

  next(id, body = {}) {
    const player = this.requirePlayer(id, body.seat);
    if (body.ticket === player.lastAdvance) return this.state(id);
    if (!player.task || body.ticket !== player.task.id || player.task.typed.length !== player.task.text.length) {
      this.fail('请完成当前段落后再进入下一段');
    }
    player.lastAdvance = player.task.id;
    player.sequence += 1;
    this.nextText(player);
    this.recordStats(player, this.phase, false);
    return this.state(id);
  }

  // 速率窗口检测：不做硬拒绝，只记录异常并累计，避免网络抖动误判把选手踢出比赛。
  auditRate(player, added) {
    const now = this.now();
    player.typeLog.push({ at: now, added });
    const cutoff = now - this.config.rateWindowMs;
    while (player.typeLog.length && player.typeLog[0].at <= cutoff) player.typeLog.shift();
    const chars = player.typeLog.reduce((sum, entry) => sum + entry.added, 0);
    if (chars <= this.config.rateWindowLimit) return;
    player.suspectCount += 1;
    if (player.suspectCount >= this.config.suspectLimit) {
      if (!player.disqualified) {
        player.disqualified = true;
        this.event(`${player.name} 连续 ${player.suspectCount} 次输入速率异常，本轮成绩作废`, 'warn');
      }
      return;
    }
    this.event(`${player.name} 输入速率异常（${chars} 字 / ${this.config.rateWindowMs / 1000} 秒）`, 'warn');
  }

  recordStats(player, phase, finalized) {
    const stats = player.stats[phase];
    if (!stats || !stats.attempted || this.phaseStartedAt === null) return;
    const at = Math.min(this.now(), this.result?.endedAt ?? this.endsAt ?? this.now());
    const durationMs = stats.durationMs || Math.max(1000, at - this.phaseStartedAt);
    this.record({ round: `${this.round}:${phase}`, phase, player, stats, finalized, at, durationMs });
  }

  // ---------------------------------------------------------------- 对外状态

  liveDuration() {
    const start = this.phaseStartedAt ?? this.now();
    const end = this.endsAt ?? this.now();
    return Math.max(1000, Math.min(this.now(), end) - start);
  }

  publicPlayer(player) {
    const phase = this.phase === 'final' ? 'final' : 'qualifier';
    const stats = player.stats[phase] || emptyStats();
    const duration = this.isLive() ? this.liveDuration() : (stats.durationMs || 1000);
    return {
      id: player.id,
      name: player.name,
      avatarUrl: player.avatarUrl || null,
      team: player.team,
      correct: stats.correct,
      attempted: stats.attempted,
      accuracy: accuracyOf(stats),
      speed: stats.speed ?? Math.round((stats.correct / Math.max(1000, duration)) * 60000),
      qualifierCorrect: player.stats.qualifier.correct,
      finalCorrect: player.stats.final.correct,
      qualified: player.qualified,
      qualifiedRank: player.qualifiedRank,
      flagged: player.suspectCount > 0,
      disqualified: player.disqualified,
      sequence: player.sequence
    };
  }

  state(id) {
    const current = this.players.get(id);
    if (current) current.seen = this.now();
    this.tick();
    const me = this.players.get(id);
    const players = [...this.players.values()].map((player) => ({ ...this.publicPlayer(player), seat: player.seat }));
    const teams = this.mode === 'team'
      ? ['red', 'blue'].map((team) => ({
        team,
        correct: players.filter((player) => player.team === team).reduce((sum, player) => sum + player.correct, 0),
        members: players.filter((player) => player.team === team).length
      }))
      : [];
    return {
      mode: this.mode,
      round: this.round,
      phase: this.phase,
      phaseLabel: PHASE_LABELS[this.phase] || this.phase,
      serverNow: this.now(),
      startsAt: this.startsAt,
      endsAt: this.endsAt,
      host: this.host,
      capacity: this.config.capacity,
      finalists: this.config.finalists,
      config: { ...this.config },
      players,
      teams,
      me: me
        ? {
          ...this.publicPlayer(me),
          seat: me.seat,
          task: me.task ? { ...me.task } : null,
          spectating: this.phase === 'final' && !me.qualified
        }
        : null,
      events: this.events,
      result: this.result,
      qualifierRanking: this.rounds.qualifier,
      finalRanking: this.rounds.final
    };
  }

  // 大屏专用：不返回 seat，避免把身份令牌投到投影上。
  boardState(limit = 12) {
    this.tick();
    const all = [...this.players.values()].map((player) => this.publicPlayer(player));
    const sorted = all.slice().sort((a, b) => b.correct - a.correct || b.accuracy - a.accuracy || b.speed - a.speed);
    return {
      mode: this.mode,
      round: this.round,
      phase: this.phase,
      phaseLabel: PHASE_LABELS[this.phase] || this.phase,
      serverNow: this.now(),
      startsAt: this.startsAt,
      endsAt: this.endsAt,
      capacity: this.config.capacity,
      finalists: this.config.finalists,
      total: all.length,
      qualifiedCount: all.filter((player) => player.qualified).length,
      top: sorted.slice(0, limit).map((player, index) => ({ ...player, rank: index + 1 })),
      teams: this.mode === 'team'
        ? ['red', 'blue'].map((team) => ({
          team,
          correct: all.filter((player) => player.team === team).reduce((sum, player) => sum + player.correct, 0),
          members: all.filter((player) => player.team === team).length
        }))
        : [],
      events: this.events.slice(-6),
      result: this.result
    };
  }

  // 成绩单：包含所有参赛者，不只是晋级的人。
  buildExportRows() {
    const qualifier = new Map((this.rounds.qualifier || []).map((row) => [row.id, row]));
    const final = new Map((this.rounds.final || []).map((row) => [row.id, row]));
    const rows = [...this.players.values()].map((player) => {
      const qualifierRow = qualifier.get(player.id) || null;
      const finalRow = final.get(player.id) || null;
      const main = finalRow || qualifierRow;
      return {
        name: player.name,
        userId: player.id,
        team: player.team || '',
        qualifierCorrect: qualifierRow ? qualifierRow.correct : 0,
        qualifierRank: qualifierRow && qualifierRow.rank !== null ? qualifierRow.rank : '',
        finalCorrect: finalRow ? finalRow.correct : '',
        finalRank: finalRow && finalRow.rank !== null ? finalRow.rank : '',
        accuracy: main ? main.accuracy : 100,
        speed: main ? main.speed : 0,
        qualified: player.qualified,
        flagged: player.suspectCount > 0,
        disqualified: player.disqualified
      };
    });
    const weight = (row) => {
      if (row.finalRank !== '') return row.finalRank;
      if (row.qualifierRank !== '') return 1000 + row.qualifierRank;
      return 9999;
    };
    return rows.sort((a, b) => weight(a) - weight(b) || b.qualifierCorrect - a.qualifierCorrect);
  }
}

// ---------------------------------------------------------------- 接口安装

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(rows, usernames) {
  const header = ['排名', '姓名', '账号', '初赛正确字数', '初赛排名', '决赛正确字数', '决赛排名', '准确率(%)', '速度(字/分)', '是否晋级', '状态'];
  const lines = [header.join(',')];
  for (const row of rows) {
    lines.push([
      row.finalRank !== '' ? row.finalRank : row.qualifierRank,
      row.name,
      usernames.get(row.userId) || '',
      row.qualifierCorrect,
      row.qualifierRank,
      row.finalCorrect,
      row.finalRank,
      row.accuracy,
      row.speed,
      row.qualified ? '是' : '否',
      row.disqualified ? '成绩作废' : row.flagged ? '速率异常' : '正常'
    ].map(csvCell).join(','));
  }
  // 带 BOM，Excel 打开中文才不乱码
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

function installCompetition(app, { db, requireUser, requireAdmin, now }) {
  db.exec(`CREATE TABLE IF NOT EXISTS competition_results (
    id TEXT PRIMARY KEY,
    mode TEXT NOT NULL,
    ended_at INTEGER NOT NULL,
    result_json TEXT NOT NULL
  )`);

  function record({ round, phase, player, stats, finalized, at, durationMs }) {
    db.prepare(`INSERT INTO training_sessions (user_id, mode, lesson_title, correct_chars, wrong_chars, accuracy, speed, duration_ms, completed_at, source_key, is_finalized)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(source_key) WHERE source_key IS NOT NULL DO UPDATE SET
        correct_chars=excluded.correct_chars, wrong_chars=excluded.wrong_chars, accuracy=excluded.accuracy,
        speed=excluded.speed, duration_ms=excluded.duration_ms, completed_at=excluded.completed_at, is_finalized=excluded.is_finalized`)
      .run(
        player.id,
        `competition-${player.team || 'personal'}`,
        finalized ? `比赛-${phase === 'final' ? '决赛' : '初赛'}（已结算）` : `比赛-${phase === 'final' ? '决赛' : '初赛'}（进行中）`,
        stats.correct,
        stats.attempted - stats.correct,
        accuracyOf(stats),
        Math.round((stats.correct / durationMs) * 60000),
        durationMs,
        at,
        `competition:${round}:${player.seat}`, finalized ? 1 : 0
      );
  }

  function save(result) {
    db.prepare('INSERT OR REPLACE INTO competition_results VALUES (?,?,?,?)')
      .run(result.id, result.mode, result.endedAt, JSON.stringify(result));
  }

  const rooms = {
    personal: new CompetitionRoom('personal', { now, record, save }),
    team: new CompetitionRoom('team', { now, record, save })
  };

  const route = (handler) => (request, response, next) => {
    try {
      response.json(handler(request));
    } catch (error) {
      if (error.status) response.status(error.status).json({ message: error.message });
      else next(error);
    }
  };

  const pick = (request) => {
    const room = rooms[request.params.mode];
    if (!room) throw Object.assign(new Error('比赛类型不正确'), { status: 404 });
    return room;
  };

  app.get('/api/competition/:mode', requireUser, route((request) => pick(request).state(request.user.id)));
  app.post('/api/competition/:mode/join', requireUser, route((request) => pick(request).join(request.user)));
  app.post('/api/competition/:mode/start', requireUser, route((request) => pick(request).start(request.user.id)));
  app.post('/api/competition/:mode/type', requireUser, route((request) => pick(request).type(request.user.id, request.body)));
  app.post('/api/competition/:mode/next', requireUser, route((request) => pick(request).next(request.user.id, request.body)));
  app.post('/api/competition/:mode/leave', requireUser, route((request) => pick(request).leave(request.user.id, request.body?.seat)));

  // 大屏：免登录只读，方便投影机随便开一台。只给公开字段，不含 seat。
  app.get('/api/competition/:mode/board', route((request) => pick(request).boardState(12)));

  // 成绩导出：读数据库里最近一场已结算的比赛，服务重启也不会丢。
  // 学生自己看成绩用它，教师后台和 AI 助手导出也用它 —— 后台没有学生会话，
  // 所以这里学生优先、后台其次，两边都能拿到同一份文件。
  const requireStudentOrAdmin = (request, response, next) => (
    request.user ? next() : requireAdmin(request, response, next)
  );
  app.get('/api/competition/:mode/export.csv', requireStudentOrAdmin, (request, response, next) => {
    try {
      const mode = request.params.mode;
      if (!rooms[mode]) return response.status(404).json({ message: '比赛类型不正确' });
      const latest = db.prepare('SELECT ended_at, result_json FROM competition_results WHERE mode = ? ORDER BY ended_at DESC LIMIT 1').get(mode);
      if (!latest) return response.status(404).json({ message: '暂无已结算的比赛成绩' });
      const result = JSON.parse(latest.result_json);
      const rows = result.rows || [];
      const usernames = new Map();
      const ids = [...new Set(rows.map((row) => row.userId).filter((id) => Number.isInteger(id)))];
      if (ids.length) {
        const statement = db.prepare(`SELECT id, username FROM users WHERE id IN (${ids.map(() => '?').join(',')})`);
        for (const item of statement.all(...ids)) usernames.set(item.id, item.username);
      }
      const stamp = new Date(latest.ended_at).toISOString().slice(0, 19).replace(/[:T]/g, '-');
      const filename = `competition-${mode}-${stamp}.csv`;
      response.setHeader('Content-Type', 'text/csv; charset=utf-8');
      response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      response.send(toCsv(rows, usernames));
    } catch (error) {
      next(error);
    }
  });
}

module.exports = {
  CompetitionRoom,
  installCompetition,
  PHASE_LABELS,
  GATHER_MS,
  QUALIFIER_MS,
  BREAK_MS,
  FINAL_MS,
  RESULT_MS,
  FINALISTS,
  CAPACITY,
  ROUND_MS,
  RATE_WINDOW_MS,
  RATE_WINDOW_LIMIT,
  SUSPECT_LIMIT
};
