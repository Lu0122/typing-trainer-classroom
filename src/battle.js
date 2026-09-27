const crypto = require('node:crypto');

const GRID_COLUMNS = 36;
const GRID_ROWS = 18;
const INITIAL_FRONTIER = [18, 19, 17, 20, 16, 18, 19, 17, 18, 17, 18, 19, 17, 20, 16, 18, 19, 18];
const CHARACTER_ATTACK_POWER = 0.15;
const BATTLE_PROGRESS_SAVE_INTERVAL_MS = 1_000;
// 连击威力放大：连续打对越多，每个字符的占领效率越高；打错立即回落到基础值。
const COMBO_TIERS = [
  { combo: 30, multiplier: 4, label: '压倒性攻势' },
  { combo: 15, multiplier: 2.5, label: '持续压制' },
  { combo: 5, multiplier: 1.5, label: '连击加成' }
];
const comboPower = combo => (COMBO_TIERS.find(tier => combo >= tier.combo)?.multiplier ?? 1);
const comboLabel = combo => COMBO_TIERS.find(tier => combo >= tier.combo)?.label ?? '基础攻势';

const TEXTS = [
  { kind: '中文励志', text: '真正的进步来自每天一点点坚持。把目标写清楚，把今天的事情认真做好，明天就会比今天更接近理想。' },
  { kind: '中文励志', text: '遇到困难时先保持冷静，再寻找解决问题的方法。耐心练习、及时复盘，努力终会变成看得见的能力。' },
  { kind: '中文文章', text: '学习不是和别人比较，而是不断超越昨天的自己。愿我们保持好奇，勇敢尝试，在实践中收获自信。' },
  { kind: '中文文章', text: '每一次准确输入都在训练专注，每一次完成任务都在积累经验。一步一步向前走，普通的努力也会产生不普通的结果。' },
  { kind: '英文语句', text: 'Small steps every day can lead to a big change. Keep learning, stay patient, and believe in your progress.' },
  { kind: '英文语句', text: 'A clear goal gives us direction, and steady practice gives us strength. We can improve when we try again.' },
  { kind: '英文语句', text: 'Good teamwork begins with respect, careful listening, and the courage to share a useful idea.' },
  { kind: '英文语句', text: 'Focus on accuracy first. Speed will grow naturally when your hands remember the right rhythm.' },
  { kind: '代码练习', text: 'const progress = correct / Math.max(1, total) * 100;' },
  { kind: '代码练习', text: 'function greet(name) { return "Keep learning, " + name; }' },
  { kind: '代码练习', text: 'for (const task of today) { practice(task); improve(); }' },
  { kind: '代码练习', text: 'const team = { focus: true, patience: true, progress: "steady" };' },
];

