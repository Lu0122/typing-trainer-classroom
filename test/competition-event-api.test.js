const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createDatabase } = require('../backend/database');
const { createApp } = require('../backend/app');

function setup() {
  const db = createDatabase(':memory:');
  const app = createApp({ db, adminPassword: 'test-pass', requireAccountApproval: false });
  return { app, db };
}

async function register(app, username, displayName) {
  const agent = request.agent(app);
  await agent.post('/api/auth/register').send({ username, displayName, password: 'Classroom123' }).expect(201);
  return agent;
}

test('runs a persisted 1v1 event through the new API and hides other seat tokens', async () => {
  const { app, db } = setup();
  const admin = request.agent(app);
  await admin.post('/api/admin/login').send({ password: 'test-pass' }).expect(200);

  const created = await admin.post('/api/competitions').send({
    name: 'API 1v1 测试',
    mode: 'duel',
    config: { roundMs: 60_000, maxBatch: 200 }
  }).expect(200);
  await admin.post(`/api/competitions/${created.body.id}/registration`).expect(200);

  const first = await register(app, 'student901', '甲选手');
  const second = await register(app, 'student902', '乙选手');
  const available = await first.get('/api/competitions/available').expect(200);
  assert.equal(available.body[0].id, created.body.id);
  assert.equal(available.body[0].config, undefined);
  await first.post(`/api/competitions/${created.body.id}/join`).expect(200);
  await second.post(`/api/competitions/${created.body.id}/join`).expect(200);
  await admin.post(`/api/competitions/${created.body.id}/start`).expect(200);

  const running = await first.get(`/api/competitions/${created.body.id}`).expect(200);
  assert.equal(running.body.mode, 'duel');
  assert.equal(running.body.players.length, 2);
  assert.ok(running.body.me.seat);
  assert.equal(running.body.players.find((player) => player.userId !== running.body.me.userId).seat, undefined);
  const board = await request(app).get(`/api/competitions/${created.body.id}/board`).expect(200);
  assert.equal(board.body.me, null);
  assert.equal(board.body.players.some((player) => Object.prototype.hasOwnProperty.call(player, 'seat')), false);
  const paused = await admin.post(`/api/competitions/${created.body.id}/pause`).expect(200);
  assert.equal(paused.body.status, 'paused');
  assert.equal(paused.body.round.status, 'paused');
  await first.post(`/api/competitions/${created.body.id}/submit`)
    .send({ seat: running.body.me.seat, text: running.body.round.text.slice(0, 1) }).expect(400);
  await admin.post(`/api/competitions/${created.body.id}/resume`).expect(200);

  await first.post(`/api/competitions/${created.body.id}/submit`)
    .send({ seat: running.body.me.seat, text: running.body.round.text }).expect(200);
  const secondState = await second.get(`/api/competitions/${created.body.id}`).expect(200);
  await second.post(`/api/competitions/${created.body.id}/submit`)
    .send({ seat: secondState.body.me.seat, text: secondState.body.round.text }).expect(200);

  const finished = await first.get(`/api/competitions/${created.body.id}`).expect(200);
  assert.equal(finished.body.status, 'finished');
  assert.equal(finished.body.players.filter((player) => player.finalRank).length, 2);
  assert.ok(finished.body.events.some((event) => event.action === 'round_settled'));
  const csv = await admin.get(`/api/competitions/${created.body.id}/export.csv`).expect(200);
  assert.match(csv.headers['content-type'], /text\/csv/);
  assert.match(csv.text, /最终名次,姓名,参赛方/);
  assert.match(csv.text, /甲选手/);
  db.close();
});

