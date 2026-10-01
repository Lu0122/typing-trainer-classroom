const crypto = require('node:crypto');

const ROUND_MS = 120_000;
const START_COUNTDOWN_MS = 3_000;
const RESULT_MS = 15_000;
const OFFLINE_MS = 25_000;
const TRACK_METERS = 520;
const THIEF_HEADSTART = 16;
const STEP_METERS = { police: 1.35, thief: 0.94 };
// 电脑按玩家输入的正确字符同步推进。两个角色步长不同（警察每字 1.35m、小偷每字 0.94m），
// 电脑必须按角色折算字符比，才能和玩家保持同一量级的推进速度。
const BOT_PACE = { police: 0.72, thief: 1.34 };
const PASSAGES = [
  'Practice makes perfect, and typing makes you faster.',
  'Keep your eyes on the road and your fingers on the keys.',
  'A calm mind and steady hands can win the race.',
  'The police car is close behind, keep moving forward.',
  'Type each letter correctly and stay ahead of the chase.',
  'Quick fingers help you escape around the city park.'
];

class ChaseRoom {
  constructor({ code, now = Date.now, record = () => {}, save = () => {}, onEmpty = () => {} }) {
    this.code = String(code); this.now = now; this.record = record; this.save = save; this.onEmpty = onEmpty;
    this.reset();
  }
  reset() {
    this.round = crypto.randomUUID(); this.phase = 'waiting'; this.players = new Map(); this.retired = [];
    this.host = null; this.startsAt = null; this.startedAt = null; this.endsAt = null; this.result = null;
    this.lastTickAt = this.now(); this.botFraction = 0; this.eventId = 0; this.events = [];
  }
  fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
  addPlayer(user, role, { bot = false } = {}) {
    const player = {
      id: user.id, name: user.displayName, avatarUrl: user.avatarUrl || null,
      seat: crypto.randomUUID(), role, bot, seen: this.now(), correct: 0, attempted: 0,
      wrong: 0, combo: 0, bestCombo: 0, distance: 0, speedKmh: 0, score: 0,
      sequence: 0, task: null, lastSaved: 0
    };
    this.players.set(player.id, player);
    return player;
  }
  create(user, role = 'police') {
    if (this.players.size) this.fail('房间已经创建', 409);
    if (!['police', 'thief'].includes(role)) this.fail('角色不正确');
    const player = this.addPlayer(user, role);
    this.host = user.id;
    this.event(`${player.name} 创建了房间 ${this.code}`);
    return this.state(user.id);
  }
  join(user) {
    this.tick();
    if (this.phase !== 'waiting') this.fail('比赛已经开始，无法加入', 409);
    if (this.players.has(user.id)) return this.state(user.id);
    if (this.players.size >= 2) this.fail('双人房已经满员', 409);
    const role = [...this.players.values()].some(player => player.role === 'police') ? 'thief' : 'police';
    const player = this.addPlayer(user, role);
    this.event(`${player.name} 加入比赛，担任${role === 'police' ? '警察' : '小偷'}`);
    return this.state(user.id);
  }
  addBot(user, role) {
    if (!['police', 'thief'].includes(role)) this.fail('角色不正确');
    const human = this.players.get(user.id) || this.addPlayer(user, role);
    if (this.players.has('cpu')) this.fail('电脑选手已经加入', 409);
    human.role = role; this.host = user.id;
    this.addPlayer({ id: 'cpu', displayName: role === 'police' ? 'AI 小偷' : 'AI 警察' }, role === 'police' ? 'thief' : 'police', { bot: true });
    this.event(`人机追逐开始，你担任${role === 'police' ? '警察' : '小偷'}`);
    return this.start(user.id, human.seat);
  }
  start(id, seat) {
    this.tick();
    if (this.host !== id || this.players.get(id)?.seat !== seat) this.fail('只有房主可以开始', 403);
    if (this.phase !== 'waiting') this.fail('比赛已开始', 409);
    if (this.players.size !== 2) this.fail('需要两位选手到齐才能开始', 409);
    this.phase = 'countdown'; this.startsAt = this.now() + START_COUNTDOWN_MS; this.lastTickAt = this.startsAt;
    this.event('警察和小偷已就位，3 秒后出发');
    return this.state(id);
  }
  newTask(player) {
    player.sequence++;
    player.task = { id: crypto.randomUUID(), sequence: player.sequence, text: PASSAGES[(player.sequence - 1) % PASSAGES.length], typed: '' };
  }
  get playersByRole() {
    const players = [...this.players.values()];
    return { police: players.find(player => player.role === 'police'), thief: players.find(player => player.role === 'thief') };
  }
  tick() {
    const now = this.now();
    if (this.phase === 'finished') {
      if (now >= this.result.endedAt + RESULT_MS) { this.reset(); this.onEmpty(this); }
      return;
    }
    for (const player of this.players.values()) if (!player.bot && now - player.seen > OFFLINE_MS) this.remove(player, true);
    if (this.phase === 'running' && this.players.size < 2) {
      const survivor = this.players.values().next().value;
      this.finish(survivor?.role === 'police' ? 'caught' : 'escaped', { left: true });
      return;
    }
    if (this.phase === 'waiting') return;
    if (this.phase === 'countdown') {
      if (now < this.startsAt) return;
      this.phase = 'running'; this.startedAt = this.startsAt; this.endsAt = this.startedAt + ROUND_MS; this.lastTickAt = this.startedAt;
      for (const player of this.players.values()) { player.distance = 0; player.sequence = 0; this.newTask(player); }
      this.event('出发！警察开始追捕');
    }
    if (this.phase !== 'running') return;
    const dt = Math.max(0, Math.min(2, (now - this.lastTickAt) / 1000));
    this.lastTickAt = now;
    const { police, thief } = this.playersByRole;
    if (police && thief && this.position(police) >= this.position(thief)) { this.finish('caught'); return; }
    if (now >= this.endsAt) this.finish('escaped');
  }
  advanceBot(bot, correctCharacters) {
    // 人机只在玩家输入正确字符时前进：玩家停手时，双方位置都保持不变。
    // fraction 保留小数以平滑折算单字符输入。
    this.botFraction += Math.max(0, correctCharacters) * BOT_PACE[bot.role];
    const chars = Math.floor(this.botFraction);
    if (!chars) return;
    this.botFraction -= chars;
    bot.correct += chars; bot.attempted += chars; bot.combo += chars; bot.bestCombo = Math.max(bot.bestCombo, bot.combo);
    bot.distance += chars * STEP_METERS[bot.role];
    bot.score += chars * (bot.combo >= 30 ? 30 : bot.combo >= 10 ? 20 : 10);
    this.updateSpeed(bot);
  }
  position(player) { return player.role === 'thief' ? THIEF_HEADSTART + player.distance : player.distance; }
  updateSpeed(player) {
    const elapsedSeconds = Math.max(1, (this.now() - (this.startedAt || this.now())) / 1000);
    const cps = player.correct / elapsedSeconds;
    player.speedKmh = Math.max(0, Math.round(24 + cps * 55));
  }
  type(id, body = {}) {
    this.tick();
    const player = this.players.get(id);
    if (!player || player.seat !== body.seat || player.bot) this.fail('参赛身份无效', 409);
    if (this.phase !== 'running') this.fail('比赛尚未开始或已经结束', 409);
    if (body.ticket !== player.task?.id) this.fail('题目已更新，请继续当前段落', 409);
    const text = body.text;
    if (typeof text !== 'string' || !text.startsWith(player.task.typed) || text.length > player.task.text.length || text.length - player.task.typed.length > 24) this.fail('请按顺序输入当前文字');
    if (text === player.task.typed) return this.state(id);
    const elapsed = Math.max(1, (this.now() - this.startedAt) / 1000);
    const typedCharacters = text.length - player.task.typed.length;
    if (player.attempted + typedCharacters > 18 + elapsed * 18) this.fail('输入过快，请正常游玩', 429);
    let moved = 0, correctCharacters = 0;
    for (let i = player.task.typed.length; i < text.length; i++) {
      player.attempted++;
      if (text[i] === player.task.text[i]) {
        player.correct++; player.combo++; player.bestCombo = Math.max(player.bestCombo, player.combo);
        player.score += player.combo >= 30 ? 30 : player.combo >= 10 ? 20 : 10;
        moved += STEP_METERS[player.role]; correctCharacters++;
      } else { player.wrong++; player.combo = 0; }
    }
    player.distance += moved; player.task.typed = text; player.seen = this.now(); this.updateSpeed(player);
    const bot = [...this.players.values()].find(item => item.bot);
    if (bot) this.advanceBot(bot, correctCharacters);
    // 本段输入完成后自动换到下一段，玩家不需要再按回车。
    if (player.task.typed.length >= player.task.text.length) this.newTask(player);
    return this.state(id);
  }
  next(id, body = {}) {
    this.tick();
    const player = this.players.get(id);
    if (!player || player.seat !== body.seat || player.bot) this.fail('参赛身份无效', 409);
    if (this.phase !== 'running') this.fail('比赛尚未开始或已经结束', 409);
    if (body.ticket !== player.task?.id) this.fail('题目已更新，请继续当前段落');
    if (player.task.typed.length !== player.task.text.length) this.fail('请输入完整段落，完成后会自动换段', 409);
    this.newTask(player);
    return this.state(id);
  }
  leave(id, seat) {
    const player = this.players.get(id);
    if (player && player.seat === seat) this.remove(player, false);
    if (this.players.size < 2 && this.phase === 'countdown') { this.phase = 'waiting'; this.startsAt = null; this.event('选手离开，发车倒计时已取消'); }
    if (this.players.size < 2 && this.phase === 'running') this.finish(this.playersByRole.police ? 'caught' : 'escaped', { left: true });
    return { ok: true };
  }
  remove(player, disconnected) {
    this.players.delete(player.id);
    this.retired.push({ ...this.publicPlayer(player), disconnected: !!disconnected });
    this.event(`${player.name} ${disconnected ? '连接中断，离开赛道' : '离开了比赛'}`);
  }
  publicPlayer(player) {
    const elapsed = Math.max(1000, (this.phase === 'running' ? this.now() : this.startedAt || this.now()) - (this.startedAt || this.now()));
    return { id: player.id, seat: player.seat, name: player.name, avatarUrl: player.avatarUrl, role: player.role, bot: player.bot,
      correct: player.correct, attempted: player.attempted, wrong: player.wrong, accuracy: player.attempted ? Math.round(player.correct / player.attempted * 100) : 100,
      combo: player.combo, bestCombo: player.bestCombo, score: player.score, speedKmh: player.speedKmh, distance: player.distance,
      position: this.position(player), progress: Math.round(this.position(player) / TRACK_METERS * 1000) / 10,
      sequence: player.sequence, task: player.bot ? null : player.task, rank: 1 };
  }
  finish(outcome, { left = false } = {}) {
    if (this.phase === 'finished') return;
    this.phase = 'finished';
    const players = [...this.players.values()].map(player => this.publicPlayer(player)).sort((a,b)=>b.position-a.position);
    const winnerRole = outcome === 'caught' ? 'police' : 'thief';
    this.result = { outcome, winnerRole, endedAt: this.now(), durationMs: Math.max(0,this.now()-(this.startedAt||this.now())), players, retired: this.retired, ...(left ? { left: true } : {}) };
    for (const player of this.players.values()) this.record(player, outcome);
    if (left) this.event(`对手离开赛道，${winnerRole === 'police' ? '警察' : '小偷'}获胜`);
    else this.event(outcome === 'caught' ? '警察追上了小偷，警察获胜！' : '时间结束，小偷成功逃脱！');
  }
  event(text) { this.events.push({ id: ++this.eventId, text, at: this.now() }); this.events = this.events.slice(-12); }
  state(userId) {
    // 页面开着的玩家一直在轮询，就是在线的；只有真正断开（关页/卡死）才会超时离线。
    const viewer = this.players.get(userId);
    if (viewer && !viewer.bot) viewer.seen = this.now();
    this.tick();
    const remainingMs = this.phase === 'countdown' ? this.startsAt - this.now() : this.phase === 'running' ? this.endsAt - this.now() : 0;
    const players = [...this.players.values()].map(player => this.publicPlayer(player));
    return { code: this.code, round: this.round, mode: this.mode, phase: this.phase, host: this.host, startsAt: this.startsAt, startedAt: this.startedAt,
      endsAt: this.endsAt, serverNow: this.now(), remainingMs: Math.max(0,remainingMs), durationMs: ROUND_MS, trackMeters: TRACK_METERS,
      thiefHeadstart: THIEF_HEADSTART, players, me: players.find(player => player.id === userId) || null,
      result: this.result, events: this.events };
  }
}

