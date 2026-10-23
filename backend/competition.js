const crypto = require('node:crypto');
const { LESSONS } = require('./boss');

const ROUND_MS = 60_000;
const GATHER_MS = 15_000;
const OFFLINE_MS = 20_000;
const RESULT_MS = 15_000;
const CAPACITY = 40;

class CompetitionRoom {
  constructor(mode, { now = Date.now, record = () => {}, save = () => {} } = {}) {
    if (!['personal', 'team'].includes(mode)) throw new Error('比赛类型不正确');
    this.mode = mode; this.now = now; this.record = record; this.save = save; this.reset();
  }

  reset() {
    this.round = crypto.randomUUID(); this.phase = 'waiting'; this.players = new Map();
    this.host = null; this.startsAt = null; this.startedAt = null; this.endsAt = null;
    this.result = null; this.events = []; this.eventId = 0;
  }

  fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
  event(text, kind = 'info') {
    this.events.push({ id: ++this.eventId, text, kind, at: this.now() });
    this.events = this.events.slice(-18);
  }
  teamOf(player) { return this.mode === 'team' ? player.team : null; }
  nextText(player) {
    player.task = { id: crypto.randomUUID(), sequence: player.sequence, text: LESSONS[(player.sequence - 1) % LESSONS.length], typed: '' };
  }

  tick() {
    if (this.phase === 'finished') {
      if (this.now() >= this.result.endedAt + RESULT_MS) this.reset();
      return;
    }
    if (this.phase === 'running' && this.now() >= this.endsAt) { this.finish('timeout'); return; }
    for (const player of this.players.values()) if (this.now() - player.seen > OFFLINE_MS) this.remove(player);
    if (!this.players.has(this.host)) this.host = this.players.keys().next().value ?? null;
    if (!this.players.size) { this.startsAt = null; return; }
    if (this.phase === 'waiting' && this.startsAt !== null && this.now() >= this.startsAt) this.begin();
  }

  join(user) {
    this.tick();
    if (this.phase === 'finished') this.fail('本局已结束，请等待下一局');
    let player = this.players.get(user.id);
    if (!player) {
      if (this.players.size >= CAPACITY) this.fail('比赛人数已满，请稍后再试', 409);
      const teamCounts = [...this.players.values()].reduce((counts, item) => {
        if (item.team) counts[item.team]++;
        return counts;
      }, { red: 0, blue: 0 });
      const team = this.mode === 'team' ? (teamCounts.red <= teamCounts.blue ? 'red' : 'blue') : null;
      player = { id: user.id, name: user.displayName, avatarUrl: user.avatarUrl || null, seat: crypto.randomUUID(),
        team, seen: this.now(), joinedAt: this.now(), correct: 0, attempted: 0, sequence: 1, task: null, lastAdvance: null, lastSaved: 0 };
      this.players.set(user.id, player);
      if (this.host === null) this.host = user.id;
      this.event(`${player.name} 加入了${this.mode === 'team' ? (team === 'red' ? '红队' : '蓝队') : '个人赛'}`);
    }
    player.seen = this.now();
    if (this.phase === 'waiting' && this.startsAt === null) this.startsAt = this.now() + GATHER_MS;
    return this.state(user.id);
  }

  start(id) {
    this.tick();
    if (id !== this.host) this.fail('只有房主可以提前开始', 403);
    if (this.phase !== 'waiting') this.fail('当前不能开始新比赛');
    if (this.players.size < 1) this.fail('至少需要 1 名选手');
    this.begin(); return this.state(id);
  }

  begin() {
    this.phase = 'running'; this.startedAt = this.now(); this.endsAt = this.startedAt + ROUND_MS;
    for (const player of this.players.values()) { player.joinedAt = this.startedAt; this.nextText(player); }
    this.event(`${this.mode === 'team' ? '团队赛' : '个人赛'}开始！比赛时间 60 秒`, 'start');
  }