test('English speed competition uses a shared countdown and fixed-time ranking', async () => {
  let currentTime = 1_700_000_000_000;
  const db = createDatabase(':memory:');
  const app = createApp({ db, adminPassword: 'test-pass', now: () => currentTime, requireAccountApproval: false });
  const admin = request.agent(app);
  await admin.post('/api/admin/login').send({ password: 'test-pass' }).expect(200);
  const created = await admin.post('/api/competitions').send({
    name: 'English speed', mode: 'speed', config: { language: 'en', roundMs: 30_000, maxBatch: 1000 }
  }).expect(200);
  await admin.post(`/api/competitions/${created.body.id}/registration`).expect(200);
  const first = await register(app, 'speed901', '英语甲');
  const second = await register(app, 'speed902', '英语乙');
  await first.post(`/api/competitions/${created.body.id}/join`).expect(200);
  await second.post(`/api/competitions/${created.body.id}/join`).expect(200);
  const countdown = await admin.post(`/api/competitions/${created.body.id}/start`).expect(200);
  assert.equal(countdown.body.round.status, 'countdown');
  assert.equal(countdown.body.config.countdownMs, 5_000);
  const studentCountdown = await first.get(`/api/competitions/${created.body.id}`).expect(200);
  assert.equal(studentCountdown.body.round.text, null);
  await first.post(`/api/competitions/${created.body.id}/submit`).send({ seat: studentCountdown.body.me.seat, text: 'A' }).expect(409);
  currentTime += 5_000;
  const running = await first.get(`/api/competitions/${created.body.id}`).expect(200);
  assert.equal(running.body.round.status, 'running');
  assert.match(running.body.round.text, /A good typing habit/);
  const submitted = await first.post(`/api/competitions/${created.body.id}/submit`)
    .send({ seat: running.body.me.seat, text: running.body.round.text.slice(0, 30) }).expect(200);
  assert.equal(submitted.body.me.userId, running.body.me.userId, '提交响应必须保留当前选手，避免输入框被卸载');
  assert.equal(submitted.body.me.typed, running.body.round.text.slice(0, 30));
  const repeated = await first.post(`/api/competitions/${created.body.id}/submit`)
    .send({ seat: running.body.me.seat, text: submitted.body.me.typed }).expect(200);
  assert.equal(repeated.body.me.seat, running.body.me.seat);
  currentTime += 30_001;
  const finished = await second.get(`/api/competitions/${created.body.id}`).expect(200);
  assert.equal(finished.body.status, 'finished');
  assert.equal(finished.body.ranking[0].correct, 30);
  assert.equal(finished.body.ranking[0].speed, 60);
  assert.equal(finished.body.ranking[0].timeMs, 30_000);
  const savedResult = await first.get('/api/competitions/available').expect(200);
  assert.equal(savedResult.body[0].id, created.body.id, '参赛者刷新页面后还能查看最终成绩');
  db.close();
});

test('speed competition accepts the final characters and keeps the round until the fixed deadline', async () => {
  let currentTime = 1_700_100_000_000;
  const db = createDatabase(':memory:');
  const app = createApp({ db, adminPassword: 'test-pass', now: () => currentTime, requireAccountApproval: false });
  const admin = request.agent(app);
  await admin.post('/api/admin/login').send({ password: 'test-pass' }).expect(200);
  const created = await admin.post('/api/competitions').send({
    name: '完成全文测试', mode: 'speed', config: { language: 'zh', roundMs: 30_000, maxBatch: 1000 }
  }).expect(200);
  await admin.post(`/api/competitions/${created.body.id}/registration`).expect(200);
  const student = await register(app, 'speedfinal901', '全文选手');
  const other = await register(app, 'speedfinal902', '旁观选手');
  await student.post(`/api/competitions/${created.body.id}/join`).expect(200);
  await other.post(`/api/competitions/${created.body.id}/join`).expect(200);
  await admin.post(`/api/competitions/${created.body.id}/start`).expect(200);
  currentTime += 5_000;
  const running = await student.get(`/api/competitions/${created.body.id}`).expect(200);
  const fullText = running.body.round.text;
  const finishedInput = await student.post(`/api/competitions/${created.body.id}/submit`)
    .send({ seat: running.body.me.seat, text: fullText }).expect(200);
  assert.equal(finishedInput.body.me.typed, fullText);
  assert.equal(finishedInput.body.me.finished, true);
  assert.equal(finishedInput.body.status, 'running', '个人赛打完全文后仍等统一时限结束');
  assert.equal(finishedInput.body.round.status, 'running');
  currentTime += 30_001;
  const settled = await student.get(`/api/competitions/${created.body.id}`).expect(200);
  assert.equal(settled.body.status, 'finished');
  assert.equal(settled.body.ranking[0].correct, fullText.length);
  db.close();
});

