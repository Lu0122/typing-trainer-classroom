const crypto = require('node:crypto');

const ROUND_MS = 180_000;
const GATHER_MS = 15_000;
const OFFLINE_MS = 20_000;
const RESULT_MS = 15_000;
// 团队合击：同一时刻有足够多队友保持连击时，全队进入合击状态并获得额外伤害加成。
const TEAM_COMBO_SIZE = 3, TEAM_COMBO_MIN = 5, TEAM_COMBO_BONUS = 1.5, TEAM_COMBO_GRACE_MS = 3000;
const ELIMINATION_INTERVAL_MS = 20_000;
const LESSONS = [
  '一起出发，保持专注，每一次准确输入都能为团队贡献力量。',
  '遇到困难先保持冷静，找到节奏，我们就能一步一步接近胜利。',
  '不必追赶别人的速度，把眼前的每一个字打好，就是自己的进步。',
  '可靠的队友愿意倾听，也愿意坚持。互相鼓励让整个团队更有力量。',
  '成功来自平时的积累。今天多练习一点，明天就能更加从容。',
  '认真观察，耐心思考，勇敢尝试。学习的乐趣藏在每一次发现之中。',
  '双手放松，坐姿端正，注意准确率。稳定的节奏会让速度自然提高。',
  '完成一段，继续前进。只要大家共同努力，目标就会越来越近。',
  '把大目标拆成小步骤，把小步骤变成日常行动，进步就有了方向。',
  '伙伴的努力值得肯定，自己的成长值得记录。我们一起迎接新的挑战。',
  '阳光照进教室，键盘响起整齐的节奏。专心练习的人正在创造可能。',
  '最后的冲刺也要稳住节奏。相信自己，相信队友，把这份坚持带到终点。'
];