class Battle {
  constructor({ now = Date.now, save = () => {}, recordProgress = () => {} } = {}) {
    this.now = now; this.save = save; this.recordProgress = recordProgress; this.players = new Map();
    this.round = crypto.randomUUID(); this.phase = 'waiting'; this.red = 50;
    this.host = null; this.started = null; this.balanceAt = now() + 30000;
    this.notice = '选择阵营，两人加入后自动开始。'; this.result = null; this.event = 0;
    this.frontier = [...INITIAL_FRONTIER]; this.lastAttack = null; this.events = [];
    this.broadcastId = 0; this.broadcasts = []; this.fastestSegmentMs = null; this.fastestSpeed = 0;
  }
  online() { return [...this.players.values()].filter(p => this.now() - p.seen < 15000); }
  fail(message) { throw Object.assign(new Error(message), { status: 400 }); }
  publishPerformance(player, ticket) {
    const durationMs = Math.max(1000, this.now() - ticket.issued);
    const durationSeconds = Math.round(durationMs / 100) / 10;
    const speed = Math.round(ticket.text.length / durationMs * 60_000);
    const fastestSegment = this.fastestSegmentMs === null || durationMs < this.fastestSegmentMs;
    const speedLeader = speed > this.fastestSpeed;
    if (!fastestSegment && !speedLeader) return;
    this.fastestSegmentMs = fastestSegment ? durationMs : this.fastestSegmentMs;
    this.fastestSpeed = Math.max(this.fastestSpeed, speed);
    const title = fastestSegment ? `${player.name} 刷新本局最快段落` : `${player.name} 当前速度领先`;
    const detail = fastestSegment
      ? `第 ${ticket.sequence} 段用时 ${durationSeconds} 秒 · ${speed} 字/分`
      : `第 ${ticket.sequence} 段达到 ${speed} 字/分`;
    this.broadcastId += 1;
    this.broadcasts.push({ id: this.broadcastId, team: player.team, title, detail, at: this.now() });
    if (this.broadcasts.length > 12) this.broadcasts.splice(0, this.broadcasts.length - 12);
  }
  tick() {
    const online = this.online();
    if (!online.some(p => p.id === this.host)) this.host = online[0]?.id ?? null;
    if (this.phase === 'finished' && this.now() - this.result.endedAt >= 20000) {
      this.phase = 'waiting'; this.red = 50; this.started = null;
      this.frontier = [...INITIAL_FRONTIER]; this.lastAttack = null; this.events = [];
      this.broadcastId = 0; this.broadcasts = []; this.fastestSegmentMs = null; this.fastestSpeed = 0;
      this.players = new Map(online.map(p=>[p.id,p]));
      for (const p of online) Object.assign(p,{attacks:0,correct:0,attempted:0,combo:0,bestCombo:0,ticket:null,taskIndex:0,lastProgressSavedAt:0});
      if (online.length >= 2) {
        if (online.every(p=>p.team===online[0].team)) online[online.length-1].team=online[0].team==='red'?'blue':'red';
        this.start(this.host);
      }
    }
    if (this.phase === 'running' && this.now() >= this.balanceAt) {
      this.balanceAt = this.now() + 30000;
      let red = online.filter(p => p.team === 'red'), blue = online.filter(p => p.team === 'blue');
      if (Math.abs(red.length - blue.length) > 2) {
        const bigger = red.length > blue.length ? red : blue;
        const target = red.length > blue.length ? 'blue' : 'red';
        const moved = bigger.sort((a,b) => a.attacks - b.attacks || b.joined - a.joined).slice(0, Math.floor(Math.abs(red.length - blue.length) / 2));
        moved.forEach(p => { p.team = target; p.ticket = null; });
        this.notice = `人数平衡：${moved.map(p => p.name).join('、')} 已调至${target === 'red' ? '红' : '蓝'}方，请领取新题。`;
      }
    }
  }
  join(user, team) {
    if (!['red','blue'].includes(team)) this.fail('请选择红方或蓝方');
    this.tick();
    const existing = this.players.get(user.id);
    if (!existing && this.online().length >= 60) this.fail('房间已满，最多同时在线 60 人');
    if (existing && this.phase === 'running' && existing.team !== team) this.fail('对局中由系统平衡阵营，不能自行换边');
    if (!existing && this.phase !== 'running' && this.players.size >= 60) {
      for (const p of this.players.values()) if (this.now() - p.seen >= 15000) this.players.delete(p.id);
    }
    if (!existing && this.players.size >= 60) this.fail('本局参赛名额已满，请等待下一局');
    const p = existing || { id:user.id, name:user.displayName, avatarUrl:user.avatarUrl || null, attacks:0, correct:0, attempted:0, combo:0, bestCombo:0, joined:this.now(), ticket:null, taskIndex:0 };
    p.name = user.displayName; p.avatarUrl = user.avatarUrl || null; p.team = team; p.seen = this.now(); this.players.set(p.id,p);
    if (!this.host) this.host = p.id;
    if (this.phase === 'waiting' && this.online().length >= 2) {
      const online = this.online();
      if (online.every(member => member.team === online[0].team)) online[online.length-1].team = online[0].team === 'red' ? 'blue' : 'red';
      this.start(this.host);
    }
    return this.state(user.id);
  }
  leave(id) {
    const player = this.players.get(id);
    if (!player) return false;
    this.players.delete(id);
    if (this.host === id) this.host = this.online()[0]?.id ?? null;
    if (this.phase === 'running') this.notice = `${player.name} 已退出当前对局。`;
    return true;
  }
  start(id) {
    this.tick();
    if (id !== this.host) this.fail('只有房主可以开始');
    if (this.phase === 'running') this.fail('对局已经开始');
    const online = this.online();
    if (!online.some(p => p.team === 'red') || !online.some(p => p.team === 'blue')) this.fail('红蓝双方至少各一人才能开局');
    this.players = new Map(online.map(p => [p.id,p]));
    for (const p of online) Object.assign(p,{ attacks:0,correct:0,attempted:0,combo:0,bestCombo:0,ticket:null,taskIndex:0,lastProgressSavedAt:0 });
    this.round = crypto.randomUUID(); this.phase = 'running'; this.red = 50;
    this.frontier = [...INITIAL_FRONTIER]; this.lastAttack = null; this.events = [];
    this.broadcastId = 0; this.broadcasts = []; this.fastestSegmentMs = null; this.fastestSpeed = 0;
    this.started = this.now(); this.balanceAt = this.now()+30000; this.result = null;
    this.notice = '对局开始！每完成一段正确输入，触发一次攻击，占领 1% 领地。';
    return this.state(id);
  }
  task(id) {
    this.tick(); const p = this.players.get(id);
    if (!p || this.phase !== 'running') this.fail('请先加入正在进行的对局');
    p.seen = this.now();
    if (!p.ticket) { const sequenceIndex = Number.isInteger(p.taskIndex) ? p.taskIndex : 0; const lesson = TEXTS[sequenceIndex % TEXTS.length]; p.ticket = { id:crypto.randomUUID(), text:lesson.text, kind:lesson.kind, progress:0, sequence:sequenceIndex + 1, total:null, issued:this.now(), round:this.round }; }
    return { id:p.ticket.id, text:p.ticket.text, kind:p.ticket.kind, progress:p.ticket.progress||0, sequence:p.ticket.sequence, total:p.ticket.total, round:this.round, team:p.team };
  }
  attack(id, body) {
    this.tick(); const p = this.players.get(id), t = p?.ticket;
    if (this.phase !== 'running' || !t || body.ticket !== t.id || t.round !== this.round) this.fail('题目已失效或已提交，请领取新题');
    p.seen = this.now();
    const input = String(body.text ?? '').slice(0,200);
    const minimumTypingTime = Math.max(1200, Math.min(3000, t.text.length * 30));
    if (this.now() - t.issued < minimumTypingTime) this.fail('输入过快，请按正常速度完成练习');
    if (input !== t.text) { p.attempted += input.length; this.fail('文字尚未完全正确，请检查标红位置'); }
    this.publishPerformance(p, t);
    p.ticket = null; p.taskIndex = (Number.isInteger(p.taskIndex) ? p.taskIndex : 0) + 1; p.attacks++; p.correct += input.length; p.attempted += input.length;
    this.red = Math.max(0,Math.min(100,this.red+(p.team === 'red' ? 1 : -1)));
    this.event++;
    const captured = this.captureCells(p.team);
    this.lastAttack = { id:this.event, team:p.team, playerId:p.id, playerName:p.name, captured, at:this.now() };
    this.events.push(this.lastAttack);
    if (this.events.length > 40) this.events.splice(0,this.events.length-40);
    this.notice = `${p.name} 完成打字，${p.team === 'red' ? '红' : '蓝'}方占领 1% 领地！`;
    this.recordProgress({ round: this.round, player: p, durationMs: Math.max(1000, this.now() - this.started), completedAt: this.now(), finalized: false });
    if (this.red === 0 || this.red === 100) this.finish();
    return this.state(id);
  }
  attackCharacter(id, body) {
    return this.attackCharacters(id, body);
  }
  attackCharacters(id, body) {
    this.tick(); const p = this.players.get(id), t = p?.ticket;
    if (this.phase !== 'running' || !t || body.ticket !== t.id || t.round !== this.round) this.fail('题目已失效或已提交，请领取新题');
    p.seen = this.now();
    const progress = Number(t.progress) || 0;
    const input = String(body.text ?? '').slice(0, 200);
    const expected = t.text.slice(0, input.length);
    const count = input.length - progress;
    if (count < 1 || count > 12 || input !== expected) {
      // 打错即中断连击：这是高连击威力的代价，避免“只靠快、不靠稳”。
      p.attempted += 1; p.combo = 0;
      this.fail('连续字符内容不正确，请修正后再攻击');
    }
    t.progress = input.length;
    p.attacks += count; p.correct += count; p.attempted += count;
    // 每个字符按当时的连击档位独立结算威力，连击越高推进越快；错字会清空连击。
    let power = 0;
    for (let i = 0; i < count; i++) {
      p.combo = (p.combo || 0) + 1;
      p.bestCombo = Math.max(p.bestCombo || 0, p.combo);
      power += CHARACTER_ATTACK_POWER * comboPower(p.combo);
    }
    power = Math.round(power * 1000) / 1000;
    this.red = Math.max(0, Math.min(100, this.red + (p.team === 'red' ? power : -power)));
    this.event++;
    const captured = this.captureCells(p.team);
    const row = (this.event * 5) % GRID_ROWS;
    const impact = { row, column: p.team === 'red' ? Math.min(GRID_COLUMNS - 1, this.frontier[row]) : Math.max(0, this.frontier[row] - 1), team:p.team };
    this.lastAttack = { id:this.event, team:p.team, playerId:p.id, playerName:p.name, captured, impact, characters:count, power,
      combo:p.combo, multiplier:comboPower(p.combo), label:comboLabel(p.combo), at:this.now() };
    this.events.push(this.lastAttack);
    if (this.events.length > 40) this.events.splice(0, this.events.length-40);
    const completed = t.progress >= t.text.length;
    if (completed) { this.publishPerformance(p, t); p.ticket = null; p.taskIndex = (Number.isInteger(p.taskIndex) ? p.taskIndex : 0) + 1; }
    const tier = comboPower(p.combo);
    this.notice = `${p.name} 连续输入 ${count} 个正确字符，${p.team === 'red' ? '红' : '蓝'}方发动攻击${tier > 1 ? `（${comboLabel(p.combo)} ×${tier}）` : ''}${completed ? '并完成本段' : ''}。`;
    if (!p.lastProgressSavedAt || this.now() - p.lastProgressSavedAt >= BATTLE_PROGRESS_SAVE_INTERVAL_MS || completed) {
      this.recordProgress({ round: this.round, player: p, durationMs: Math.max(1000, this.now() - this.started), completedAt: this.now(), finalized: false });
      p.lastProgressSavedAt = this.now();
    }
    if (this.red === 0 || this.red === 100) this.finish();
    return this.state(id);
  }
  advance(id, body) {
    this.tick(); const p = this.players.get(id), t = p?.ticket;
    if (this.phase !== 'running' || !t || body.ticket !== t.id || t.round !== this.round) this.fail('题目已失效或已提交，请领取新题');
    p.seen = this.now();
    const input = String(body.text ?? '').slice(0, t.text.length);
    if (input.length !== t.text.length) this.fail('请先完成整段输入，再按回车进入下一段');
    const progress = Number(t.progress) || 0;
    // Correct characters have already been committed through attackCharacters.
    // The advance action only records the uncommitted remainder and never creates an attack.
    p.attempted += Math.max(0, input.length - progress);
    p.ticket = null;
    p.taskIndex = (Number.isInteger(p.taskIndex) ? p.taskIndex : 0) + 1;
    this.notice = `${p.name} 完成第 ${t.sequence} 段输入，进入下一段；本次回车不产生攻击。`;
    return this.state(id);
  }
  captureCells(team) {
    const target = Math.round(GRID_COLUMNS * GRID_ROWS * this.red / 100);
    let current = this.frontier.reduce((sum, columns) => sum + columns, 0);
    const changed = [];
    let cursor = (this.event * 5) % GRID_ROWS;
    let guard = GRID_COLUMNS * GRID_ROWS * 2;
    while (current !== target && guard-- > 0) {
      const row = cursor % GRID_ROWS;
      cursor += 7;
      if (current < target && this.frontier[row] < GRID_COLUMNS) {
        const column = this.frontier[row];
        this.frontier[row] += 1; current += 1;
        changed.push({ row, column, team:'red' });
      } else if (current > target && this.frontier[row] > 0) {
        this.frontier[row] -= 1; current -= 1;
        changed.push({ row, column:this.frontier[row], team:'blue' });
      }
    }
    return changed;
  }
  finish() {
    const duration = Math.max(1,Math.floor((this.now()-this.started)/1000));
    const teams = {};
    for (const team of ['red','blue']) teams[team] = [...this.players.values()].filter(p=>p.team===team).map(p=>({ id:p.id,name:p.name,attacks:p.attacks,correct:p.correct,accuracy:p.attempted?Math.round(p.correct/p.attempted*100):100,speed:Math.round(p.correct*60/duration) })).sort((a,b)=>b.correct-a.correct||b.accuracy-a.accuracy||a.id-b.id);
    const result = { id:this.round, winner:this.red===100?'red':'blue', duration, endedAt:this.now(), teams, red:this.red };
    this.save(result); this.result = result; this.phase = 'finished';
    this.notice = `${result.winner === 'red' ? '红' : '蓝'}方占领全部领地，对局结束！`;
  }
  state(id, user = null) {
    const p = this.players.get(id); if (p) { p.seen=this.now(); if (user) { p.name=user.displayName; p.avatarUrl=user.avatarUrl || null; } } this.tick();
    const online = this.online(), duration = this.started ? Math.max(1,(this.now()-this.started)/1000) : 1;
    const teams = {};
    for (const team of ['red','blue']) {
      const members=online.filter(p=>p.team===team), all=[...this.players.values()].filter(p=>p.team===team);
      const correct=all.reduce((s,p)=>s+p.correct,0), attempted=all.reduce((s,p)=>s+p.attempted,0);
      teams[team]={ count:members.length, speed:members.length?Math.round(correct*60/duration/members.length):0, accuracy:attempted?Math.round(correct/attempted*100):100, attacks:all.reduce((s,p)=>s+p.attacks,0), area:Math.round(team==='red'?this.red:100-this.red) };
    }
    return { room:'1024', round:this.round, phase:this.phase, host:this.host, online:online.length, elapsed:this.started?Math.floor(duration):0, balanceIn:Math.max(0,Math.ceil((this.balanceAt-this.now())/1000)), teams, territory:{columns:GRID_COLUMNS,rows:GRID_ROWS,frontier:[...this.frontier],redCells:this.frontier.reduce((sum,columns)=>sum+columns,0),totalCells:GRID_COLUMNS*GRID_ROWS}, players:online.map(p=>({ id:p.id,name:p.name,avatarUrl:p.avatarUrl || null,team:p.team,correct:p.correct,attacks:p.attacks,speed:Math.round(p.correct*60/duration),accuracy:p.attempted?Math.round(p.correct/p.attempted*100):100,sequence:(Number.isInteger(p.taskIndex)?p.taskIndex:0)+1,progress:p.ticket?.progress||0,combo:p.combo||0,bestCombo:p.bestCombo||0,multiplier:comboPower(p.combo||0),comboLabel:comboLabel(p.combo||0) })), me:p?{id:p.id,team:p.team,attacks:p.attacks,correct:p.correct,combo:p.combo||0,bestCombo:p.bestCombo||0,multiplier:comboPower(p.combo||0),comboLabel:comboLabel(p.combo||0),progress:p.ticket?.progress||0}:null, comboPower:{tiers:COMBO_TIERS,base:CHARACTER_ATTACK_POWER}, notice:this.notice, broadcasts:this.broadcasts.map((item)=>({...item})), event:this.event, lastAttack:this.lastAttack, events:this.events.map(event=>({...event,impact:event.impact?{...event.impact}:null,captured:event.captured.map(cell=>({...cell}))})), result:this.result };
  }
}