  requirePlayer(id, seat) {
    this.tick();
    const player = this.players.get(id);
    if (!player || player.seat !== seat) this.fail('身份已失效，请重新加入比赛', 409);
    if (this.phase !== 'running') this.fail('比赛尚未开始或已经结束', 409);
    player.seen = this.now(); return player;
  }

  type(id, body = {}) {
    const player = this.requirePlayer(id, body.seat), task = player.task;
    if (body.ticket !== task.id) this.fail('题目已更新，请同步后继续', 409);
    const text = body.text;
    if (typeof text !== 'string' || !text.startsWith(task.typed) || text.length > task.text.length || text.length - task.typed.length > 16) this.fail('请按顺序输入当前段落');
    if (text === task.typed) return this.state(id);
    for (let index = task.typed.length; index < text.length; index++) {
      player.attempted++;
      if (text[index] === task.text[index]) player.correct++;
    }
    task.typed = text;
    if (this.now() - player.lastSaved >= 2000) { this.recordPlayer(player, false); player.lastSaved = this.now(); }
    return this.state(id);
  }

  next(id, body = {}) {
    const player = this.requirePlayer(id, body.seat);
    if (body.ticket === player.lastAdvance) return this.state(id);
    if (body.ticket !== player.task.id || player.task.typed.length !== player.task.text.length) this.fail('请完成当前段落后再进入下一段');
    player.lastAdvance = player.task.id; player.sequence++; this.nextText(player); this.recordPlayer(player, false);
    return this.state(id);
  }

  recordPlayer(player, finalized) {
    if (!player.attempted || this.startedAt === null) return;
    const at = Math.min(this.now(), this.result?.endedAt ?? this.endsAt);
    this.record({ round: this.round, player, finalized, at, durationMs: Math.max(1000, at - player.joinedAt) });
  }

  publicPlayer(player) {
    const duration = Math.max(1000, Math.min(this.now(), this.result?.endedAt ?? this.endsAt ?? this.now()) - player.joinedAt);
    return { id: player.id, name: player.name, avatarUrl: player.avatarUrl, team: player.team,
      correct: player.correct, attempted: player.attempted, accuracy: player.attempted ? Math.round(player.correct / player.attempted * 100) : 100,
      speed: Math.round(player.correct / duration * 60000), sequence: player.sequence };
  }

  remove(player) { this.recordPlayer(player, true); this.players.delete(player.id); }
  leave(id, seat) { const player = this.players.get(id); if (player && player.seat === seat) { this.remove(player); this.event(`${player.name} 离开了比赛`); } this.tick(); return { ok: true }; }

  finish(outcome) {
    if (this.phase !== 'running') return;
    const participants = [...this.players.values()].map((player) => this.publicPlayer(player));
    const teams = this.mode === 'team' ? ['red', 'blue'].map((team) => {
      const members = participants.filter((player) => player.team === team);
      return { team, correct: members.reduce((sum, player) => sum + player.correct, 0), attempted: members.reduce((sum, player) => sum + player.attempted, 0), members };
    }) : [];
    const ranking = [...participants].sort((a, b) => b.correct - a.correct || b.accuracy - a.accuracy || b.speed - a.speed);
    const winner = this.mode === 'team' ? teams.slice().sort((a, b) => b.correct - a.correct || b.attempted - a.attempted)[0] : ranking[0] || null;
    this.result = { id: this.round, mode: this.mode, outcome, endedAt: this.now(), participants, ranking, teams, winner };
    this.save(this.result);
    for (const player of this.players.values()) this.recordPlayer(player, true);
    this.phase = 'finished'; this.event(this.mode === 'team' ? `${winner?.team === 'red' ? '红队' : '蓝队'} 获胜！` : `${winner?.name || '本局选手'} 暂列第一`, 'finish');
  }

