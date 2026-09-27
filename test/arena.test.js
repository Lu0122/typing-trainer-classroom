const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { ArenaRoom, GATHER_MS, RESULT_MS, MODES, RACE_WRONG_SPEED_FACTOR, RACE_LAUNCH_MS } = require('../src/arena');
const { SPEED_MAX, GEARS, gearOf, gearMultiplier, typingSpeed, approachSpeed, targetSpeed,
  advanceDistance, WINDOW_MS, KMH_TO_CELLS_PER_S } = require('../src/race-speed');
const { buildChart, judgeKey, accuracyOf, comboMultiplier,
  JUDGE_PERFECT_MS, JUDGE_GREAT_MS, JUDGE_GOOD_MS, JUDGE_MISS_MS, LANE_COUNT, LETTER_LANE } = require('../src/rhythm-chart');
const { createDatabase } = require('../src/database');
const { createApp } = require('../src/app');
const { hashSessionToken } = require('../src/auth');
function setup(mode) {
  let time = 100000; const saved = [], records = [];
  const room = new ArenaRoom(mode, { now: () => time, record: row => records.push(row), save: row => saved.push(row) });
  const join = id => room.join({ id, displayName: `同学${id}` });
  const start = () => room.start(1, { seat: room.state(1).me.seat });
  const advance = ms => { time += ms; };
  const type = (id, text) => { const me = room.state(id).me; return room.type(id, { seat: me.seat, ticket: me.task.id, text }); };
  // 单次提交上限 16 字（见 type() 的校验），所以跨段推进必须分多次提交。
  // 每次之间推进 1200ms：既给速度滑窗累积真实时间跨度，
  // 也避开限流（限流阈值约 0.2 字/毫秒，1200ms 容许约 24 字）。
  const typeAll = (id, limit = 120) => {
    let out = null;
    for (let i = 0; i < limit; i++) {
      const me = room.state(id).me;
      if (!me?.task || me.task.typed.length >= me.task.text.length) break;
      const next = me.task.text.slice(me.task.typed.length, me.task.typed.length + 16);
      out = room.type(id, { seat: me.seat, ticket: me.task.id, text: me.task.typed + next });
      time += 1200;
    }
    return out;
  };
  // 音游按键：把相对偏移换算成按键包。keepAlive 会先推进时钟避免离线超时。
  const press = (id, keys) => { const me = room.state(id).me; return room.press(id, { seat: me.seat, keys }); };
  const notes = () => room.chart.notes;
  const at = () => time - room.startedAt;
  return { room, join, start, advance, type, typeAll, press, notes, at, saved, records, clock: () => time, setClock: v => { time = v; } };
}
for (const mode of ['race', 'rhythm']) {
  test(`${mode}: shared countdown, same ordered text and independent progress`, () => {
    const { room, join, advance, type } = setup(mode); join(1); join(2);
    if (mode === 'race') room.start(1, { seat: room.state(1).me.seat }); else advance(GATHER_MS);
    const one = room.state(1), two = room.state(2);
    assert.equal(one.phase, 'running'); assert.equal(one.me.task.text, two.me.task.text);
    if (mode === 'rhythm') {
      // 音游模式下两人拿到的是同一份谱面（按 round 确定性生成）。
      assert.deepEqual(one.chart.notes.map(n => n.id), two.chart.notes.map(n => n.id));
      assert.equal(one.chart.totalNotes, two.chart.totalNotes);
    } else {
      const next = type(1, one.me.task.text.slice(0, 5)); assert.equal(next.me.correct, 5);
      assert.equal(room.state(2).me.task.typed, ''); assert.equal(room.state(2).players.find(p => p.id === 1).correct, 5);
    }
    assert.throws(() => join(3), /本局已开始/);
  });
  test(`${mode}: invalid and duplicate packets cannot score; Enter never scores`, () => {
    const { room, join, start, advance, type, typeAll, press, notes } = setup(mode); join(1); start(); advance(2000);
    const me = room.state(1).me;
    assert.throws(() => room.type(1, { seat: 'fake', ticket: me.task.id, text: '一' }), /身份已失效/);
    if (mode === 'rhythm') {
      // 伪造座位与重放旧包都不能得分。
      assert.throws(() => room.press(1, { seat: 'fake', keys: [{ key: 'A', at: 0 }] }), /身份已失效/);
      const first = notes()[0], packet = { seat: me.seat, keys: [{ key: first.letter, at: first.at }] };
      const scored = room.press(1, packet).me.score;
      assert.ok(scored > 0);
      // 同一时间戳重放：lastKeyAt 递增约束会丢弃，分数不再增长。
      assert.equal(room.press(1, packet).me.score, scored);
      // 超量按键包被限流。
      assert.throws(() => room.press(1, { seat: me.seat, keys: Array.from({ length: 40 }, (_, i) => ({ key: 'A', at: i })) }), /按键过快/);
      return;
    }
    assert.throws(() => room.type(1, { seat: me.seat, ticket: 'fake', text: '一' }), /题目已更新/);
    const packet = { seat: me.seat, ticket: me.task.id, text: me.task.text.slice(0, 5) };
    const first = room.type(1, packet);
    // 重放同一个包不能再得分（幂等）。
    assert.equal(room.type(1, packet).me.score, first.me.score);
    assert.equal(room.type(1, packet).me.correct, first.me.correct);
    // 乱序/跳字被拒绝。
    assert.throws(() => type(1, 'xxxxx'), /按顺序/);
    // 赛车已改为「打满自动衔接」：next() 变成空操作，不再抛「未打满整段」。
    const seqBefore = room.state(1).me.sequence;
    const noop = room.next(1, { seat: first.me.seat, ticket: first.me.task.id });
    assert.equal(noop.me.sequence, seqBefore, '赛车模式下 next() 不应改变段号');
    // 分批打满整段（单次上限 16 字）后由服务端自动推进，并且分数继续增长。
    const scoreBefore = room.state(1).me.score;
    const done = typeAll(1, 8);
    assert.ok(done, '应能打完当前段落');
    assert.ok(room.state(1).me.sequence > seqBefore, '打满整段应自动衔接下一段');
    assert.ok(room.state(1).me.score > scoreBefore, '打对整段应得分');
  });
  test(`${mode}: expiry settles once, exited students are not podium winners, next round resets`, () => {
    const { room, join, start, advance, type, press, notes, saved } = setup(mode); join(1); join(2); start();
    const first = mode === 'rhythm'
      ? press(1, [{ key: notes()[0].letter, at: notes()[0].at }])
      : type(1, room.state(1).me.task.text.slice(0, 3));
    room.leave(1, first.me.seat);
    advance(MODES[mode].durationMs); const final = room.state(2);
    assert.equal(final.phase, 'finished'); assert.equal(final.result.winners.length, 0); assert.equal(final.result.retired[0].id, 1);
    room.state(2); assert.equal(saved.length, 1);
    advance(RESULT_MS); const fresh = room.state(2); assert.equal(fresh.phase, 'waiting'); assert.equal(fresh.me, null);
    assert.equal(join(1).me.correct, 0);
  });
  test(`${mode}: supports ${MODES[mode].capacity} participants, transfers host, rejects non-host start`, () => {
    const cap = MODES[mode].capacity;
    const { room, join, advance } = setup(mode); for (let i = 1; i <= cap; i++) join(i);
    assert.throws(() => join(cap + 1), /房间已满/);
    assert.throws(() => room.start(2, { seat: room.state(2).me.seat }), /只有房主/);
    room.leave(1, room.state(1).me.seat); assert.equal(room.host, 2);
    const start = room.start(2, { seat: room.state(2).me.seat }); assert.equal(start.players.length, cap - 1);
    advance(15000); room.state(2); advance(6000); assert.equal(room.state(2).players.length, 1);
  });
}
test('race matchmaking: opening the page auto-joins a 4-seat room, and a full room starts fast', async () => {
  const db = createDatabase(':memory:'); let time = 100000;
  const app = createApp({ db, now: () => time });
  try {
    for (let i = 1; i <= 5; i++) {
      db.prepare('INSERT INTO users(id,username,display_name,password_hash,is_active) VALUES(?,?,?,?,1)').run(i, 'mm' + i, '匹配同学' + i, 'unused');
      db.prepare('INSERT INTO user_sessions VALUES(?,?,?,?)').run(hashSessionToken('mm' + i), i, time, time + 999999);
    }
    const jar = i => ({ Cookie: `typing_session=mm${i}` });
    // 1 号只是打开页面（GET），没有点任何按钮，就应被自动匹配进房间。
    const first = await request(app).get('/api/arena/race').set(jar(1)).expect(200);
    assert.ok(first.body.me, '自动匹配后应有参赛身份');
    assert.equal(first.body.capacity, 4);
    assert.ok(first.body.roomNo >= 1024, '房间号应已分配');
    // 2~4 号依次进房，与 1 号同房。
    const round = first.body.round;
    for (let i = 2; i <= 4; i++) {
      const s = await request(app).get('/api/arena/race').set(jar(i)).expect(200);
      assert.equal(s.body.round, round, `${i} 号应与 1 号同房`);
      assert.equal(s.body.players.length, i, '房间人数应随进入递增');
    }
    // 满员后仍由房主手动发车，发车流程共 10 秒（准备 5 秒 + 数字倒计时 5 秒）。
    const after = await request(app).get('/api/arena/race').set(jar(1)).expect(200);
    assert.equal(after.body.startsAt, null, '满员后不应自动发车');
    await request(app).post('/api/arena/race/start').set(jar(1)).send({ seat: after.body.me.seat }).expect(409);
    for (let i = 2; i <= 4; i++) {
      const ready = await request(app).post('/api/arena/race/ready').set(jar(i)).send({ seat: (await request(app).get('/api/arena/race').set(jar(i))).body.me.seat, ready: true }).expect(200);
      assert.equal(ready.body.players.find(p => p.id === i).ready, true);
    }
    const launched = await request(app).post('/api/arena/race/start').set(jar(1)).send({ seat: after.body.me.seat }).expect(200);
    assert.equal(launched.body.startsAt - launched.body.serverNow, RACE_LAUNCH_MS);
    time += RACE_LAUNCH_MS;
    assert.equal((await request(app).get('/api/arena/race').set(jar(1)).expect(200)).body.phase, 'running');
    // 第 5 人自动开第二间房，不影响已开局的这间。
    const fifth = await request(app).get('/api/arena/race').set(jar(5)).expect(200);
    assert.notEqual(fifth.body.round, round);
    assert.equal(fifth.body.phase, 'waiting');
  } finally { db.close(); }
});