class BossRoom {
  constructor({ now = Date.now, record = () => {}, save = () => {} } = {}) {
    this.now = now; this.record = record; this.save = save;
    this.reset();
  }
  reset() {
    this.round = crypto.randomUUID(); this.phase = 'waiting'; this.players = new Map();
    this.retired = []; this.captain = null; this.startsAt = null; this.startedAt = null;
    this.endsAt = null; this.hp = 0; this.maxHp = 0; this.result = null; this.events = []; this.eventId = 0;
    this.teamComboActive = false; this.teamComboCount = 0;
  }
  fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
  event(text, kind = 'info') {
    this.events.push({ id: ++this.eventId, text, kind, at: this.now() });
    this.events = this.events.slice(-24);
  }
  stage() { return !this.maxHp || this.hp / this.maxHp > 2 / 3 ? 1 : this.hp / this.maxHp > 1 / 3 ? 2 : 3; }
  // 正在连击的队友数：连击达到门槛且最近仍在输入的人算作合击成员。
  activeComboMembers() {
    return [...this.players.values()].filter(player => (player.combo || 0) >= TEAM_COMBO_MIN
      && this.now() - (player.lastComboAt || 0) <= TEAM_COMBO_GRACE_MS);
  }
  // 合击状态在 tick 中维持：人数不足时保留 3 秒宽限，避免频繁闪烁。
  refreshTeamCombo() {
    const members = this.activeComboMembers();
    const wasActive = this.teamComboActive;
    this.teamComboCount = members.length;
    this.teamComboActive = members.length >= TEAM_COMBO_SIZE;
    if (this.teamComboActive && !wasActive) this.event(`三人合击！全队伤害提升至 ${TEAM_COMBO_BONUS} 倍`, 'combo');
  }
  tick() {
    if (this.phase === 'finished') {
      // 结算后立即清空合击状态，避免结果页还显示上一局的加成。
      this.teamComboActive = false; this.teamComboCount = 0;
      if (this.now() >= this.result.endedAt + RESULT_MS) this.reset();
      return;
    }
    // Settle the timeout before removing inactive members, so the final roster is complete.
    if (this.phase === 'running' && this.now() >= this.endsAt) { this.finish('timeout'); return; }
    for (const player of this.players.values()) {
      if (this.now() - player.seen > OFFLINE_MS) this.remove(player);
    }
    if (!this.players.has(this.captain)) this.captain = this.players.keys().next().value ?? null;
    if (!this.players.size) {
      if (this.phase === 'running') this.finish('abandoned');
      else this.startsAt = null;
      return;
    }
    // 合击状态取决于队友实时的连击水平，需在每次状态同步前重算。
    if (this.phase === 'running') this.refreshTeamCombo();
    else { this.teamComboActive = false; this.teamComboCount = 0; }
    if (this.phase === 'waiting' && this.startsAt !== null && this.now() >= this.startsAt) this.begin();
  }
  newTask(player) {
    player.task = { id: crypto.randomUUID(), sequence: player.sequence, text: LESSONS[(player.sequence - 1) % LESSONS.length], typed: '' };
  }
  join(user) {
    this.tick();
    if (this.phase === 'finished') this.fail('本局已结束，请等待下一局');
    let player = this.players.get(user.id);
    if (!player) {
      if (this.players.size >= 60) this.fail('房间已满，最多 60 人');
      player = { id: user.id, name: user.displayName, avatarUrl: user.avatarUrl || null, seat: crypto.randomUUID(), seen: this.now(),
        joinedAt: this.now(), correct: 0, attempted: 0, combo: 0, bestCombo: 0, damage: 0, sequence: 1, task: null, lastAdvance: null, lastSaved: 0,
        lastComboAt: 0, comboHits: 0, teamComboDamage: 0 };
      this.players.set(user.id, player);
      if (this.phase === 'running') this.newTask(player);
      this.event(`${player.name} 加入了合作小队`);
    }
    player.seen = this.now();
    if (this.captain === null) this.captain = player.id;
    if (this.phase === 'waiting' && this.startsAt === null) this.startsAt = this.now() + GATHER_MS;
    return this.state(user.id);
  }
  start(id) {
    this.tick();
    if (id !== this.captain) this.fail('只有队长可以提前开始', 403);
    if (this.phase !== 'waiting') this.fail('当前不能开始新一局');
    this.begin(); return this.state(id);
  }
  begin() {
    this.phase = 'running'; this.startedAt = this.now(); this.endsAt = this.startedAt + ROUND_MS;
    this.maxHp = Math.max(1, this.players.size) * 1800; this.hp = this.maxHp;
    for (const player of this.players.values()) { player.joinedAt = this.startedAt; this.newTask(player); }
    this.event(`集结完成！${this.players.size} 人小队，3 分钟合作挑战开始`, 'stage');
  }
  requirePlayer(id, seat) {
    this.tick();
    const player = this.players.get(id);
    if (!player || player.seat !== seat) this.fail('你已离开本局，请重新加入', 409);
    if (this.phase !== 'running') this.fail('本局尚未开始或已经结束', 409);
    player.seen = this.now(); return player;
  }
  type(id, body = {}) {
    const player = this.requirePlayer(id, body.seat), task = player.task;
    if (body.ticket !== task.id) this.fail('段落已更新，请同步后继续', 409);
    const text = body.text;
    if (typeof text !== 'string' || !text.startsWith(task.typed) || text.length > task.text.length || text.length - task.typed.length > 16) this.fail('请按顺序输入当前段落');
    if (text === task.typed) return this.state(id); // Retrying an acknowledged packet must never deal damage twice.
    if (player.attempted + text.length - task.typed.length > 16 + Math.floor((this.now() - player.joinedAt) / 1000 * 20)) this.fail('输入过快，请按正常速度练习', 429);
    const oldStage = this.stage(); let damage = 0, comboHits = 0;
    // 合击状态按请求到达前的队友连击水平判定，避免自己这一批字符把自己算成合击成员。
    const teamCombo = this.teamComboActive;
    const teamBonus = teamCombo ? TEAM_COMBO_BONUS : 1;
    for (let i = task.typed.length; i < text.length; i++) {
      player.attempted++;
      if (text[i] === task.text[i]) {
        player.correct++; player.combo++; player.bestCombo = Math.max(player.bestCombo, player.combo);
        player.lastComboAt = this.now(); comboHits++;
        const comboBonus = player.combo >= 30 ? 2 : player.combo >= 10 ? 1.5 : 1;
        damage += Math.round(10 * comboBonus * (oldStage === 3 ? 1.5 : oldStage === 2 ? 1.2 : 1) * teamBonus);
      } else player.combo = 0;
    }
    player.comboHits += comboHits;
    const teamDamage = Math.round(damage * (1 - 1 / teamBonus));
    if (teamDamage > 0) player.teamComboDamage += teamDamage;
    task.typed = text;
    damage = Math.min(this.hp, damage); this.hp -= damage; player.damage += damage;
    if (damage) this.event(`${player.name} 造成 ${damage} 点伤害${teamCombo ? ` · 合击 ×${TEAM_COMBO_BONUS}` : ''}`, teamCombo ? 'combo' : 'hit');
    if (this.hp > 0 && this.stage() !== oldStage) this.event(this.stage() === 2 ? '护甲破裂！全队伤害提升至 1.2 倍' : '核心暴露！全队进入 1.5 倍冲刺阶段', 'stage');
    if (this.hp <= 0) this.finish('victory');
    else if (this.now() - player.lastSaved >= 2000) { this.recordPlayer(player, false); player.lastSaved = this.now(); }
    return this.state(id);
  }
  next(id, body = {}) {
    const player = this.requirePlayer(id, body.seat);
    if (body.ticket === player.lastAdvance) return this.state(id);
    if (body.ticket !== player.task.id || player.task.typed.length !== player.task.text.length) this.fail('请完成当前段落后再进入下一段');
    player.lastAdvance = player.task.id; player.sequence++; this.newTask(player); this.recordPlayer(player, false);
    return this.state(id); // Enter only advances the task; it never deals damage.
  }
  recordPlayer(player, finalized) {
    if (!player.attempted || this.startedAt === null) return;
    const at = Math.min(this.now(), this.result?.endedAt ?? this.endsAt);
    this.record({ round: this.round, player, finalized, at, durationMs: Math.max(1000, at - player.joinedAt) });
  }
  remove(player) {
    this.recordPlayer(player, true);
    if (this.phase === 'running') this.retired.push(this.publicPlayer(player));
    this.players.delete(player.id);
  }
  leave(id, seat) {
    const player = this.players.get(id);
    if (!player || player.seat !== seat) return { ok: true };
    this.remove(player); this.event(`${player.name} 离开了小队`); this.tick(); return { ok: true };
  }
  publicPlayer(player) {
    const duration = Math.max(1000, Math.min(this.now(), this.result?.endedAt ?? this.endsAt ?? this.now()) - player.joinedAt);
    return { id: player.id, seat: player.seat, name: player.name, avatarUrl: player.avatarUrl, damage: player.damage, correct: player.correct,
      attempted: player.attempted, accuracy: player.attempted ? Math.round(player.correct / player.attempted * 100) : 100,
      combo: player.combo, bestCombo: player.bestCombo, speed: Math.round(player.correct / duration * 60000), sequence: player.sequence,
      comboHits: player.comboHits || 0, teamComboDamage: player.teamComboDamage || 0,
      inTeamCombo: (player.combo || 0) >= TEAM_COMBO_MIN && this.now() - (player.lastComboAt || 0) <= TEAM_COMBO_GRACE_MS };
  }
  finish(outcome) {
    if (this.phase !== 'running') return;
    const participants = [...this.retired, ...[...this.players.values()].map(player => this.publicPlayer(player))];
    const contribution = [...participants].sort((a, b) => b.damage - a.damage || a.id - b.id)[0];
    const precision = participants.filter(p => p.attempted >= 20).sort((a, b) => b.accuracy - a.accuracy || b.correct - a.correct)[0];
    const combo = participants.filter(p => p.bestCombo > 0).sort((a, b) => b.bestCombo - a.bestCombo)[0];
    this.result = { id: this.round, outcome, endedAt: this.now(), maxHp: this.maxHp, damage: this.maxHp - this.hp,
      participants, awards: { contribution: contribution?.damage ? contribution : null, precision: precision || null, combo: combo || null } };
    this.save(this.result);
    for (const player of this.players.values()) this.recordPlayer(player, true);
    this.phase = 'finished'; this.event(outcome === 'victory' ? '挑战成功！你们击败了机械守卫' : '本局结束，下次继续并肩作战', 'stage');
    // 合击只在本次对局内有效，结算时立刻归零。
    this.teamComboActive = false; this.teamComboCount = 0;
  }
  state(id) {
    const player = this.players.get(id);
    if (player) player.seen = this.now();
    this.tick();
    const me = this.players.get(id);
    return { round: this.round, phase: this.phase, serverNow: this.now(), startsAt: this.startsAt, endsAt: this.endsAt,
      captain: this.captain, hp: this.hp, maxHp: this.maxHp, stage: this.stage(), capacity: 60,
      teamCombo: { active: this.teamComboActive, count: this.teamComboCount, size: TEAM_COMBO_SIZE, min: TEAM_COMBO_MIN, bonus: TEAM_COMBO_BONUS },
      players: [...this.players.values()].map(player => this.publicPlayer(player)).sort((a, b) => b.damage - a.damage || a.id - b.id),
      me: me ? { ...this.publicPlayer(me), task: me.task ? { ...me.task } : null } : null,
      events: this.events.map(event => ({ ...event })), result: this.result };
  }
}