test('speed competition allows Backspace corrections after a full low-accuracy draft', async () => {
  let currentTime = 1_700_200_000_000;
  const db = createDatabase(':memory:');
  const app = createApp({ db, adminPassword: 'test-pass', now: () => currentTime, requireAccountApproval: false });
  const admin = request.agent(app);
  await admin.post('/api/admin/login').send({ password: 'test-pass' }).expect(200);
  const created = await admin.post('/api/competitions').send({
    name: '低准确率完成测试', mode: 'speed', config: { language: 'zh', roundMs: 30_000, maxBatch: 1000 }
  }).expect(200);
  await admin.post(`/api/competitions/${created.body.id}/registration`).expect(200);
  const first = await register(app, 'speedlow901', '低准确率甲');
  const second = await register(app, 'speedlow902', '低准确率乙');
  await first.post(`/api/competitions/${created.body.id}/join`).expect(200);
  await second.post(`/api/competitions/${created.body.id}/join`).expect(200);
  await admin.post(`/api/competitions/${created.body.id}/start`).expect(200);
  currentTime += 5_000;
  const running = await first.get(`/api/competitions/${created.body.id}`).expect(200);
  const text = running.body.round.text;
  const errors = 40;
  const corrupt = `${'错'.repeat(errors)}${text.slice(errors)}`;
  const submitted = await first.post(`/api/competitions/${created.body.id}/submit`)
    .send({ seat: running.body.me.seat, text: corrupt }).expect(200);
  assert.equal(submitted.body.me.finished, false);
  assert.equal(submitted.body.me.correct, text.length - errors);
  assert.equal(submitted.body.me.accuracy, Math.round((text.length - errors) / text.length * 100));
  assert.equal(submitted.body.status, 'running');
  const corrected = await first.post(`/api/competitions/${created.body.id}/submit`)
    .send({ seat: running.body.me.seat, text }).expect(200);
  assert.equal(corrected.body.me.finished, true);
  assert.equal(corrected.body.me.correct, text.length);
  currentTime += 30_001;
  const settled = await first.get(`/api/competitions/${created.body.id}`).expect(200);
  assert.equal(settled.body.status, 'finished');
  assert.equal(settled.body.ranking[0].correct, text.length);
  assert.equal(settled.body.ranking[0].accuracy, 100);
  db.close();
});

test('runs a multi-player match with fixed sides and teacher result confirmation', async () => {
  const { app, db } = setup();
  const admin = request.agent(app);
  await admin.post('/api/admin/login').send({ password: 'test-pass' }).expect(200);
  const created = await admin.post('/api/competitions').send({
    name: 'API 多 v 多测试',
    mode: 'team',
    config: { teamSize: 2, capacity: 4, roundMs: 60_000, maxBatch: 1000 },
    sides: [{ name: '一班', color: '#e05b5b' }, { name: '二班', color: '#4a8fe0' }]
  }).expect(200);
  await admin.post(`/api/competitions/${created.body.id}/registration`).expect(200);

  const agents = await Promise.all([
    register(app, 'student911', '甲一'), register(app, 'student912', '甲二'),
    register(app, 'student913', '乙一'), register(app, 'student914', '乙二')
  ]);
  const registration = await agents[0].get(`/api/competitions/${created.body.id}`).expect(200);
  assert.equal(registration.body.sides.length, 2);
  const [sideA, sideB] = registration.body.sides;
  await agents[0].post(`/api/competitions/${created.body.id}/join`).send({ sideId: sideA.id }).expect(200);
  await agents[1].post(`/api/competitions/${created.body.id}/join`).send({ sideId: sideA.id }).expect(200);
  await agents[2].post(`/api/competitions/${created.body.id}/join`).send({ sideId: sideB.id }).expect(200);
  await agents[3].post(`/api/competitions/${created.body.id}/join`).send({ sideId: sideB.id }).expect(200);
  await admin.post(`/api/competitions/${created.body.id}/start`).expect(200);

  for (const agent of agents) {
    const current = await agent.get(`/api/competitions/${created.body.id}`).expect(200);
    await agent.post(`/api/competitions/${created.body.id}/submit`)
      .send({ seat: current.body.me.seat, text: current.body.round.text }).expect(200);
  }
  const settled = await agents[0].get(`/api/competitions/${created.body.id}`).expect(200);
  assert.equal(settled.body.status, 'finished');
  assert.equal(settled.body.sides.reduce((sum, side) => sum + side.members, 0), 4);
  assert.equal(settled.body.match.status, 'settled');
  assert.ok([sideA.id, sideB.id, null].includes(settled.body.match.winnerSideId));

  const selectedWinner = settled.body.match.winnerSideId === sideA.id ? sideB.id : sideA.id;
  const decided = await admin.post(`/api/competitions/${created.body.id}/result`)
    .send({ winnerSideId: selectedWinner, reason: '现场裁定：复核后确认' }).expect(200);
  assert.equal(decided.body.match.winnerSideId, selectedWinner);
  assert.equal(decided.body.match.decisionSource, 'teacher');
  assert.equal(decided.body.sides.find((side) => side.id === selectedWinner).score, 1);
  db.close();
});