test('race supports lobby choice, private room creation, and joining by invite code', async () => {
  const db = createDatabase(':memory:'); const time = 100000;
  const app = createApp({ db, now: () => time });
  try {
    for (let i = 1; i <= 2; i++) {
      db.prepare('INSERT INTO users(id,username,display_name,password_hash,is_active) VALUES(?,?,?,?,1)').run(i, 'invite' + i, '好友' + i, 'unused');
      db.prepare('INSERT INTO user_sessions VALUES(?,?,?,?)').run(hashSessionToken('invite' + i), i, time, time + 999999);
    }
    const cookie = i => ({ Cookie: `typing_session=invite${i}` });
    const lobby = await request(app).get('/api/arena/race?lobby=1').set(cookie(1)).expect(200);
    assert.equal(lobby.body.me, null, '模式选择页不应自动加入公共房间');
    const created = await request(app).post('/api/arena/race/create').set(cookie(1)).send({}).expect(200);
    assert.ok(created.body.roomNo >= 1024);
    const joined = await request(app).post('/api/arena/race/join-code').set(cookie(2)).send({ code: String(created.body.roomNo) }).expect(200);
    assert.equal(joined.body.round, created.body.round);
    assert.equal(joined.body.players.length, 2);
    await request(app).post('/api/arena/race/join-code').set(cookie(2)).send({ code: '999999' }).expect(404);
    await request(app).post('/api/arena/race/leave').set(cookie(1)).send({ seat: created.body.me.seat }).expect(200);
    await request(app).post('/api/arena/race/leave').set(cookie(2)).send({ seat: joined.body.me.seat }).expect(200);
    const replacement = await request(app).post('/api/arena/race/create').set(cookie(1)).send({}).expect(200);
    assert.ok(replacement.body.roomNo > created.body.roomNo, '已释放房间的编号不可复用');
  } finally { db.close(); }
});

