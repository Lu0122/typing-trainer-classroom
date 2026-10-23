const assert = require('node:assert/strict');
const test = require('node:test');
const request = require('supertest');
const {
  CompetitionRoom,
  QUALIFIER_MS,
  BREAK_MS,
  FINAL_MS,
  GATHER_MS
} = require('../backend/competition');
const { createDatabase } = require('../backend/database');
const { createApp } = require('../backend/app');

function user(id) {
  return { id, displayName: `选手${id}` };
}

// 按当前题目提交前 count 个字（累计前缀，符合服务端校验）
function submit(room, id, count) {
  const state = room.state(id);
  return room.type(id, { seat: state.me.seat, ticket: state.me.task.id, text: state.me.task.text.slice(0, count) });
}

test('personal competition runs qualifier, break, and final automatically', () => {
  let now = 1_000_000;
  let saved = null;
  const room = new CompetitionRoom('personal', { now: () => now, save: (result) => { saved = result; } });
  room.config.finalists = 2;

  room.join(user(1));
  room.join(user(2));
  room.join(user(3));
  room.start(1);
  assert.equal(room.state(1).phase, 'qualifier');

  submit(room, 1, 6);
  submit(room, 2, 4);
  submit(room, 3, 2);

  now += QUALIFIER_MS + 1;
  const afterQualifier = room.state(1);
  assert.equal(afterQualifier.phase, 'break');
  const byId = (id) => afterQualifier.players.find((player) => player.id === id);
  assert.equal(byId(1).qualified, true);
  assert.equal(byId(1).qualifiedRank, 1);
  assert.equal(byId(2).qualified, true);
  assert.equal(byId(3).qualified, false);

  now += BREAK_MS + 1;
  const inFinal = room.state(1);
  assert.equal(inFinal.phase, 'final');
  assert.equal(inFinal.me.spectating, false);
  assert.equal(room.state(3).me.spectating, true);

  // 未晋级者不能作答
  const spectator = room.state(3);
  assert.throws(
    () => room.type(3, { seat: spectator.me.seat, ticket: 'x', text: 'a' }),
    /未晋级|观战/
  );

  submit(room, 1, 5);

  now += FINAL_MS + 1;
  const finished = room.state(1);
  assert.equal(finished.phase, 'finished');
  assert.equal(saved.winner.id, 1);
  assert.equal(saved.ranking[0].id, 1);
  assert.equal(saved.qualifier.ranking.length, 3);
  assert.equal(saved.rows.length, 3);
  assert.equal(saved.rows[0].userId, 1);
});

test('team competition stays single round and totals each side', () => {
  let now = 2_000_000;
  let saved = null;
  const room = new CompetitionRoom('team', { now: () => now, save: (result) => { saved = result; } });
  const first = room.join(user(1));
  const second = room.join(user(2));
  const third = room.join(user(3));
  assert.notEqual(first.me.team, second.me.team);
  assert.equal(first.me.team, third.me.team);

  room.start(1);
  submit(room, 1, 4);

  now += QUALIFIER_MS + 1;
  const finished = room.state(1);
  assert.equal(finished.phase, 'finished');
  assert.equal(saved.mode, 'team');
  assert.equal(saved.teams.length, 2);
  assert.ok(saved.teams.some((team) => team.correct === 4));
});

test('flags and voids a round when input rate exceeds the window limit', () => {
  let now = 3_000_000;
  const room = new CompetitionRoom('personal', { now: () => now });
  room.config.rateWindowLimit = 20;
  room.config.suspectLimit = 2;
  room.join(user(1));
  room.join(user(2));
  room.start(1);

  const state = room.state(1);
  const seat = state.me.seat;
  const ticket = state.me.task.id;
  const full = state.me.task.text;

  room.type(1, { seat, ticket, text: full.slice(0, 16) });
  room.type(1, { seat, ticket, text: full.slice(0, 32) });
  assert.equal(room.state(1).me.flagged, true);
  assert.equal(room.state(1).me.disqualified, false);

  room.type(1, { seat, ticket, text: full.slice(0, 48) });
  assert.equal(room.state(1).me.disqualified, true);
  assert.throws(() => room.type(1, { seat, ticket, text: full.slice(0, 52) }), /作废/);
});

