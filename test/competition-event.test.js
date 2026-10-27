const assert = require('node:assert/strict');
const test = require('node:test');
const { createDatabase } = require('../backend/database');
const { CompetitionEvent, DEFAULT_CONFIG } = require('../backend/competition-event');

function setup(config = {}) {
  let currentTime = 1_000_000;
  const db = createDatabase(':memory:');
  const engine = new CompetitionEvent(db, { now: () => currentTime });
  const insertUser = db.prepare('INSERT INTO users (id, username, display_name, password_hash) VALUES (?, ?, ?, ?)');
  const addUser = (id, name = `选手${id}`) => insertUser.run(id, `student${id}`, name, 'hash');
  const advance = (ms) => { currentTime += ms; };
  const event = engine.create({ name: '测试比赛', config });
  engine.openRegistration(event.id);
  const joinAll = (ids) => ids.forEach((id) => engine.join(event.id, { id }));
  return { db, engine, advance, addUser, event, joinAll, now: () => currentTime };
}

// 分批提交，单批不超过 maxBatch
function typeAll(engine, eventId, userId, text, batch = 16) {
  for (let index = batch; index < text.length; index += batch) {
    engine.submit(eventId, userId, text.slice(0, index));
  }
  return engine.submit(eventId, userId, text);
}

function corrupt(text, count) {
  return 'X'.repeat(count) + text.slice(count);
}

test('runs a full individual event: qualifier, final, and final ranking', () => {
  const { engine, advance, addUser, event, joinAll } = setup();
  [1, 2, 3, 4].forEach((id) => addUser(id));
  joinAll([1, 2, 3, 4]);

  const first = engine.beginRound(event.id);
  assert.equal(first.status, 'running');
  assert.equal(first.round.no, 1);
  assert.equal(first.round.isFinal, false);
  assert.equal(first.round.keepCount, 2, '4 人按 50% 保留 2 人');
  assert.equal(first.config.roundMs, DEFAULT_CONFIG.roundMs);

  const text = first.round.text;

  advance(30_000);
  typeAll(engine, event.id, 1, text); // 30 秒打完
  advance(15_000);
  typeAll(engine, event.id, 2, text); // 45 秒打完
  advance(5_000);
  engine.submit(event.id, 3, text.slice(0, 12)); // 未打完
  engine.submit(event.id, 4, text.slice(0, 8));

  // 一个人打完不结算整轮，本轮继续
  const midway = engine.state(event.id);
  assert.equal(midway.round.status, 'running');
  assert.equal(midway.players.find((player) => player.userId === 1).finished, true);
  assert.equal(midway.players.find((player) => player.userId === 3).finished, false);

  advance(DEFAULT_CONFIG.roundMs + 1); // 时限到
  const settled = engine.state(event.id);
  assert.equal(settled.round.status, 'settled');
  assert.deepEqual(settled.ranking.map((row) => row.userId), [1, 2, 3, 4]);
  assert.equal(settled.ranking[0].elapsedMs, 30_000);
  assert.equal(settled.ranking[1].elapsedMs, 45_000);

  // 第 2 轮只剩 2 人 → 决赛轮，不再淘汰
  const second = engine.beginRound(event.id);
  assert.equal(second.round.no, 2);
  assert.equal(second.round.isFinal, true);
  assert.equal(second.round.keepCount, 2);

  advance(35_000);
  typeAll(engine, event.id, 1, second.round.text);
  advance(5_000);
  typeAll(engine, event.id, 2, second.round.text); // 全员完成 → 自动结算并结束

  const finished = engine.state(event.id);
  assert.equal(finished.status, 'finished');
  const byId = (id) => finished.players.find((player) => player.userId === id);
  assert.equal(byId(1).finalRank, 1);
  assert.equal(byId(2).finalRank, 2);
  assert.equal(byId(3).finalRank, 3, '被淘汰的人也要有最终名次');
  assert.equal(byId(4).finalRank, 4);
});

test('accuracy below the threshold does not count as finished', () => {
  const { engine, advance, addUser, event, joinAll } = setup();
  [1, 2].forEach((id) => addUser(id));
  joinAll([1, 2]);

  const round = engine.beginRound(event.id);
  const text = round.round.text;
  // 打满长度但错了 6 个字，准确率低于 95%
  engine.submit(event.id, 1, corrupt(text, 6).slice(0, 16));
  for (let index = 16; index <= text.length; index += 16) {
    engine.submit(event.id, 1, corrupt(text, 6).slice(0, Math.min(index, text.length)));
  }
  engine.submit(event.id, 1, corrupt(text, 6));

  const state = engine.state(event.id);
  const player = state.players.find((item) => item.userId === 1);
  assert.equal(player.finished, false);
  assert.equal(player.elapsedMs, null);
  assert.ok(player.accuracy < 95, `准确率应低于门槛，实际 ${player.accuracy}`);

  advance(DEFAULT_CONFIG.roundMs + 1);
  const settled = engine.state(event.id);
  assert.equal(settled.round.status, 'settled');
});