test('rhythm difficulty keeps the selected button parameters visible in the returned state', () => {
  const { room, join } = setup('rhythm');
  const joined = join(1); const seat = joined.me.seat;
  const easy = room.chooseDifficulty(1, { seat, difficulty: 'easy' });
  assert.equal(easy.me.difficulty, 'easy');
  room.start(1, { seat });
  assert.equal(room.state(1).chart.fallMs, 5000);
  assert.equal(room.state(1).judgement.goodMs, 300);
});

test('race speed model: gear ladder is monotonic and multipliers match the thresholds', () => {
  // 档位必须随车速单调不降，否则「升档」在界面上会来回跳。
  // gearOf 返回档位对象（含 gear/label/multiplier），这里统一取 .gear。
  let last = 0;
  for (let kmh = 0; kmh <= SPEED_MAX; kmh += 5) {
    const g = gearOf(kmh).gear;
    assert.ok(g >= last, `车速 ${kmh} 时档位从 ${last} 掉到了 ${g}`);
    last = g;
    assert.ok(g >= 1 && g <= GEARS.length);
  }
  // 每个档位阈值处必须恰好切到该档，倍率与表一致。
  for (const g of GEARS) {
    assert.equal(gearOf(g.at).gear, g.gear, `${g.at} km/h 应处于 ${g.gear} 档`);
    assert.equal(gearMultiplier(g.at), g.multiplier);
  }
  assert.equal(gearOf(SPEED_MAX).gear, GEARS.length);
  // 标定校核（跟 race-speed.js 顶部的注释对齐）：
  //   60 字/分 = 1.0 字/秒 → 1.0×130 + 40 = 170 km/h → 3 档巡航
  //   90 字/分 = 1.5 字/秒 → 235 km/h → 4 档
  //   130 字/分 = 2.17 字/秒 → 封顶 320 → 6 档极速
  // 这三个锚点保证「熟练学生落 3~4 档、明显提速才上 6 档」的成长曲线不被改坏。
  assert.equal(gearOf(targetSpeed(60)).gear, 3, `60 字/分应在 3 档，实际 ${targetSpeed(60)} km/h`);
  assert.equal(gearOf(targetSpeed(90)).gear, 4, `90 字/分应在 4 档，实际 ${targetSpeed(90)} km/h`);
  assert.equal(gearOf(targetSpeed(130)).gear, GEARS.length, `130 字/分应封顶到 6 档，实际 ${targetSpeed(130)} km/h`);
});