test('normal typing speed is never flagged', () => {
  let now = 4_000_000;
  const room = new CompetitionRoom('personal', { now: () => now });
  room.join(user(1));
  room.join(user(2));
  room.start(1);
  const state = room.state(1);
  const full = state.me.task.text;

  // 200 字/分 ≈ 3.3 字/秒，每 3 秒提交 10 个字
  for (let count = 10; count <= 60; count += 10) {
    now += 3_000;
    room.type(1, { seat: state.me.seat, ticket: state.me.task.id, text: full.slice(0, count) });
  }
  assert.equal(room.state(1).me.flagged, false);
  assert.equal(room.state(1).me.disqualified, false);
  assert.equal(room.state(1).me.correct, 60);
});

test('board state never exposes seat tokens', () => {
  const room = new CompetitionRoom('personal');
  room.join(user(1));
  room.join(user(2));
  const board = room.boardState();
  assert.equal(board.total, 2);
  assert.equal(board.top.length, 2);
  assert.ok(!JSON.stringify(board).includes('"seat"'));
});

test('waits in gathering phase until the countdown ends', () => {
  let now = 5_000_000;
  const room = new CompetitionRoom('personal', { now: () => now });
  room.join(user(1));
  const waiting = room.state(1);
  assert.equal(waiting.phase, 'waiting');
  assert.equal(waiting.startsAt, now + GATHER_MS);

  now += GATHER_MS + 1;
  assert.equal(room.state(1).phase, 'qualifier');
});

test('exports the latest settled result as CSV with BOM and header', async () => {
  let currentTime = 1_700_000_000_000;
  const db = createDatabase(':memory:');
  const app = createApp({ db, adminPassword: 'test-pass', now: () => currentTime, requireAccountApproval: false });
  const advance = (milliseconds) => { currentTime += milliseconds; };

  const first = request.agent(app);
  await first.post('/api/auth/register').send({ username: 'student901', displayName: '甲选手', password: 'Classroom123' }).expect(201);
  const second = request.agent(app);
  await second.post('/api/auth/register').send({ username: 'student902', displayName: '乙选手', password: 'Classroom123' }).expect(201);

  await first.post('/api/competition/personal/join').expect(200);
  await second.post('/api/competition/personal/join').expect(200);
  await first.post('/api/competition/personal/start').expect(200);

  const state = (await first.get('/api/competition/personal')).body;
  await first.post('/api/competition/personal/type').send({
    seat: state.me.seat,
    ticket: state.me.task.id,
    text: state.me.task.text.slice(0, 5)
  }).expect(200);

  advance(QUALIFIER_MS + 1);
  await first.get('/api/competition/personal').expect(200);
  advance(BREAK_MS + 1);
  await first.get('/api/competition/personal').expect(200);
  advance(FINAL_MS + 1);
  const finished = (await first.get('/api/competition/personal')).body;
  assert.equal(finished.phase, 'finished');

  const csv = await first.get('/api/competition/personal/export.csv').expect(200);
  assert.match(csv.headers['content-type'], /text\/csv/);
  assert.match(csv.headers['content-disposition'], /attachment; filename="competition-personal-/);
  assert.ok(csv.text.startsWith('\uFEFF'), 'CSV 需要 BOM，否则 Excel 打开中文乱码');
  assert.match(csv.text, /排名,姓名,账号,初赛正确字数/);
  assert.match(csv.text, /甲选手/);
  assert.match(csv.text, /乙选手/);
  assert.match(csv.text, /student901/);
  db.close();
});

test('export returns 404 before any competition is settled', async () => {
  const db = createDatabase(':memory:');
  const app = createApp({ db, adminPassword: 'test-pass', requireAccountApproval: false });
  const agent = request.agent(app);
  await agent.post('/api/auth/register').send({ username: 'student903', displayName: '丙选手', password: 'Classroom123' }).expect(201);
  const response = await agent.get('/api/competition/personal/export.csv').expect(404);
  assert.match(response.body.message, /暂无已结算/);
  db.close();
});