function installChase(app, { db, requireUser, now = Date.now }) {
  db.exec('CREATE TABLE IF NOT EXISTS chase_results (id TEXT PRIMARY KEY, code TEXT NOT NULL, result_json TEXT NOT NULL, ended_at INTEGER NOT NULL)');
  let nextCode = 5101;
  const rooms = new Map(); const memberRooms = new Map();
  const findRoom = (id) => { const room = memberRooms.get(id); if (room && rooms.get(room.code) === room && (room.players.has(id) || room.phase === 'finished')) return room; memberRooms.delete(id); return null; };
  const prune = () => { for (const [code,room] of rooms) { room.tick(); if (!room.players.size && room.phase !== 'finished' || room.phase === 'finished' && now() > room.result.endedAt + RESULT_MS) { rooms.delete(code); for (const [id,memberRoom] of memberRooms) if (memberRoom === room) memberRooms.delete(id); } } };
  const detach = id => { const old = findRoom(id); if (old) { old.leave(id, old.players.get(id)?.seat); memberRooms.delete(id); if (!old.players.size) rooms.delete(old.code); } };
  const newRoom = (user, role = 'police') => {
    prune(); detach(user.id);
    const code = String(nextCode++);
    const room = new ChaseRoom({ code, now, onEmpty: item => { rooms.delete(item.code); for (const [id,memberRoom] of memberRooms) if (memberRoom === item) memberRooms.delete(id); },
      save: result => db.prepare('INSERT OR IGNORE INTO chase_results VALUES (?,?,?,?)').run(result.id || crypto.randomUUID(), code, JSON.stringify(result), result.endedAt),
      record: (player, outcome) => {
        if (player.bot || !player.attempted) return;
        const duration = Math.max(1000, Math.min(now(), room.endsAt || now()) - (room.startedAt || now()));
        db.prepare(`INSERT INTO training_sessions (user_id, mode, lesson_title, correct_chars, wrong_chars, accuracy, speed, duration_ms, completed_at, source_key)
          VALUES (?, 'chase', ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(source_key) WHERE source_key IS NOT NULL DO UPDATE SET lesson_title=excluded.lesson_title, correct_chars=excluded.correct_chars,
          wrong_chars=excluded.wrong_chars, accuracy=excluded.accuracy, speed=excluded.speed, duration_ms=excluded.duration_ms, completed_at=excluded.completed_at`)
          .run(player.id, `生死时速（${outcome === 'caught' ? '警察获胜' : '小偷逃脱'}）`, player.correct, player.wrong,
            player.attempted ? Math.round(player.correct/player.attempted*100) : 100, Math.round(player.correct/duration*60000), duration, now(), `chase:${room.round}:${player.seat}`);
      }
    });
    room.create(user, role); rooms.set(code,room); memberRooms.set(user.id,room); return room;
  };
  const route = fn => (req,res,next)=>{try{res.json(fn(req));}catch(e){if(e.status)res.status(e.status).json({message:e.message});else next(e);}};
  app.get('/api/chase', requireUser, route(req => { prune(); return findRoom(req.user.id)?.state(req.user.id) || {phase:'lobby',serverNow:now()}; }));
  app.post('/api/chase/create', requireUser, route(req => newRoom(req.user, req.body?.role || 'police').state(req.user.id)));
  app.post('/api/chase/bot', requireUser, route(req => { const room = newRoom(req.user, req.body?.role || 'police'); room.addBot(req.user, req.body?.role || 'police'); return room.state(req.user.id); }));
  app.post('/api/chase/join-code', requireUser, route(req => {
    prune(); const room = rooms.get(String(req.body?.code || '').trim());
    if (!room) throw Object.assign(new Error('房间号无效或房间已关闭'),{status:404});
    if (room.players.has(req.user.id)) return room.state(req.user.id);
    // 加入失败时保留原房间，只有目标房间接纳成功才退出原房间。
    const state = room.join(req.user);
    if (findRoom(req.user.id)) detach(req.user.id);
    memberRooms.set(req.user.id,room); return state;
  }));
  app.post('/api/chase/start', requireUser, route(req => { const room=findRoom(req.user.id); if(!room)throw Object.assign(new Error('请先创建或加入房间'),{status:409}); return room.start(req.user.id,req.body?.seat); }));
  app.post('/api/chase/type', requireUser, route(req => { const room=findRoom(req.user.id); if(!room)throw Object.assign(new Error('请先创建或加入房间'),{status:409}); return room.type(req.user.id,req.body); }));
  app.post('/api/chase/next', requireUser, route(req => { const room=findRoom(req.user.id); if(!room)throw Object.assign(new Error('请先创建或加入房间'),{status:409}); return room.next(req.user.id,req.body); }));
  app.post('/api/chase/leave', requireUser, route(req => { const room=findRoom(req.user.id); if(room && room.players.get(req.user.id)?.seat === req.body?.seat){room.leave(req.user.id,req.body.seat);memberRooms.delete(req.user.id);if(!room.players.size)rooms.delete(room.code);}return {ok:true}; }));
}

module.exports = { ChaseRoom, installChase, ROUND_MS, START_COUNTDOWN_MS, TRACK_METERS, THIEF_HEADSTART, STEP_METERS, PASSAGES };