test('race speed model: typing faster yields higher target speed and never exceeds the cap', () => {
  const slow = targetSpeed(40), mid = targetSpeed(90), fast = targetSpeed(200);
  assert.ok(slow < mid && mid < fast, '字速越高目标车速必须越高');
  assert.ok(fast <= SPEED_MAX, '目标车速不得超过上限');
  // 怠速下限：完全不打字时目标车速回落到 IDLE_KMH，不会变成 0 或负数。
  assert.ok(targetSpeed(0) >= 40, '零字速应保留怠速，不应归零');
  assert.ok(targetSpeed(0) > 0 && targetSpeed(0) < targetSpeed(40), '怠速应低于任何有输入时的目标车速');
});

test('race speed model: acceleration is gradual, braking is faster than coasting', () => {
  // 从静止起步：一步只推进一点，不能瞬间到顶。
  const one = approachSpeed(0, 300, 100);
  assert.ok(one > 0 && one < 300, '加速度应让车速渐增而不是瞬移');
  // 制动（有输入但在减速）比滑行（无输入）掉得更快。
  const braking = approachSpeed(300, 0, 1000, { coasting: false });
  const coasting = approachSpeed(300, 0, 1000, { coasting: true });
  assert.ok(braking < coasting, `制动应比滑行掉得更快：制动 ${braking} vs 滑行 ${coasting}`);
  // 足够长的时间后一定收敛到目标值。
  assert.equal(approachSpeed(0, 200, 60000), 200);
  assert.equal(approachSpeed(300, 0, 60000, { coasting: true }), 0);
});

test('race speed model: distance is speed integrated over time, so typing speed maps to pace', () => {
  // 恒定 300 km/h 跑 1 秒 = 300 × KMH_TO_CELLS_PER_S 格。
  const d = advanceDistance(0, 300, 1000);
  assert.equal(Math.round(d * 1000) / 1000, Math.round(300 * KMH_TO_CELLS_PER_S * 1000) / 1000);
  // 分段积分等于一次性积分（说明它确实是可累加的，不会因轮询频率而改变结果）。
  const split = advanceDistance(advanceDistance(0, 300, 400), 300, 600);
  assert.ok(Math.abs(split - d) < 1e-9, '分段推进与整段推进必须一致');
  // 停手（车速 0）不再前进。
  assert.equal(advanceDistance(50, 0, 5000), 50);
});

test('race speed model: typingSpeed measures recent characters per minute in a sliding window', () => {
  // 6 秒窗口内均匀按 12 个字：12 字 / 6 秒 = 2 字/秒 = 120 字/分。
  const now = 100000;
  const events = Array.from({ length: 12 }, (_, i) => now - 6000 + i * 500);
  const cpm = typingSpeed(events, now, { windowMs: WINDOW_MS });
  assert.ok(cpm >= 100 && cpm <= 140, `6 秒 12 字应约 120 字/分，实际 ${cpm}`);
  // 窗口外的旧事件不参与统计。
  assert.equal(typingSpeed(events, now + WINDOW_MS + 1, { windowMs: WINDOW_MS }), 0);
  // 没有任何输入时为 0，而不是 NaN 或 Infinity。
  assert.equal(typingSpeed([], now, { windowMs: WINDOW_MS }), 0);
});

test('race: typing correct characters raises speed, and speed integrates into distance', () => {
  const { room, join, start, advance, type } = setup('race'); join(1); join(2); start();
  advance(1000);
  const me = room.state(1).me;
  assert.equal(me.speedKmh, 0, '开局车速为 0');
  assert.equal(me.distance, 0);
  // 连打对字，然后把时钟往前推一段：
  // 车速是按 dt 从目标速度逼近的，距离是车速对时间的积分，
  // 所以「打完字」本身不会立刻有速度，必须有时间流过才会体现在 speed/distance 上。
  const typed = type(1, me.task.text.slice(0, 12)).me;
  assert.equal(typed.speedKmh, 0, '刚打完字、还没经过时间，车速仍是 0（速度靠积分推进）');
  advance(1500);
  const running = room.state(1).me;
  assert.ok(running.speedKmh > 0, `经过时间后车速应大于 0，实际 ${running.speedKmh}`);
  assert.ok(running.gear >= 1 && running.gear <= GEARS.length);
  assert.ok(running.distance > 0, `有车速后距离应增长，实际 ${running.distance}`);
  assert.ok(running.distancePct > 0 && running.distancePct <= 100);
});