test('runs a three-side round-robin across all scheduled rounds', async () => {
  const { app, db } = setup();
  const admin = request.agent(app);
  await admin.post('/api/admin/login').send({ password: 'test-pass' }).expect(200);
  const created = await admin.post('/api/competitions').send({
    name: 'API 循环赛测试', mode: 'team',
    config: { series: 'league', teamSize: 1, capacity: 3, roundMs: 60_000, maxBatch: 1000 },
    sides: [{ name: '甲班' }, { name: '乙班' }, { name: '丙班' }]
  }).expect(200);
  await admin.post(`/api/competitions/${created.body.id}/registration`).expect(200);
  const agents = await Promise.all([
    register(app, 'student921', '甲选手'), register(app, 'student922', '乙选手'), register(app, 'student923', '丙选手')
  ]);
  const registration = await agents[0].get(`/api/competitions/${created.body.id}`).expect(200);
  for (let index = 0; index < agents.length; index += 1) {
    await agents[index].post(`/api/competitions/${created.body.id}/join`).send({ sideId: registration.body.sides[index].id }).expect(200);
  }

  const playRound = async () => {
    const before = await agents[0].get(`/api/competitions/${created.body.id}`).expect(200);
    const playingSides = new Set(before.body.matches.flatMap((match) => [match.sideAId, match.sideBId]));
    for (const agent of agents) {
      const current = await agent.get(`/api/competitions/${created.body.id}`).expect(200);
      if (!playingSides.has(current.body.me.sideId)) continue;
      await agent.post(`/api/competitions/${created.body.id}/submit`)
        .send({ seat: current.body.me.seat, text: current.body.round.text }).expect(200);
    }
    return agents[0].get(`/api/competitions/${created.body.id}`).then((response) => response.body);
  };

  await admin.post(`/api/competitions/${created.body.id}/start`).expect(200);
  let settled = await playRound();
  assert.equal(settled.round.no, 1);
  assert.equal(settled.round.status, 'settled');
  assert.equal(settled.status, 'running');
  assert.equal(settled.matches.length, 1, '3 方每轮有 1 场比赛，另 1 方轮空');

  await admin.post(`/api/competitions/${created.body.id}/start`).expect(200);
  settled = await playRound();
  assert.equal(settled.round.no, 2);
  assert.equal(settled.status, 'running');

  await admin.post(`/api/competitions/${created.body.id}/start`).expect(200);
  settled = await playRound();
  assert.equal(settled.round.no, 3);
  assert.equal(settled.status, 'finished');
  assert.equal(settled.sides.reduce((sum, side) => sum + side.score, 0), 3);
  db.close();
});