  state(id) {
    const current = this.players.get(id); if (current) current.seen = this.now(); this.tick();
    const me = this.players.get(id);
    const players = [...this.players.values()].map((player) => ({ ...this.publicPlayer(player), seat: player.seat }));
    return { mode: this.mode, round: this.round, phase: this.phase, serverNow: this.now(), startsAt: this.startsAt, endsAt: this.endsAt,
      host: this.host, capacity: CAPACITY, players, teams: this.mode === 'team' ? ['red', 'blue'].map((team) => ({ team, correct: players.filter((player) => player.team === team).reduce((sum, player) => sum + player.correct, 0), members: players.filter((player) => player.team === team).length })) : [],
      me: me ? { ...this.publicPlayer(me), seat: me.seat, task: me.task ? { ...me.task } : null } : null, events: this.events, result: this.result };
  }
}

function installCompetition(app, { db, requireUser, now }) {
  db.exec('CREATE TABLE IF NOT EXISTS competition_results (id TEXT PRIMARY KEY, mode TEXT NOT NULL, ended_at INTEGER NOT NULL, result_json TEXT NOT NULL)');
  const rooms = { personal: new CompetitionRoom('personal', { now, record, save }), team: new CompetitionRoom('team', { now, record, save }) };
  function record({ round, player, finalized, at, durationMs }) {
    db.prepare(`INSERT INTO training_sessions (user_id, mode, lesson_title, correct_chars, wrong_chars, accuracy, speed, duration_ms, completed_at, source_key)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(source_key) WHERE source_key IS NOT NULL DO UPDATE SET correct_chars=excluded.correct_chars, wrong_chars=excluded.wrong_chars, accuracy=excluded.accuracy, speed=excluded.speed, duration_ms=excluded.duration_ms, completed_at=excluded.completed_at`)
      .run(player.id, `competition-${player.team || 'personal'}`, finalized ? '比赛模式（已结算）' : '比赛模式（进行中）', player.correct, player.attempted - player.correct,
        player.attempted ? Math.round(player.correct / player.attempted * 100) : 100, Math.round(player.correct / durationMs * 60000), durationMs, at, `competition:${round}:${player.seat}`);
  }
  function save(result) { db.prepare('INSERT OR REPLACE INTO competition_results VALUES (?,?,?,?)').run(result.id, result.mode, result.endedAt, JSON.stringify(result)); }
  const route = (fn) => (req, res, next) => { try { res.json(fn(req)); } catch (error) { if (error.status) res.status(error.status).json({ message: error.message }); else next(error); } };
  app.get('/api/competition/:mode', requireUser, route((req) => rooms[req.params.mode]?.state(req.user.id) || (() => { throw Object.assign(new Error('比赛类型不正确'), { status: 404 }); })()));
  app.post('/api/competition/:mode/join', requireUser, route((req) => rooms[req.params.mode]?.join(req.user) || (() => { throw Object.assign(new Error('比赛类型不正确'), { status: 404 }); })()));
  app.post('/api/competition/:mode/start', requireUser, route((req) => rooms[req.params.mode]?.start(req.user.id) || (() => { throw Object.assign(new Error('比赛类型不正确'), { status: 404 }); })()));
  app.post('/api/competition/:mode/type', requireUser, route((req) => rooms[req.params.mode]?.type(req.user.id, req.body) || (() => { throw Object.assign(new Error('比赛类型不正确'), { status: 404 }); })()));
  app.post('/api/competition/:mode/next', requireUser, route((req) => rooms[req.params.mode]?.next(req.user.id, req.body) || (() => { throw Object.assign(new Error('比赛类型不正确'), { status: 404 }); })()));
  app.post('/api/competition/:mode/leave', requireUser, route((req) => rooms[req.params.mode]?.leave(req.user.id, req.body?.seat) || { ok: true }));
}

module.exports = { CompetitionRoom, installCompetition, ROUND_MS, GATHER_MS, CAPACITY };