test('race: a wrong character brakes the car and drops the gear, but speed can recover', () => {
  const { room, join, start, advance, type } = setup('race'); join(1); join(2); start();
  // 先把车开到高速：持续打对 + 推进时间，让滑窗里累积出稳定的高字速。
  let me = room.state(1).me;
  for (let i = 0; i < 8; i++) {
    advance(400);
    me = room.state(1).me;
    const typed = me.task.typed;
    const next = me.task.text.slice(typed.length, typed.length + 8);
    if (next.length) me = type(1, typed + next).me;
  }
  advance(600);
  const before = room.state(1).me.speedKmh;
  assert.ok(before > 0, `应已积累出车速，实际 ${before}`);
  const peak = room.state(1).me.topSpeedKmh;
  // 打错一个字：车速应明显下降（惩罚是「乘一个小于 1 的系数」）。
  // 注意 type() 会先 advanceSpeed 再 penalize，所以掉速后的值介于
  // before×系数 与 before 之间，不能简单断言等于 before×系数。
  const broken = type(1, room.state(1).me.task.typed + 'x').me;
  assert.ok(broken.speedKmh < before, `打错应掉速：${before} → ${broken.speedKmh}`);
  // 对外接口会把车速取整，所以这里留 1 km/h 的显示误差。
  assert.ok(broken.speedKmh <= before * RACE_WRONG_SPEED_FACTOR + 1, '掉速幅度应符合惩罚系数');
  assert.ok(broken.gear >= 1 && broken.gear <= GEARS.length);
  // 峰值车速是「历史最高」，不会被掉速改写。
  assert.ok(broken.topSpeedKmh >= peak, '峰值只增不减');
  // 掉速后继续打对，车速能重新爬起来。
  advance(400);
  const typed = room.state(1).me.task.typed;
  type(1, typed + room.state(1).me.task.text.slice(typed.length, typed.length + 8));
  advance(1500);
  const recovered = room.state(1).me.speedKmh;
  assert.ok(recovered > broken.speedKmh, `掉速后打对字应能重新提速：${broken.speedKmh} → ${recovered}`);
});

test('race: completing a segment auto-advances without pressing Enter', () => {
  const { room, join, start, advance, type, typeAll } = setup('race'); join(1); join(2); start();
  advance(1000);
  const seq = room.state(1).me.sequence;
  const len = room.state(1).me.task.text.length;
  // 只打「刚好打满当前段」所需的批数：每批最多 16 字。
  const batches = Math.ceil(len / 16);
  typeAll(1, batches);
  const second = room.state(1).me;
  assert.ok(second.sequence > seq, `打满一段应自动进入下一段，实际段号 ${second.sequence}`);
  // 全程不调用 room.next()，继续打仍能继续自动衔接。
  const before = second.sequence;
  typeAll(1, 4);
  assert.ok(room.state(1).me.sequence >= before, '不按回车也应继续自动衔接');
  // next() 在赛车模式下是空操作，不会手工换段。
  const snapshot = room.state(1).me.sequence;
  const st = room.state(1).me;
  room.next(1, { seat: st.seat, ticket: st.task.id });
  assert.equal(room.state(1).me.sequence, snapshot, '赛车模式的 next() 不应手工换段');
});

test('race ends when someone covers the target distance, and the finish order matches the ranking', () => {
  const { room, join, start, advance, type, saved } = setup('race'); join(1); join(2); start();
  // 让 1 号稳定高速输出，2 号完全不动。
  for (let i = 0; i < 400 && room.phase === 'running'; i++) {
    advance(500);
    const me = room.state(1).me;
    if (!me || !me.task) break;
    const typed = me.task.typed;
    const next = me.task.text.slice(typed.length, typed.length + 10);
    if (next.length) type(1, typed + next);
  }
  assert.equal(room.phase, 'finished', '以 1 号的高速输出应在时限内跑完 160 格');
  assert.equal(room.result.outcome, 'finish');
  assert.equal(room.result.winners[0].id, 1);
  // 名次必须与胜负一致：第一名就是冠军，否则会出现「赢了但排第二」。
  assert.equal(room.result.ranking[0].id, room.result.winners[0].id, '冠军必须同时是前进距离第一');
  assert.ok(room.result.winners[0].distance >= room.state(1).target, '冲线者应达到目标距离');
  assert.equal(saved.length, 1, '同一次结算只落库一次');
});