test('persists a scheduled cross-day round and freezes it while paused', async () => {
  const { app, db } = setup();
  const admin = request.agent(app);
  await admin.post('/api/admin/login').send({ password: 'test-pass' }).expect(200);
  const created = await admin.post('/api/competitions').send({
    name: 'API 跨天测试', mode: 'duel', schedule: 'multi_day',
    config: { roundMs: 60_000, maxBatch: 1000 }
  }).expect(200);
  await admin.post(`/api/competitions/${created.body.id}/registration`).expect(200);
  const first = await register(app, 'student931', '跨天甲');
  const second = await register(app, 'student932', '跨天乙');
  await first.post(`/api/competitions/${created.body.id}/join`).expect(200);
  await second.post(`/api/competitions/${created.body.id}/join`).expect(200);
  await admin.post(`/api/competitions/${created.body.id}/start`).send({ plannedAt: Date.now() + 60_000 }).expect(200);
  const scheduled = await first.get(`/api/competitions/${created.body.id}`).expect(200);
  assert.equal(scheduled.body.status, 'paused');
  assert.equal(scheduled.body.round.status, 'scheduled');
  assert.ok(scheduled.body.round.plannedAt);
  await admin.post(`/api/competitions/${created.body.id}/resume`).expect(200);
  const running = await first.get(`/api/competitions/${created.body.id}`).expect(200);
  assert.equal(running.body.status, 'running');
  assert.equal(running.body.round.status, 'running');
  await first.post(`/api/competitions/${created.body.id}/submit`).send({ seat: running.body.me.seat, text: running.body.round.text }).expect(200);
  const secondState = await second.get(`/api/competitions/${created.body.id}`).expect(200);
  await second.post(`/api/competitions/${created.body.id}/submit`).send({ seat: secondState.body.me.seat, text: secondState.body.round.text }).expect(200);
  const finished = await first.get(`/api/competitions/${created.body.id}`).expect(200);
  assert.equal(finished.body.status, 'finished');
  db.close();
});

test('serves the passage catalog for the admin text picker', async () => {
  const { app, db } = setup();
  const admin = request.agent(app);
  await admin.post('/api/admin/login').send({ password: 'test-pass' }).expect(200);
  const catalog = await admin.get('/api/competitions/text-catalog').expect(200);
  const rows = catalog.body.rows;
  assert.ok(rows.length > 0, '候选项来自「练习文章」表');
  assert.ok(rows.every((row) => row.id && row.title && row.category && row.length > 0));
  assert.equal(rows.some((row) => 'content' in row), false, '列表不返回全文');
  assert.ok(rows.some((row) => row.language === 'zh'));
  assert.ok(rows.some((row) => row.language === 'en'));
  assert.equal(rows.some((row) => row.language === 'pinyin'), false, '拼音文章不进候选');
  await request(app).get('/api/competitions/text-catalog').expect(401);
  db.close();
});

test('paginates the admin competition list', async () => {
  const { app, db } = setup();
  const admin = request.agent(app);
  await admin.post('/api/admin/login').send({ password: 'test-pass' }).expect(200);
  for (let index = 0; index < 25; index += 1) {
    await admin.post('/api/competitions').send({ name: `赛事${index}`, mode: 'duel', config: { roundMs: 60_000 } }).expect(200);
  }
  const first = await admin.get('/api/competitions?pageSize=10').expect(200);
  assert.equal(first.body.total, 25);
  assert.equal(first.body.pages, 3);
  assert.equal(first.body.rows.length, 10);
  const second = await admin.get('/api/competitions?page=2&pageSize=10').expect(200);
  assert.equal(second.body.page, 2);
  assert.equal(second.body.rows.length, 10);
  assert.notEqual(second.body.rows[0].id, first.body.rows[0].id, '第二页不重复第一页');
  db.close();
});

test('filters the admin competition list by status, language and keyword', async () => {
  const { app, db } = setup();
  const admin = request.agent(app);
  await admin.post('/api/admin/login').send({ password: 'test-pass' }).expect(200);
  await admin.post('/api/competitions').send({ name: '中文初赛', mode: 'speed', config: { language: 'zh', roundMs: 60_000 } }).expect(200);
  await admin.post('/api/competitions').send({ name: '英文初赛', mode: 'speed', config: { language: 'en', roundMs: 60_000 } }).expect(200);
  const finished = await admin.post('/api/competitions').send({ name: '中文决赛', mode: 'speed', config: { language: 'zh', roundMs: 60_000 } }).expect(200);
  await admin.post(`/api/competitions/${finished.body.id}/registration`).expect(200);

  assert.equal((await admin.get('/api/competitions?status=registration').expect(200)).body.total, 1);
  assert.equal((await admin.get('/api/competitions?language=en').expect(200)).body.total, 1);
  assert.equal((await admin.get('/api/competitions?q=初赛').expect(200)).body.total, 2);
  assert.equal((await admin.get('/api/competitions?language=zh&q=决赛').expect(200)).body.total, 1);
  db.close();
});
