const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { RunnerRun, challengeFor, COUNTDOWN_MS, GRACE_MS, RECOVERY_MS } = require('../backend/runner');
const { createDatabase } = require('../backend/database');
const { createApp } = require('../backend/app');
const { hashSessionToken } = require('../backend/auth');

function setup(language = 'english') {
  let time = 1000000, saves = 0;
  const run = new RunnerRun({ userId: 1, language, now: () => time, onFinish: () => saves++ });
  return { run, advance: ms => { time += ms; }, get saves() { return saves; } };
}
function begin(context) { context.advance(COUNTDOWN_MS); context.run.tick(); }
function clear(context, inputId) {
  const { run } = context;
  run.type({ ticket: run.task.id, text: run.task.text, inputId });
  context.advance(run.task.deadline + GRACE_MS - run.now()); run.tick();
}
test('runner countdown has no obstacle or running distance, then automatically starts', () => {
  const context = setup();
  context.advance(COUNTDOWN_MS - 1);
  assert.equal(context.run.state().task, null); assert.equal(context.run.distance, 0);
  context.advance(1); assert.equal(context.run.state().phase, 'running');
  assert.ok(context.run.task.deadline > context.run.now());
});
test('runner generates unlimited levels, ramps up difficulty and keeps playable time windows', () => {
  const context = setup(); begin(context);
  const first = context.run.task.id;
  for (let i = 1; i <= 500; i++) clear(context, i);
  assert.equal(context.run.phase, 'running'); assert.equal(context.run.level, 51);
  assert.equal(context.run.cleared, 500); assert.equal(context.run.lives, 3);
  assert.equal(context.run.accuracy, 100); assert.ok(context.run.task.duration >= 2400);
  assert.notEqual(context.run.task.id, first); assert.equal(context.saves, 0);
});
test('runner wrong letters can be edited, retries do not double-score, and completed tasks stay cleared', () => {
  const context = setup(); begin(context); const { run } = context;
  run.type({ ticket: run.task.id, text: '!', inputId: 1 });
  assert.equal(run.score, 0); assert.equal(run.lives, 3); assert.equal(run.correct, 0);
  run.type({ ticket: run.task.id, text: run.task.text, inputId: 2 });
  const score = run.score, attempts = run.attempted;
  run.type({ ticket: run.task.id, text: run.task.text, inputId: 2 });
  run.type({ ticket: run.task.id, text: '!', inputId: 3 });
  assert.equal(run.score, score); assert.equal(run.attempted, attempts); assert.equal(run.cleared, 1);
  assert.ok(run.accuracy < 100); assert.equal(run.task.cleared, true);
});
test('runner allows a small reporting grace window and rejects a stale obstacle afterwards', () => {
  const context = setup(); begin(context); const { run } = context, ticket = run.task.id;
  context.advance(run.task.duration + GRACE_MS - 1);
  run.type({ ticket, text: run.task.text, inputId: 1 });
  context.advance(1); run.tick(); assert.equal(run.lives, 3);
  assert.throws(() => run.type({ ticket, text: 'x', inputId: 2 }), /障碍已更新/);
});
test('runner only loses three lives during a long offline gap and saves once at the final collision', () => {
  const context = setup(); begin(context);
  context.advance(3600000); context.run.tick();
  assert.equal(context.run.phase, 'finished'); assert.equal(context.run.passed, 3);
  assert.ok(context.run.activeMs < 20000); assert.ok(context.run.distance < 200);
  context.run.state(); context.run.finish(); assert.equal(context.saves, 1);
});
test('runner pause freezes distance, lives and deadlines; resume counts down with remaining time', () => {
  const context = setup(); begin(context); context.advance(1200); context.run.pause();
  const distance = context.run.distance, remaining = context.run.pausedRemaining;
  context.advance(3600000); assert.equal(context.run.state().distance, distance);
  assert.equal(context.run.lives, 3); context.run.resume();
  assert.equal(context.run.state().phase, 'countdown'); context.advance(COUNTDOWN_MS);
  const state = context.run.state(); assert.equal(state.task.deadline - context.run.now(), remaining);
  assert.equal(state.distance, distance); assert.equal(state.phase, 'running');
});
test('runner can pause and resume the initial countdown and generates Chinese input tasks', () => {
  const context = setup('chinese'); context.run.pause(); context.advance(999999); context.run.resume(); begin(context);
  assert.match(context.run.task.text, /[\u4e00-\u9fff]/);
  for (let i = 1; i <= 100; i++) clear(context, i);
  assert.equal(context.run.level, 11); assert.ok(context.run.task.duration >= 3300);
});