test('rejects out-of-order input and oversized batches', () => {
  const { engine, addUser, event, joinAll } = setup();
  [1, 2].forEach((id) => addUser(id));
  joinAll([1, 2]);
  const round = engine.beginRound(event.id);
  const text = round.round.text;

  engine.submit(event.id, 1, text.slice(0, 4));
  assert.throws(() => engine.submit(event.id, 1, 'ZZZZ'), /按顺序输入/);
  assert.throws(() => engine.submit(event.id, 1, text.slice(0, 40)), /按顺序输入/, '单批上限 16 字');
});

test('refuses to start a round with fewer than two players', () => {
  const { engine, addUser, event, joinAll } = setup();
  addUser(1);
  joinAll([1]);
  assert.throws(() => engine.beginRound(event.id), /至少需要 2 名选手/);
});

test('cannot join after registration closes', () => {
  const { engine, addUser, event, joinAll } = setup();
  [1, 2, 3].forEach((id) => addUser(id));
  joinAll([1, 2]);
  engine.beginRound(event.id);
  assert.throws(() => engine.join(event.id, { id: 3 }), /检录/);
});

test('honours a custom keep ratio and round duration', () => {
  const { engine, advance, addUser, event, joinAll } = setup({ keepRatio: 0.25, roundMs: 60_000 });
  [1, 2, 3, 4, 5, 6, 7, 8].forEach((id) => addUser(id));
  joinAll([1, 2, 3, 4, 5, 6, 7, 8]);

  const round = engine.beginRound(event.id);
  assert.equal(round.round.keepCount, 2, '8 人按 25% 保留 2 人');
  assert.equal(round.round.durationMs, 60_000);

  advance(60_001);
  const settled = engine.state(event.id);
  assert.equal(settled.round.status, 'settled');
  assert.equal(settled.ranking.filter((row) => row.advanced).length, 2);
});

test('only three or fewer players left means the next round is the final', () => {
  const { engine, addUser, event, joinAll } = setup();
  [1, 2, 3].forEach((id) => addUser(id));
  joinAll([1, 2, 3]);

  const round = engine.beginRound(event.id);
  assert.equal(round.round.isFinal, true);
  assert.equal(round.round.keepCount, 3, '决赛轮不淘汰');
});

test('round-robin rotation schedules every pair exactly once for five sides', () => {
  const db = createDatabase(':memory:');
  const engine = new CompetitionEvent(db);
  const event = engine.create({
    name: '五方循环测试',
    mode: 'team',
    config: { series: 'league', teamSize: 1 },
    sides: [{ name: '甲' }, { name: '乙' }, { name: '丙' }, { name: '丁' }, { name: '戊' }]
  });
  const sides = engine.sidesOf(event.id);
  const pairs = new Set();
  for (let round = 1; round <= 5; round += 1) {
    for (const pair of engine.pairingsFor(sides, round)) pairs.add([pair.sideA.id, pair.sideB.id].sort().join(':'));
  }
  assert.equal(pairs.size, 10);
  db.close();
});

test('Chinese and English speed events use one shared text and settle only at the fixed deadline', () => {
  for (const language of ['zh', 'en']) {
    let now = 1_000_000;
    const db = createDatabase(':memory:');
    const engine = new CompetitionEvent(db, { now: () => now });
    const event = engine.create({ name: `${language} speed`, mode: 'speed', config: { language, roundMs: 60_000, maxBatch: 2000 } });
    const insertUser = db.prepare('INSERT INTO users (id, username, display_name, password_hash) VALUES (?, ?, ?, ?)');
    for (const id of [1, 2, 3]) insertUser.run(id, `speed${id}`, `选手${id}`, 'hash');
    engine.openRegistration(event.id);
    for (const id of [1, 2, 3]) engine.join(event.id, { id });
    const started = engine.beginRound(event.id);
    assert.equal(started.players.length, 3);
    assert.equal(started.round.status, 'countdown');
    assert.throws(() => engine.submit(event.id, 1, 'a'), /倒计时/);
    assert.ok(started.round.text.length > 200);
    if (language === 'en') assert.match(started.round.text, /[a-z] [a-z]/i);
    now += started.config.countdownMs;
    assert.equal(engine.state(event.id).round.status, 'running');
    now += 10_000;
    engine.submit(event.id, 1, started.round.text.slice(0, 40));
    engine.submit(event.id, 2, started.round.text.slice(0, 20));
    assert.equal(engine.state(event.id).status, 'running');
    now += 50_001;
    const finished = engine.state(event.id);
    assert.equal(finished.status, 'finished');
    assert.deepEqual(finished.ranking.map((row) => row.userId), [1, 2, 3]);
    assert.equal(finished.ranking[0].correct, 40);
    assert.equal(finished.ranking[0].timeMs, 60_000);
    assert.equal(finished.ranking[0].speed, 40);
    db.close();
  }
});