// 保留 BossRoom 供旧记录和历史测试读取；实际路由改用这套淘汰赛规则。
class EliminationRoom extends BossRoom {
  reset() {
    super.reset();
    this.nextEliminationAt = null; this.eliminationRound = 0; this.initialPlayers = 0;
  }
  join(user) {
    const state = super.join(user);
    const player = this.players.get(user.id);
    if (player && player.eliminated === undefined) player.eliminated = false;
    return this.state(user.id);
  }
  begin() {
    this.phase = 'running'; this.startedAt = this.now(); this.endsAt = this.startedAt + ROUND_MS;
    this.nextEliminationAt = this.startedAt + ELIMINATION_INTERVAL_MS; this.eliminationRound = 1;
    this.initialPlayers = this.players.size; this.maxHp = 1; this.hp = 1;
    for (const player of this.players.values()) {
      player.joinedAt = this.startedAt; player.eliminated = false; player.eliminatedAt = null;
      player.damage = 0; player.score = 0; player.combo = 0; player.bestCombo = 0; this.newTask(player);
    }
    this.event(`极速淘汰赛开始！${this.players.size} 人同场，20 秒后进行第一轮淘汰`, 'stage');
  }
  activePlayers() { return [...this.players.values()].filter(player => !player.eliminated); }
  requirePlayer(id, seat) {
    this.tick(); const player = this.players.get(id);
    if (!player || player.seat !== seat) this.fail('你已离开本局，请重新加入', 409);
    if (player.eliminated) this.fail('你已被淘汰，正在观战', 409);
    if (this.phase !== 'running') this.fail('本局尚未开始或已经结束', 409);
    player.seen = this.now(); return player;
  }
  type(id, body = {}) {
    const player = this.requirePlayer(id, body.seat), task = player.task, text = body.text;
    if (body.ticket !== task.id) this.fail('段落已更新，请同步后继续', 409);
    if (typeof text !== 'string' || !text.startsWith(task.typed) || text.length > task.text.length || text.length - task.typed.length > 16) this.fail('请按顺序输入当前段落');
    if (text === task.typed) return this.state(id);
    let gained = 0;
    for (let i = task.typed.length; i < text.length; i++) {
      player.attempted++;
      if (text[i] === task.text[i]) {
        player.correct++; player.combo++; player.bestCombo = Math.max(player.bestCombo, player.combo);
        gained += player.combo >= 30 ? 30 : player.combo >= 10 ? 20 : 10;
      } else player.combo = 0;
    }
    task.typed = text; player.score += gained; player.damage = player.score;
    if (gained) this.event(`${player.name} 获得 ${gained} 分`, 'hit');
    if (this.now() - player.lastSaved >= 2000) { this.recordPlayer(player, false); player.lastSaved = this.now(); }
    return this.state(id);
  }
  resolveElimination() {
    const active = this.activePlayers();
    if (active.length <= 1) return;
    const eliminate = Math.min(active.length - 1, Math.max(1, Math.floor(active.length / 4)));
    const ranked = [...active].sort((a, b) => b.score - a.score || (b.correct / Math.max(1, b.attempted)) - (a.correct / Math.max(1, a.attempted)) || b.combo - a.combo || a.id - b.id);
    const out = ranked.slice(-eliminate);
    for (const player of out) { player.eliminated = true; player.eliminatedAt = this.now(); player.combo = 0; }
    this.event(`第 ${this.eliminationRound} 轮结算：${out.map(player => player.name).join('、')} 进入观战`, 'elimination');
    if (ranked.length - out.length === 1 && this.initialPlayers > 1) this.finish('survivor');
  }
  tick() {
    if (this.phase === 'finished') { if (this.now() >= this.result.endedAt + RESULT_MS) this.reset(); return; }
    for (const player of [...this.players.values()]) if (this.now() - player.seen > OFFLINE_MS) this.remove(player);
    if (!this.players.size) { if (this.phase === 'running') this.finish('abandoned'); else this.startsAt = null; return; }
    if (!this.players.has(this.captain)) this.captain = this.players.keys().next().value ?? null;
    if (this.phase === 'waiting' && this.startsAt !== null && this.now() >= this.startsAt) this.begin();
    if (this.phase !== 'running') return;
    if (!this.activePlayers().length) { this.finish('abandoned'); return; }
    if (this.initialPlayers > 1 && this.activePlayers().length === 1) { this.finish('survivor'); return; }
    if (this.now() >= this.endsAt) { this.finish('timeout'); return; }
    while (this.phase === 'running' && this.nextEliminationAt && this.now() >= this.nextEliminationAt && this.nextEliminationAt < this.endsAt) {
      this.resolveElimination();
      if (this.phase !== 'running') break;
      this.eliminationRound++; this.nextEliminationAt += ELIMINATION_INTERVAL_MS;
    }
  }
  publicPlayer(player) {
    return { ...super.publicPlayer(player), score: player.score || 0, eliminated: !!player.eliminated,
      survivalMs: this.startedAt === null ? 0 : Math.max(0, (player.eliminatedAt ?? this.result?.endedAt ?? this.now()) - this.startedAt) };
  }
  finish(outcome) {
    if (this.phase !== 'running') return;
    const participants = [...this.retired, ...[...this.players.values()].map(player => this.publicPlayer(player))];
    const survivors = [...this.players.values()].filter(player => !player.eliminated).map(player => this.publicPlayer(player)).sort((a, b) => b.score - a.score || b.accuracy - a.accuracy);
    const winner = survivors[0] || null;
    this.result = { id: this.round, outcome, endedAt: this.now(), participants, winner, survivors: survivors.length,
      awards: { contribution: winner, precision: participants.filter(player => player.attempted >= 20).sort((a, b) => b.accuracy - a.accuracy || b.correct - a.correct)[0] || null, combo: participants.filter(player => player.bestCombo > 0).sort((a, b) => b.bestCombo - a.bestCombo)[0] || null } };
    this.save(this.result); for (const player of this.players.values()) this.recordPlayer(player, true);
    this.phase = 'finished'; this.event(outcome === 'survivor' ? `${winner?.name || '选手'} 成为最后幸存者！` : '淘汰赛结束，查看本局排名', 'stage');
  }
  state(id) {
    const base = super.state(id); const alive = base.players.filter(player => !player.eliminated);
    const players = base.players.sort((a, b) => Number(a.eliminated) - Number(b.eliminated) || b.score - a.score || b.accuracy - a.accuracy || b.combo - a.combo);
    return { ...base, players, gameType: 'elimination', activeCount: alive.length,
      elimination: { round: this.eliminationRound, totalRounds: Math.ceil(ROUND_MS / ELIMINATION_INTERVAL_MS), intervalMs: ELIMINATION_INTERVAL_MS, nextAt: this.nextEliminationAt, dangerCount: alive.length > 1 ? Math.max(1, Math.floor(alive.length / 4)) : 0 },
      me: base.me ? { ...base.me, task: base.me.eliminated ? null : base.me.task } : null };
  }
}