test('a collision stops the world and input; recovery ends with a fresh full-time obstacle', () => {
  const context = setup(); begin(context); const { run } = context;
  const ticket = run.task.id;
  context.advance(run.task.duration + GRACE_MS); run.tick();
  const distance = run.distance, activeMs = run.activeMs, at = run.now();
  assert.equal(run.phase, 'recovering'); assert.equal(run.lives, 2); assert.equal(run.task.id, ticket);
  assert.equal(run.recovery.until, at + RECOVERY_MS);
  assert.throws(() => run.type({ ticket, text: run.task.text, inputId: 1 }), /当前不能输入/);
  context.advance(RECOVERY_MS - 1); run.tick();
  assert.equal(run.distance, distance); assert.equal(run.activeMs, activeMs); assert.equal(run.lives, 2);
  context.advance(1); run.tick();
  assert.equal(run.phase, 'running'); assert.equal(run.distance, distance); assert.equal(run.recovery, null);
  assert.notEqual(run.task.id, ticket); assert.equal(run.task.deadline - run.now(), run.task.duration);
});

test('last life plays recovery without respawning and saves exactly once after that animation', () => {
  const context = setup(); begin(context); const { run } = context;
  run.lives = 1; context.advance(run.task.duration + GRACE_MS); run.tick();
  assert.equal(run.phase, 'recovering'); assert.equal(context.saves, 0); assert.equal(run.lives, 0);
  const distance = run.distance; context.advance(RECOVERY_MS - 1); run.tick(); assert.equal(context.saves, 0);
  context.advance(1); run.tick(); assert.equal(run.phase, 'finished'); assert.equal(run.reason, 'collision');
  assert.equal(run.distance, distance); assert.equal(context.saves, 1); run.tick(); run.finish(); assert.equal(context.saves, 1);
});

test('pause, re-paused resume countdown, and restart retain the remaining recovery animation', () => {
  const context = setup(); begin(context); const { run } = context;
  context.advance(run.task.duration + GRACE_MS + 650); run.pause();
  const remaining = RECOVERY_MS - 650, distance = run.distance, poseTime = run.pausedAt;
  assert.equal(run.pausedRecoveryMs, remaining); context.advance(100000); run.resume();
  context.advance(900); run.pause(); assert.equal(run.pausedRecoveryMs, remaining); assert.equal(run.pausedAt, poseTime);
  const restored = new RunnerRun({ saved: run.snapshot(), now: run.now });
  restored.resume(); context.advance(COUNTDOWN_MS); restored.tick();
  assert.equal(restored.phase, 'recovering'); assert.equal(restored.recovery.until - run.now(), remaining);
  context.advance(remaining - 1); restored.tick(); assert.equal(restored.distance, distance); assert.equal(restored.lives, 2);
  context.advance(1); restored.tick(); assert.equal(restored.phase, 'running'); assert.equal(restored.task.sequence, 2);
});

test('pausing in the reporting grace or during a resumed countdown never moves the obstacle', () => {
  const context = setup(); begin(context); const { run } = context;
  const routeAt = run.task.routeAt;
  context.advance(run.task.duration + 200); run.pause(); assert.equal(run.pausedRemaining, -200);
  context.advance(50000); run.resume(); context.advance(1000); run.pause(); assert.equal(run.pausedRemaining, -200);
  run.resume(); context.advance(COUNTDOWN_MS + GRACE_MS - 200); run.tick();
  assert.equal(run.phase, 'recovering'); assert.ok(Math.abs(run.distance - routeAt) < 1e-8);
});

