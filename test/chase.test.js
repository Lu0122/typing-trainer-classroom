const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createDatabase } = require('../backend/database');
const { createApp } = require('../backend/app');
const { hashSessionToken } = require('../backend/auth');
const { ChaseRoom, ROUND_MS, START_COUNTDOWN_MS, THIEF_HEADSTART, STEP_METERS } = require('../backend/chase');

function setup() {
  let time = 1_000_000;
  const room = new ChaseRoom({ code: '5101', now: () => time });
  return { room, advance: ms => { time += ms; }, now: () => time };
}
function begin(room, advance) {
  room.create({ id: 'p1', displayName: '警察' }, 'police');
  room.join({ id: 't1', displayName: '小偷' });
  room.start('p1', room.players.get('p1').seat);
  advance(START_COUNTDOWN_MS + 10);
  room.state('p1');
  room.state('t1');
  return { police: room.players.get('p1'), thief: room.players.get('t1') };
}
// 逐字提交（每次 200ms），既绕过输入速率限制，也保持在线心跳。
function typeCharacters(room, advance, id, count) {
  for (let i = 0; i < count; i++) {
    const player = room.players.get(id);
    if (!player?.task || player.task.typed.length >= player.task.text.length) break;
    advance(200);
    room.type(id, { seat: player.seat, ticket: player.task.id, text: player.task.text.slice(0, player.task.typed.length + 1) });
  }
}
const pollAll = (room, advance, ms, ids = ['p1', 't1']) => { advance(ms); ids.forEach(id => room.state(id)); };

test('开局警察在起点，小偷的领先距离保持在 20 米以内', () => {
  const { room, advance } = setup();
  begin(room, advance);
  const state = room.state('p1');
  const police = state.players.find(player => player.role === 'police');
  const thief = state.players.find(player => player.role === 'thief');
  assert.equal(police.position, 0);
  assert.equal(thief.position, THIEF_HEADSTART);
  assert.ok(THIEF_HEADSTART > 0 && THIEF_HEADSTART <= 20, `小偷领先 ${THIEF_HEADSTART} 米，应在 20 米以内`);
  assert.equal(state.thiefHeadstart, THIEF_HEADSTART);
});

test('正确字符推进距离，错误字符只记失误不推进', () => {
  const { room, advance } = setup();
  const { police } = begin(room, advance);
  advance(1000);
  room.type('p1', { seat: police.seat, ticket: police.task.id, text: police.task.text.slice(0, 3) });
  assert.equal(room.position(police), 3 * STEP_METERS.police);
  const wrong = police.task.text[3] === 'x' ? 'y' : 'x';
  room.type('p1', { seat: police.seat, ticket: police.task.id, text: police.task.text.slice(0, 3) + wrong });
  assert.equal(room.position(police), 3 * STEP_METERS.police);
  assert.equal(police.wrong, 1);
});

test('输入完整段落自动换到下一段，不再需要回车', () => {
  const { room, advance } = setup();
  const { thief } = begin(room, advance);
  const firstTicket = thief.task.id;
  const text = thief.task.text;
  for (let i = 1; i <= text.length; i++) {
    advance(200);
    room.type('t1', { seat: thief.seat, ticket: thief.task.id, text: text.slice(0, i) });
  }
  assert.equal(thief.task.sequence, 2);
  assert.notEqual(thief.task.id, firstTicket);
  assert.equal(thief.task.typed, '');
  assert.equal(room.state('t1').me.task.sequence, 2);
});

test('警察位置追平小偷即判定警察获胜', () => {
  const { room, advance } = setup();
  const { police, thief } = begin(room, advance);
  let typed = 0;
  while (room.phase === 'running' && typed < 260) {
    const before = room.position(police);
    typeCharacters(room, advance, 'p1', 1);
    if (room.position(police) === before) break; // 段落切换的提交不推进
    typed++;
  }
  assert.equal(thief.correct, 0);
  assert.equal(room.phase, 'finished');
  assert.equal(room.result.outcome, 'caught');
  assert.equal(room.result.winnerRole, 'police');
  assert.ok(room.position(police) >= room.position(thief));
});

test('两分钟结束而警察仍在后面时判定小偷逃脱', () => {
  const { room, advance } = setup();
  const { police, thief } = begin(room, advance);
  assert.equal(thief.correct, 0);
  for (let i = 0; i < 8; i++) pollAll(room, advance, 15_000);
  const state = room.state('p1');
  assert.equal(state.phase, 'finished');
  assert.equal(state.result.outcome, 'escaped');
  assert.equal(state.result.winnerRole, 'thief');
  assert.ok(room.position(police) < room.position(thief));
  assert.equal(state.result.left, undefined);
});