function installBoss(app, { db, requireUser, now }) {
  db.exec('CREATE TABLE IF NOT EXISTS boss_results (id TEXT PRIMARY KEY, ended_at INTEGER NOT NULL, result_json TEXT NOT NULL)');
  const record = ({ round, player, finalized, at, durationMs }) => {
    db.prepare(`INSERT INTO training_sessions (user_id, mode, lesson_title, correct_chars, wrong_chars, accuracy, speed, duration_ms, completed_at, source_key, is_finalized)
      VALUES (?, 'boss', ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(source_key) WHERE source_key IS NOT NULL DO UPDATE SET lesson_title=excluded.lesson_title, correct_chars=excluded.correct_chars,
      wrong_chars=excluded.wrong_chars, accuracy=excluded.accuracy, speed=excluded.speed, duration_ms=excluded.duration_ms, completed_at=excluded.completed_at, is_finalized=excluded.is_finalized`)
      .run(player.id, finalized ? '极速淘汰赛（已结算）' : '极速淘汰赛（进行中）', player.correct, player.attempted - player.correct,
        Math.round(player.correct / player.attempted * 100), Math.round(player.correct / durationMs * 60000), durationMs, at, `boss:${round}:${player.seat}`, finalized ? 1 : 0);
  };
  const room = new EliminationRoom({ now, record, save: result => db.prepare('INSERT OR IGNORE INTO boss_results VALUES (?,?,?)').run(result.id, result.endedAt, JSON.stringify(result)) });
  const route = fn => (req, res, next) => { try { res.json(fn(req)); } catch (error) { if (error.status) res.status(error.status).json({ message: error.message }); else next(error); } };
  app.get('/api/boss', requireUser, route(req => room.state(req.user.id)));
  app.post('/api/boss/join', requireUser, route(req => room.join(req.user)));
  app.post('/api/boss/start', requireUser, route(req => room.start(req.user.id)));
  app.post('/api/boss/type', requireUser, route(req => room.type(req.user.id, req.body)));
  app.post('/api/boss/next', requireUser, route(req => room.next(req.user.id, req.body)));
  app.post('/api/boss/leave', requireUser, route(req => room.leave(req.user.id, req.body?.seat)));
}
module.exports = { BossRoom, EliminationRoom, installBoss, ROUND_MS, GATHER_MS, RESULT_MS, ELIMINATION_INTERVAL_MS, LESSONS,
  TEAM_COMBO_SIZE, TEAM_COMBO_MIN, TEAM_COMBO_BONUS, TEAM_COMBO_GRACE_MS };