test('fork choices have distinct prefixes; either verified word commits exactly one corresponding turn', () => {
  for (const language of ['english', 'chinese']) for (const direction of ['left', 'right']) {
    const context = setup(language); begin(context); const { run } = context;
    for (let i = 1; i < 5; i++) clear(context, i);
    assert.equal(run.task.action, 'fork'); const [left, right] = run.task.choices;
    assert.notEqual(left.text[0], right.text[0]);
    assert.throws(() => run.type({ ticket: run.task.id, inputId: 5, text: '', direction: 'up' }), /请选择左路或右路/);
    const choice = run.task.choices.find(choice => choice.direction === direction);
    run.type({ ticket: run.task.id, inputId: 5, text: choice.text, direction });
    assert.equal(run.task.cleared, true); assert.equal(run.task.text, choice.text); assert.equal(run.heading, 0);
    run.type({ ticket: run.task.id, inputId: 6, text: otherWord(choice.text), direction: direction === 'left' ? 'right' : 'left' });
    assert.equal(run.task.selection, direction);
    context.advance(run.task.deadline + GRACE_MS - run.now()); run.tick(); run.tick();
    assert.equal(run.turnCount, 1); assert.equal(run.routeTurns.length, 1); assert.equal(run.routeTurns[0].direction, direction);
    assert.equal(run.heading, direction === 'left' ? -Math.PI / 3 : Math.PI / 3); assert.equal(run.accuracy, 100);
  }
  function otherWord(word) { return word === 'sun' ? 'run' : 'sun'; }
});

test('missed forks do not turn; unlimited successful routes bound stored history', () => {
  const context = setup(); begin(context); const { run } = context;
  for (let i = 1; i < 5; i++) clear(context, i);
  context.advance(run.task.duration + GRACE_MS + RECOVERY_MS); run.tick();
  assert.equal(run.heading, 0); assert.equal(run.turnCount, 0); assert.equal(run.task.sequence, 6);
  for (let i = 6; i <= 500; i++) clear(context, i);
  assert.equal(run.turnCount, 99); assert.equal(run.routeTurns.length, 8); assert.equal(run.routeTurns.at(-1).sequence, 500);
  for (let i = 1; i <= 500; i++) {
    const fork = challengeFor('test', i * 5, i % 2 ? 'chinese' : 'english');
    assert.notEqual(fork.choices[0].text[0], fork.choices[1].text[0]);
  }
});

test('server restart during recovery preserves a paused recovery, not a new obstacle or lost life', async () => {
  const db = createDatabase(':memory:'); let time = 1000000;
  try {
    let app = createApp({ db, now: () => time });
    db.prepare('INSERT INTO users(id,username,display_name,password_hash) VALUES(1,?,?,?)').run('recovery', '复活试玩', 'unused');
    db.prepare('INSERT INTO user_sessions VALUES(?,?,?,?)').run(hashSessionToken('recovery'), 1, time, time + 99999999);
    const cookie = 'typing_session=recovery';
    const started = (await request(app).post('/api/runner/start').set('Cookie', cookie).send({})).body;
    time += COUNTDOWN_MS; let state = (await request(app).get('/api/runner').set('Cookie', cookie)).body;
    time = state.task.deadline + GRACE_MS + 800;
    state = (await request(app).get('/api/runner').set('Cookie', cookie)).body;
    time += 100000; app = createApp({ db, now: () => time });
    let restored = (await request(app).get('/api/runner').set('Cookie', cookie)).body;
    assert.equal(restored.phase, 'paused'); assert.equal(restored.pausedPhase, 'recovering'); assert.equal(restored.pausedRecoveryMs, RECOVERY_MS - 800);
    assert.equal(restored.lives, 2); assert.equal(restored.distance, state.distance);
    await request(app).post('/api/runner/resume').set('Cookie', cookie).send({ runId: started.id });
    time += 100; app = createApp({ db, now: () => time });
    restored = (await request(app).get('/api/runner').set('Cookie', cookie)).body;
    assert.equal(restored.pausedPhase, 'recovering'); assert.equal(restored.pausedRecoveryMs, RECOVERY_MS - 800);
    await request(app).post('/api/runner/resume').set('Cookie', cookie).send({ runId: started.id }); time += COUNTDOWN_MS;
    restored = (await request(app).get('/api/runner').set('Cookie', cookie)).body;
    assert.equal(restored.phase, 'recovering'); assert.equal(restored.recovery.until - time, RECOVERY_MS - 800);
  } finally { db.close(); }
});