function installBattle(app, { db, requireUser, now }) {
  db.exec('CREATE TABLE IF NOT EXISTS battle_results (id TEXT PRIMARY KEY, ended_at INTEGER NOT NULL, result_json TEXT NOT NULL)');
  const saveBattleProgress = ({ round, player, durationMs, completedAt, finalized }) => {
    if (!player.correct) return;
    const accuracy = player.attempted ? Math.round(player.correct / player.attempted * 100) : 100;
    const wrong = Math.max(0, player.attempted - player.correct);
    const speed = Math.round(player.correct / Math.max(1000, durationMs) * 60_000);
    const sourceKey = `battle:${round}:${player.id}`;
    const existing = db.prepare('SELECT id FROM training_sessions WHERE source_key = ?').get(sourceKey);
    const lessonTitle = finalized ? '红蓝打字占领战（已结算）' : '红蓝打字占领战（进行中）';
    if (existing) {
      db.prepare(`UPDATE training_sessions SET lesson_title = ?, correct_chars = ?, wrong_chars = ?, accuracy = ?, speed = ?, duration_ms = ?, completed_at = ? WHERE id = ?`)
        .run(lessonTitle, player.correct, wrong, accuracy, speed, durationMs, completedAt, existing.id);
    } else {
      db.prepare(`INSERT INTO training_sessions (user_id, mode, lesson_title, correct_chars, wrong_chars, accuracy, speed, duration_ms, completed_at, source_key) VALUES (?, 'battle', ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(player.id, lessonTitle, player.correct, wrong, accuracy, speed, durationMs, completedAt, sourceKey);
    }
  };
  const saveBattle = db.transaction((result) => {
    db.prepare('INSERT INTO battle_results VALUES (?,?,?)').run(result.id, result.endedAt, JSON.stringify(result));
    for (const team of ['red', 'blue']) {
      for (const player of result.teams[team]) {
        if (!player.correct) continue;
        saveBattleProgress({ round: result.id, player: { ...player, attempted: Math.round(player.correct / Math.max(1, player.accuracy / 100)) }, durationMs: result.duration * 1000, completedAt: result.endedAt, finalized: true });
      }
    }
  });
  const battle = new Battle({ now, save: saveBattle, recordProgress: saveBattleProgress });
  const route = fn => (req,res,next) => { try { res.json(fn(req)); } catch(e) { if(e.status) res.status(e.status).json({message:e.message}); else next(e); } };
  app.get('/api/battle',requireUser,route(req=>battle.state(req.user.id, req.user)));
  app.post('/api/battle/join',requireUser,route(req=>battle.join(req.user,req.body.team)));
  app.get('/api/battle/task',requireUser,route(req=>battle.task(req.user.id)));
  app.post('/api/battle/character',requireUser,route(req=>battle.attackCharacter(req.user.id,req.body)));
  app.post('/api/battle/characters',requireUser,route(req=>battle.attackCharacters(req.user.id,req.body)));
  app.post('/api/battle/advance',requireUser,route(req=>battle.advance(req.user.id,req.body)));
  app.post('/api/battle/attack',requireUser,route(req=>battle.attack(req.user.id,req.body)));
  app.post('/api/battle/leave',requireUser,route(req=>({ ok: battle.leave(req.user.id) })));
}
module.exports = { Battle, installBattle, comboPower, comboLabel, COMBO_TIERS, CHARACTER_ATTACK_POWER };