test('看着页面轮询的玩家不会被判离线', () => {
  const { room, advance } = setup();
  begin(room, advance);
  for (let i = 0; i < 4; i++) pollAll(room, advance, 20_000); // 一路不输入，只轮询
  const state = room.state('p1');
  assert.equal(state.players.length, 2);
  assert.equal(state.phase, 'running');
});

test('对手断线时才由剩余一方获胜，并标记为非追逐判定', () => {
  const { room, advance } = setup();
  begin(room, advance);
  advance(26_000); // 小偷不再轮询、也不再输入
  const state = room.state('p1');
  assert.equal(state.phase, 'finished');
  assert.equal(state.result.outcome, 'caught');
  assert.equal(state.result.winnerRole, 'police');
  assert.equal(state.result.left, true);
});

test('人机：电脑与玩家每字推进距离保持同一量级', () => {
  for (const role of ['police', 'thief']) {
    const { room, advance } = setup();
    room.create({ id: 'u1', displayName: '玩家' }, role);
    room.addBot({ id: 'u1', displayName: '玩家' }, role);
    advance(START_COUNTDOWN_MS + 10);
    room.state('u1');
    typeCharacters(room, advance, 'u1', 100);
    const bot = room.players.get('cpu');
    const perCharacter = bot.distance / 100;
    assert.ok(perCharacter > 0.8 && perCharacter < 1.4, `电脑每字推进 ${perCharacter.toFixed(2)} 米`);
    assert.equal(room.phase, 'running');
  }
});

test('人机：玩家停手时电脑也停住，不会被偷袭', () => {
  const { room, advance } = setup();
  room.create({ id: 'u1', displayName: '玩家' }, 'police');
  room.addBot({ id: 'u1', displayName: '玩家' }, 'police');
  advance(START_COUNTDOWN_MS + 10);
  room.state('u1');
  typeCharacters(room, advance, 'u1', 20);
  const bot = room.players.get('cpu');
  const stopped = room.position(bot);
  for (let i = 0; i < 6; i++) { advance(5_000); room.state('u1'); }
  assert.equal(room.position(bot), stopped);
  assert.equal(room.phase, 'running');
  assert.equal(ROUND_MS, 120_000);
});

test('追逐赛不能用换段接口跳过未完成的文字', () => {
  const { room, advance } = setup();
  const { police } = begin(room, advance);
  const ticket = police.task.id;
  assert.throws(() => room.next(police.id, { seat: police.seat, ticket }), /完整段落/);
  assert.equal(police.task.id, ticket);
  assert.equal(police.sequence, 1);
});

test('追逐接口保留新房间身份，并在加入满员房失败时保留原房间', async () => {
  const db = createDatabase(':memory:');
  const time = 1_000_000;
  const app = createApp({ db, now: () => time });
  try {
    for (let id = 1; id <= 3; id++) {
      db.prepare('INSERT INTO users(id,username,display_name,password_hash,is_active) VALUES(?,?,?,?,1)').run(id, `chase${id}`, `追逐同学${id}`, 'unused');
      db.prepare('INSERT INTO user_sessions VALUES(?,?,?,?)').run(hashSessionToken(`chase${id}`), id, time, time + 999999);
    }
    const cookie = id => `typing_session=chase${id}`;
    const old = await request(app).post('/api/chase/create').set('Cookie', cookie(1)).send({}).expect(200);
    const current = await request(app).post('/api/chase/create').set('Cookie', cookie(1)).send({}).expect(200);
    await request(app).post('/api/chase/leave').set('Cookie', cookie(1)).send({ seat: old.body.me.seat }).expect(200);
    const afterOldLeave = await request(app).get('/api/chase').set('Cookie', cookie(1)).expect(200);
    assert.equal(afterOldLeave.body.code, current.body.code);
    assert.equal(afterOldLeave.body.me.seat, current.body.me.seat);

    const target = await request(app).post('/api/chase/create').set('Cookie', cookie(2)).send({}).expect(200);
    await request(app).post('/api/chase/join-code').set('Cookie', cookie(3)).send({ code: target.body.code }).expect(200);
    await request(app).post('/api/chase/join-code').set('Cookie', cookie(1)).send({ code: target.body.code }).expect(409);
    const afterFailedJoin = await request(app).get('/api/chase').set('Cookie', cookie(1)).expect(200);
    assert.equal(afterFailedJoin.body.code, current.body.code);
    assert.equal(afterFailedJoin.body.me.seat, current.body.me.seat);
  } finally { db.close(); }
});