test('runner APIs protect ownership, persist best scores and training, deduplicate players and restart paused', async () => {
  const db = createDatabase(':memory:'); let time = Date.UTC(2026, 9, 1, 8);
  let app = createApp({ db, now: () => time });
  const cookie = id => `typing_session=runner${id}`;
  try {
    for (let id = 1; id <= 2; id++) {
      db.prepare('INSERT INTO users(id,username,display_name,password_hash) VALUES(?,?,?,?)').run(id, `runner${id}`, `跑者${id}`, 'unused');
      db.prepare('INSERT INTO user_sessions VALUES(?,?,?,?)').run(hashSessionToken(`runner${id}`), id, time, time + 99999999);
    }
    await request(app).post('/api/runner/start').send({}).expect(401);
    await request(app).get('/api/runner/leaderboard').expect(200);
    await request(app).get('/api/runner/leaderboard?language=invalid').expect(400);
    await request(app).post('/api/runner/start').set('Cookie', cookie(1)).send({ language: '__proto__' }).expect(400);
    let started = (await request(app).post('/api/runner/start').set('Cookie', cookie(1)).send({})).body;
    const retry = await request(app).post('/api/runner/start').set('Cookie', cookie(1)).send({});
    assert.equal(retry.body.id, started.id);
    time += COUNTDOWN_MS;
    let state = (await request(app).get('/api/runner').set('Cookie', cookie(1))).body;
    await request(app).post('/api/runner/type').set('Cookie', cookie(2)).send({ runId: state.id, ticket: state.task.id, text: state.task.text, inputId: 1 }).expect(404);
    await request(app).post('/api/runner/type').set('Cookie', cookie(1)).send({ runId: state.id, ticket: state.task.id, text: state.task.text, inputId: 1 }).expect(200);
    time += 1000;
    await request(app).post('/api/runner/finish').set('Cookie', cookie(1)).send({ runId: state.id, score: 99999999, distance: 99999999 }).expect(200);
    await request(app).post('/api/runner/finish').set('Cookie', cookie(1)).send({ runId: state.id }).expect(200);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM training_sessions WHERE mode='runner'").get().count, 1);
    const firstScore = db.prepare('SELECT score FROM runner_runs WHERE id=?').get(state.id).score;
    assert.ok(firstScore < 99999999);
    started = (await request(app).post('/api/runner/start').set('Cookie', cookie(1)).send({})).body;
    time += COUNTDOWN_MS + 300;
    state = (await request(app).get('/api/runner').set('Cookie', cookie(1))).body;
    await request(app).post('/api/runner/type').set('Cookie', cookie(1)).send({ runId: state.id, ticket: state.task.id, text: state.task.text, inputId: 1 });
    time += 2000;
    await request(app).post('/api/runner/finish').set('Cookie', cookie(1)).send({ runId: state.id });
    const ranking = (await request(app).get('/api/runner/leaderboard?period=today').set('Cookie', cookie(1))).body;
    assert.equal(ranking.total, 1); assert.equal(ranking.rows.length, 1); assert.equal(ranking.myBest.rank, 1);
    assert.equal(ranking.rows[0].isCurrentUser, true);
    time += 86400000;
    assert.equal((await request(app).get('/api/runner/leaderboard?period=today')).body.total, 0);
    assert.equal((await request(app).get('/api/runner/leaderboard')).body.total, 1);
    started = (await request(app).post('/api/runner/start').set('Cookie', cookie(1)).send({})).body;
    time += COUNTDOWN_MS + 500;
    state = (await request(app).get('/api/runner').set('Cookie', cookie(1))).body;
    app = createApp({ db, now: () => time + 999999 });
    const restored = (await request(app).get('/api/runner').set('Cookie', cookie(1))).body;
    assert.equal(restored.phase, 'paused'); assert.equal(restored.id, started.id);
    assert.equal(restored.lives, state.lives); assert.equal(restored.distance, state.distance);
    app = createApp({ db, now: () => time + 999999 });
    const resumed = (await request(app).post('/api/runner/resume').set('Cookie', cookie(1)).send({ runId: started.id }).expect(200)).body;
    assert.equal(resumed.phase, 'countdown'); assert.equal(resumed.distance, state.distance);
    assert.equal(resumed.lives, state.lives);
  } finally { db.close(); }
});