test('rhythm chart is deterministic per round, covers 26 letters, never repeats adjacent letters, and spans four lanes', () => {
  const one = buildChart('round-a', 90000), two = buildChart('round-a', 90000), other = buildChart('round-b', 90000);
  assert.deepEqual(one.notes, two.notes);
  assert.notDeepEqual(one.notes, other.notes);
  assert.ok(one.notes.length >= 200, `谱面音符过少，铺不满整局：${one.notes.length}`);
  // 音符按时间严格递增，且相邻字母不重复（否则无法区分漏键与重按）。
  for (let i = 1; i < one.notes.length; i++) {
    assert.ok(one.notes[i].at > one.notes[i - 1].at);
    assert.notEqual(one.notes[i].letter, one.notes[i - 1].letter);
  }
  // 每个字母固定映射到唯一一条道，玩家可以形成「这只手、这条道」的肌肉记忆。
  const lanes = new Map();
  const letters = new Set();
  for (const note of one.notes) {
    assert.ok(note.lane >= 0 && note.lane < LANE_COUNT, '道位必须落在四条道内');
    assert.equal(note.lane, LETTER_LANE.get(note.letter), '道位必须与服务端四道分区一致');
    lanes.set(note.lane, true);
    letters.add(note.letter);
  }
  assert.equal(lanes.size, LANE_COUNT, '四条道都应被谱面覆盖到');
  assert.ok(letters.size >= 12, `谱面覆盖字母过少：${letters.size}`);
});
test('rhythm judgement maps key timing onto the correct grade and rejects wrong keys', () => {
  const chart = buildChart('judge', 90000);
  const note = chart.notes[0];
  const gradeAt = delta => judgeKey(chart, 0, note.letter, note.at + delta, new Set())?.grade ?? null;
  assert.equal(gradeAt(0), 'perfect');
  assert.equal(gradeAt(JUDGE_PERFECT_MS), 'perfect');
  assert.equal(gradeAt(-JUDGE_PERFECT_MS), 'perfect');
  assert.equal(gradeAt(JUDGE_PERFECT_MS + 10), 'great');
  assert.equal(gradeAt(JUDGE_GREAT_MS), 'great');
  assert.equal(gradeAt(JUDGE_GREAT_MS + 10), 'good');
  assert.equal(gradeAt(JUDGE_GOOD_MS), 'good');
  // 超出 Good 窗口就不构成命中。
  assert.equal(gradeAt(JUDGE_GOOD_MS + 10), null);
  assert.equal(gradeAt(-JUDGE_GOOD_MS - 10), null);
  // 按错键不命中任何音符。
  const wrong = note.letter === 'A' ? 'B' : 'A';
  assert.equal(judgeKey(chart, 0, wrong, note.at, new Set()), null);
  // 已经判定掉的音符不会被重复命中。
  assert.equal(judgeKey(chart, 0, note.letter, note.at, new Set([note.id])), null);
  // 准确率与倍率曲线。
  assert.equal(accuracyOf({ perfect: 10, great: 0, good: 0, miss: 0 }), 100);
  assert.equal(accuracyOf({ perfect: 0, great: 0, good: 0, miss: 4 }), 0);
  assert.equal(accuracyOf({ perfect: 1, great: 1, good: 1, miss: 1 }), 53);
  assert.equal(comboMultiplier(0), 1); assert.equal(comboMultiplier(5), 1.2);
  assert.equal(comboMultiplier(15), 1.5); assert.equal(comboMultiplier(30), 2);
  assert.equal(comboMultiplier(60), 2.5); assert.equal(comboMultiplier(100), 3);
});
test('rhythm: perfect play scores every note, combo builds, and accuracy stays at 100', () => {
  const { room, join, start, press, notes, clock, setClock } = setup('rhythm'); join(1); join(2); start();
  const chart = notes();
  const base = clock();
  for (let i = 0; i < chart.length; i += 8) {
    const batch = chart.slice(i, i + 8);
    // 把时钟推进到本批次最后一个音符，既贴近真实节奏也避免离线超时。
    setClock(base + batch[batch.length - 1].at);
    press(1, batch.map(n => ({ key: n.letter, at: n.at })));
  }
  const me = room.state(1).me;
  assert.equal(me.judged, chart.length);
  assert.equal(me.counts.perfect, chart.length);
  assert.equal(me.counts.miss, 0);
  assert.equal(me.accuracy, 100);
  assert.equal(me.bestCombo, chart.length);
  assert.ok(me.score > 0);
});
test('rhythm: missing a stretch of notes records misses and breaks the combo', () => {
  const { room, join, start, advance, press, notes, at } = setup('rhythm'); join(1); join(2); start();
  const chart = notes();
  const opening = chart.slice(0, 4);
  press(1, opening.map(n => ({ key: n.letter, at: n.at })));
  assert.equal(room.state(1).me.combo, 4);
  // 直接跳到 20 秒后按一次无效键：中间的音符全部结算为漏键。
  // 20 秒后（≈21500ms）已经越过了所有前 4 个音符的判定窗口，所以连击必须归零。
  // 但因为「漏键只断连击、不额外扣分」，若是紧接上一个音符就跳过，连击仍可能活着——
  // 这里用的跳幅远大于判定窗口，足以确认漏键真的把连击打断了。
  advance(20000);
  const lapsed = room.state(1).me;
  assert.equal(lapsed.combo, 0);
  assert.ok(lapsed.counts.miss > 10);
  assert.ok(lapsed.accuracy < 100);
  assert.equal(lapsed.counts.miss + lapsed.counts.perfect + lapsed.counts.great + lapsed.counts.good, lapsed.judged);
});
test('rhythm: a whole batch of on-time keys is judged, not written off as misses', () => {
  // 回归：前端会把一个上报周期内的按键攒成批次，一次性提交。
  // 曾经的实现会先用「当前时刻」结算漏键，再逐个判定按键，于是批次里除最后一个之外的
  // 音符全部被提前算成漏键——玩家明明按对了却记 Miss。
  const { room, join, start, press, notes, setClock, clock } = setup('rhythm'); join(1); join(2); start();
  const chart = notes();
  const base = clock();
  const batch = chart.slice(0, 8);
  setClock(base + batch[batch.length - 1].at);
  const me = press(1, batch.map(n => ({ key: n.letter, at: n.at }))).me;
  assert.equal(me.judged, 8, '整批 8 个音符都应当被判定');
  assert.equal(me.counts.perfect, 8);
  assert.equal(me.counts.miss, 0);
  assert.equal(me.bestCombo, 8);
});
test('rhythm: polling state before the key packet arrives does not eat pending notes', () => {
  // 回归：轮询（读 state）与按键上报（写 press）是两个独立请求，读常常先到。
  // 曾经的实现会在读 state 时按「当前时刻」结算漏键，把玩家已经按下、只是还没上报的
  // 音符提前判成 Miss。常态结算必须留出足够余量。
  const { room, join, start, press, notes, setClock, clock } = setup('rhythm'); join(1); join(2); start();
  const chart = notes();
  const base = clock();
  const batch = chart.slice(0, 6);
  // 时钟先走到本批最后一个音符，此时前端发起一次轮询读取。
  setClock(base + batch[batch.length - 1].at);
  room.state(1);
  assert.equal(room.players.get(1).counts.miss, 0, '轮询不应把待上报的音符结算成漏键');
  // 随后按键到达，仍然应当全部命中。
  const me = press(1, batch.map(n => ({ key: n.letter, at: n.at }))).me;
  assert.equal(me.counts.perfect, 6);
  assert.equal(me.counts.miss, 0);
});
test('rhythm: an idle player keeps accruing misses for notes they never play', () => {
  // 漏键结算不能只发生在按键时，否则整段不按的玩家成绩会虚高。
  const { room, join, start, press, notes, advance } = setup('rhythm'); join(1); join(2); start();
  const chart = notes();
  press(1, [{ key: chart[0].letter, at: chart[0].at }]);
  assert.equal(room.state(1).me.counts.miss, 0);
  advance(20000);
  room.tick();
  const idle = room.state(1).me;
  assert.ok(idle.counts.miss > 10, `发呆后应当累计漏键，实际 ${idle.counts.miss}`);
  assert.equal(idle.combo, 0);
  assert.ok(idle.accuracy < 100);
});
test('rhythm: wrong key breaks the combo without adding score or misses', () => {
  const { room, join, start, press, notes } = setup('rhythm'); join(1); join(2); start();
  const chart = notes();
  press(1, [{ key: chart[0].letter, at: chart[0].at }, { key: chart[1].letter, at: chart[1].at }]);
  const before = room.state(1).me;
  assert.equal(before.combo, 2); assert.equal(before.counts.miss, 0);
  // 挑一个「不在场上任何未判定音符字母里」的键，并按在某个音符正中时刻，
  // 这样它必然落进判定窗口、却匹配不到任何音符，属于纯粹的无效按键。
  const upcoming = chart.slice(2, 8).map(n => n.letter);
  const wrong = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').find(c => !upcoming.includes(c));
  assert.ok(wrong, '测试前置条件：场上应当有未被占用的字母');
  const after = press(1, [{ key: wrong, at: chart[2].at }]);
  assert.equal(after.me.combo, 0);
  assert.equal(after.me.score, before.score);
  assert.equal(after.me.counts.miss, 0);
  assert.equal(after.me.keys[0].grade, 'miss');
  assert.equal(after.me.keys[0].noteId, -1);
});
test('rhythm: replayed packets cannot double-score', () => {
  const { room, join, start, notes } = setup('rhythm'); join(1); join(2); start();
  const chart = notes();
  const me = room.state(1).me;
  const packet = { seat: me.seat, keys: [{ key: chart[0].letter, at: chart[0].at }] };
  const first = room.press(1, packet).me.score;
  assert.ok(first > 0);
  assert.equal(room.press(1, packet).me.score, first);
  assert.equal(room.state(1).me.counts.perfect, 1);
});
test('rhythm: ranking tie-breaks equal scores by perfect hits', () => {
  const { room, join, start, press, notes } = setup('rhythm'); join(1); join(2); start();
  const chart = notes();
  // 1 号全部完美；2 号用同样数量的音符但故意偏到 Great 区间。
  press(1, chart.slice(0, 8).map(n => ({ key: n.letter, at: n.at })));
  const offset = JUDGE_PERFECT_MS + 20;
  press(2, chart.slice(0, 8).map(n => ({ key: n.letter, at: n.at + offset })));
  const rows = room.state(1).players;
  assert.equal(rows[0].id, 1);
  assert.ok(rows[0].counts.perfect > rows[1].counts.perfect);
  assert.ok(rows[0].score > rows[1].score);
});
test('race/rhythm authenticated APIs are isolated, keep late entrants watching and persist training', async () => {
  const db = createDatabase(':memory:'); let time = 100000;
  const app = createApp({ db, now: () => time });
  try {
    for (let i = 1; i <= 2; i++) {
      db.prepare('INSERT INTO users(id,username,display_name,password_hash,is_active) VALUES(?,?,?,?,1)').run(i, 'arena' + i, '赛车同学' + i, 'unused');
      db.prepare('INSERT INTO user_sessions VALUES(?,?,?,?)').run(hashSessionToken('arena' + i), i, time, time + 999999);
    }
    const cookie = 'typing_session=arena1';
    await request(app).get('/api/arena/race').expect(401);
    await request(app).get('/api/arena/unknown').set('Cookie', cookie).expect(404);
    for (const mode of ['race', 'rhythm']) {
      const join = await request(app).post(`/api/arena/${mode}/join`).set('Cookie', cookie).send({}).expect(200);
      const startRequest = await request(app).post(`/api/arena/${mode}/start`).set('Cookie', cookie).send({ seat: join.body.me.seat }).expect(200);
      if (mode === 'race') time += RACE_LAUNCH_MS;
      const start = await request(app).get(`/api/arena/${mode}`).set('Cookie', cookie).expect(200);
      // 一间房开局后，新来的同学自动匹配进另一间等待中的房间（多人小房间并存）。
      const other = await request(app).post(`/api/arena/${mode}/join`).set('Cookie', 'typing_session=arena2').send({}).expect(200);
      assert.notEqual(other.body.round, start.body.round, '后加入者应被分到新房间，而不是挤进对局中的房间');
      const me = start.body.me;
      if (mode === 'rhythm') {
        // 音游通过 /press 提交按键，命中前 3 个音符。
        const keys = start.body.chart.notes.slice(0, 3).map(n => ({ key: n.letter, at: n.at }));
        await request(app).post(`/api/arena/${mode}/press`).set('Cookie', cookie).send({ seat: me.seat, keys }).expect(200);
        const replay = await request(app).post(`/api/arena/${mode}/press`).set('Cookie', cookie).send({ seat: me.seat, keys }).expect(200);
        assert.equal(replay.body.me.counts.perfect, 3);
      } else {
        const packet = { seat: me.seat, ticket: me.task.id, text: me.task.text.slice(0, 3) };
        time += 1000;
        await request(app).post(`/api/arena/${mode}/type`).set('Cookie', cookie).send(packet).expect(200);
        await request(app).post(`/api/arena/${mode}/type`).set('Cookie', cookie).send(packet).expect(200);
      }
      assert.equal((await request(app).get('/api/boss').set('Cookie', cookie)).body.players.length, 0);
    }
    time += 120000;
    for (const mode of ['race', 'rhythm']) {
      const result = await request(app).get(`/api/arena/${mode}`).set('Cookie', cookie).expect(200);
      assert.equal(result.body.result.ranking[0].correct, 3);
      const training = db.prepare('SELECT * FROM training_sessions WHERE mode = ?').all(mode);
      assert.equal(training.length, 1); assert.equal(training[0].correct_chars, 3); assert.match(training[0].lesson_title, /已结算/);
    }
    assert.equal(db.prepare('SELECT COUNT(*) n FROM arena_results').get().n, 2);
  } finally { db.close(); }
});
