const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { BossRoom, ROUND_MS, GATHER_MS, RESULT_MS, LESSONS, TEAM_COMBO_GRACE_MS } = require('../src/boss');
const { createDatabase } = require('../src/database');
const { createApp } = require('../src/app');
const { hashSessionToken } = require('../src/auth');
function setup() {
  let time = 100000;
  const saved = [], records = [];
  const room = new BossRoom({ now: () => time, save: result => saved.push(result), record: value => records.push(value) });
  const join = id => room.join({ id, displayName: `同学${id}` });
  return { room, saved, records, join, advance: milliseconds => { time += milliseconds; } };
}
function send(room, id, text) {
  const me = room.state(id).me;
  return room.type(id, { seat: me.seat, ticket: me.task.id, text });
}

test('boss gathers the classroom then locks shared health and identical independent task order', () => {
  const { room, join, advance } = setup();
  join(1); join(2); assert.equal(room.phase, 'waiting');
  advance(GATHER_MS); const one = room.state(1); const two = room.state(2);
  assert.equal(one.phase, 'running'); assert.equal(one.maxHp, 3600);
  assert.equal(one.me.task.text, two.me.task.text); assert.notEqual(one.me.task.id, two.me.task.id);
  join(3); assert.equal(room.maxHp, 3600); assert.equal(room.hp, 3600);
  assert.throws(() => room.type(1, { seat: one.me.seat, ticket: two.me.task.id, text: '一' }), /段落已更新/);
});
test('only correct positions deal damage; errors break own combo and duplicates are idempotent', () => {
  const { room, join, advance } = setup(); join(1); join(2); room.start(1);
  advance(2000); const me = room.state(1).me, text = me.task.text.slice(0, 10);
  const payload = { seat: me.seat, ticket: me.task.id, text };
  const hit = room.type(1, payload); assert.equal(hit.me.damage, 105); assert.equal(hit.me.combo, 10);
  assert.equal(room.type(1, payload).hp, hit.hp);
  const wrong = room.type(1, { ...payload, text: text + 'x' });
  assert.equal(wrong.hp, hit.hp); assert.equal(wrong.me.combo, 0); assert.equal(wrong.me.attempted, 11);
  const rightAfterError = room.type(1, { ...payload, text: text + 'x' + me.task.text[11] });
  assert.equal(rightAfterError.me.correct, 11); assert.equal(rightAfterError.me.damage, 115);
  assert.equal(room.state(2).me.combo, 0);
  assert.throws(() => room.type(1, { ...payload, text: text + me.task.text[10] }), /按顺序/);
});
test('full line with errors can advance without damage, continues past the text bank, and keeps slow player progress', () => {
  const { room, join, advance } = setup(); join(1); join(2); room.start(1);
  const slow = room.state(2).me.task;
  for (let n = 0; n <= LESSONS.length; n++) {
    let me = room.state(1).me;
    assert.equal(me.task.sequence, n + 1);
    if (n === LESSONS.length) assert.equal(me.task.text, slow.text);
    const wrongText = 'x'.repeat(me.task.text.length);
    while (me.task.typed.length < wrongText.length) {
      advance(1000); room.state(2);
      me = send(room, 1, wrongText.slice(0, me.task.typed.length + 16)).me;
    }
    const hp = room.hp, payload = { seat: me.seat, ticket: me.task.id };
    room.next(1, payload); room.next(1, payload);
    assert.equal(room.hp, hp); assert.equal(room.state(1).me.sequence, n + 2);
  }
  assert.equal(room.state(2).me.task.id, slow.id);
});
test('boss rejects missing membership, early next, forged packets and start by non-captain', () => {
  const { room, join } = setup(); const first = join(1); join(2);
  assert.throws(() => room.start(2), /只有队长/); room.start(1);
  const me = room.state(1).me;
  assert.throws(() => room.type(3, { seat: first.me.seat }), /重新加入/);
  assert.throws(() => room.next(1, { seat: me.seat, ticket: me.task.id }), /完成当前段落/);
  assert.throws(() => room.type(1, { seat: me.seat, ticket: me.task.id, text: me.task.text }), /按顺序/);
  assert.throws(() => room.type(1, { seat: me.seat, ticket: me.task.id, text: {} }), /按顺序/);
});
test('exit and rejoin resets only the student and old leave requests cannot remove a new seat', () => {
  const { room, join, records } = setup(); join(1); join(2); room.start(1);
  const first = send(room, 1, LESSONS[0].slice(0, 2)).me, hp = room.hp;
  room.leave(1, first.seat); const again = join(1).me;
  assert.notEqual(first.seat, again.seat); assert.equal(again.correct, 0); assert.equal(again.sequence, 1);
  room.leave(1, first.seat); assert.ok(room.state(1).me); assert.equal(room.hp, hp);
  assert.equal(records.at(-1).finalized, true); assert.equal(room.state(2).phase, 'running');
});
test('offline members disappear and captain changes; empty running room is settled', () => {
  const { room, join, advance } = setup(); join(1); join(2); room.start(1);
  advance(15000); room.state(2); advance(6000); room.state(2);
  assert.equal(room.players.has(1), false); assert.equal(room.captain, 2);
  room.leave(2, room.state(2).me.seat); assert.equal(room.result.outcome, 'abandoned');
});
test('deadline closes attacks and settlement is written only once, then a fresh lobby opens', () => {
  const { room, join, advance, saved } = setup(); join(1); room.start(1); const me = room.state(1).me;
  advance(ROUND_MS);
  assert.throws(() => room.type(1, { seat: me.seat, ticket: me.task.id, text: '一' }), /已经结束/);
  assert.equal(room.result.outcome, 'timeout'); room.state(1); assert.equal(saved.length, 1);
  const oldRound = room.round; advance(RESULT_MS); const state = room.state(1);
  assert.equal(state.phase, 'waiting'); assert.equal(state.me, null); assert.notEqual(room.round, oldRound);
});
test('cooperation reaches both damage phases and victory with contribution and accuracy awards', () => {
  const { room, join, advance, saved } = setup(); join(1); room.start(1); const stages = new Set([room.stage()]);
  for (let i = 0; i < 100 && room.phase === 'running'; i++) {
    advance(1000); const me = room.state(1).me;
    if (me.task.typed.length === me.task.text.length) room.next(1, { seat: me.seat, ticket: me.task.id });
    else send(room, 1, me.task.text.slice(0, me.task.typed.length + 10));
    stages.add(room.stage());
  }
  assert.deepEqual([...stages], [1, 2, 3]); assert.equal(room.hp, 0); assert.equal(room.result.outcome, 'victory');
  assert.equal(saved.length, 1); assert.equal(room.result.awards.precision.accuracy, 100);
  assert.equal(room.result.awards.contribution.damage, room.maxHp);
});
test('60 students share one boss room and exceeding capacity fails', () => {
  const { room, join } = setup(); for (let id = 1; id <= 60; id++) join(id);
  assert.throws(() => join(61), /房间已满/); room.start(1);
  assert.equal(room.state(60).players.length, 60); assert.equal(room.maxHp, 108000);
});
test('authenticated boss routes persist one training row per seat and do not change the territory room', async () => {
  const db = createDatabase(':memory:'); let time = 100000;
  const app = createApp({ db, now: () => time });
  try {
    const cookies = [];
    for (let i = 1; i <= 2; i++) {
      db.prepare('INSERT INTO users(id,username,display_name,password_hash,is_active) VALUES(?,?,?,?,1)').run(i, 'boss' + i, 'Boss同学' + i, 'unused');
      db.prepare('INSERT INTO user_sessions VALUES(?,?,?,?)').run(hashSessionToken('boss-token-' + i), i, time, time + 999999);
      cookies.push('typing_session=boss-token-' + i);
    }
    await request(app).get('/api/boss').expect(401);
    await request(app).post('/api/boss/type').send({}).expect(401);
    for (const cookie of cookies) await request(app).post('/api/boss/join').set('Cookie', cookie).send({}).expect(200);
    const started = await request(app).post('/api/boss/start').set('Cookie', cookies[0]).send({}).expect(200);
    const me = started.body.me; time += 1000;
    const packet = { seat: me.seat, ticket: me.task.id, text: me.task.text.slice(0, 3) };
    const hit = await request(app).post('/api/boss/type').set('Cookie', cookies[0]).send(packet).expect(200);
    assert.equal((await request(app).get('/api/boss').set('Cookie', cookies[1])).body.hp, hit.body.hp);
    await request(app).post('/api/boss/type').set('Cookie', cookies[0]).send(packet).expect(200);
    assert.equal((await request(app).get('/api/battle').set('Cookie', cookies[0])).body.online, 0);
    time += ROUND_MS;
    await request(app).get('/api/boss').set('Cookie', cookies[0]).expect(200);
    await request(app).get('/api/boss').set('Cookie', cookies[1]).expect(200);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM boss_results').get().n, 1);
    const row = db.prepare("SELECT * FROM training_sessions WHERE mode='boss'").get();
    assert.equal(row.correct_chars, 3); assert.equal(row.wrong_chars, 0); assert.match(row.lesson_title, /已结算/);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM training_sessions WHERE mode='boss'").get().n, 1);
  } finally { db.close(); }
});

test('team combo activates with three teammates on a live combo and boosts shared damage', () => {
  const { room, join, advance } = setup(); join(1); join(2); join(3); room.start(1);
  advance(1000);
  // 三人各自连击到门槛，合击状态在状态同步时生效。
  for (const id of [1, 2, 3]) send(room, id, room.state(id).me.task.text.slice(0, 5));
  const active = room.state(1);
  assert.equal(active.teamCombo.count, 3); assert.equal(active.teamCombo.active, true);
  assert.equal(active.teamCombo.bonus, 1.5); assert.ok(active.events.some(event => event.kind === 'combo'));
  // 合击开启时推进一个字：此时连击 6，基础倍率 1，合击后应为 10 × 1.5。
  const before = room.hp;
  advance(1000);
  const boosted = send(room, 1, room.state(1).me.task.text.slice(0, 6));
  assert.equal(before - boosted.hp, 15);
  assert.equal(boosted.me.combo, 6);
  // 队友停止输入并超过宽限期后合击自然关闭，同样连击水平下伤害回落到 10。
  advance(TEAM_COMBO_GRACE_MS + 500);
  assert.equal(room.state(1).teamCombo.active, false);
  const base = room.hp;
  const plain = send(room, 1, room.state(1).me.task.text.slice(0, 7));
  assert.equal(base - plain.hp, 10);
  assert.equal(plain.teamCombo.active, false);
});
test('team combo drops when fewer than three teammates keep a combo', () => {
  const { room, join, advance } = setup(); join(1); join(2); join(3); room.start(1);
  advance(1000);
  for (const id of [1, 2, 3]) send(room, id, room.state(id).me.task.text.slice(0, 6));
  assert.equal(room.state(1).teamCombo.active, true);
  // 两名队友被替换成错误字符（保留已结算前缀）后连击中断，只剩 1 号仍在连击。
  for (const id of [2, 3]) {
    const me = room.state(id).me;
    room.type(id, { seat: me.seat, ticket: me.task.id, text: `${me.task.typed}x` });
  }
  // 1 号持续输入以维持自己的连击，队友停在原地不再输入。
  for (let i = 7; i <= 8; i++) {
    advance(1000);
    send(room, 1, room.state(1).me.task.text.slice(0, i));
  }
  const solo = room.state(1);
  assert.equal(solo.teamCombo.count, 1); assert.equal(solo.teamCombo.active, false);
  assert.equal(solo.players.filter(player => player.inTeamCombo).map(player => player.id).join(), '1');
});
test('team combo resets between rounds', () => {
  const { room, join, advance } = setup(); join(1); join(2); join(3); room.start(1);
  advance(1000);
  for (const id of [1, 2, 3]) send(room, id, room.state(id).me.task.text.slice(0, 6));
  assert.equal(room.state(1).teamCombo.active, true);
  // 结算后合击状态必须清零，避免下一局开局就带着加成。
  advance(ROUND_MS);
  room.state(1);
  assert.equal(room.phase, 'finished');
  assert.equal(room.state(1).teamCombo.active, false); assert.equal(room.state(1).teamCombo.count, 0);
  // 下一局重新集结后仍是干净的初始状态。
  advance(RESULT_MS + 1000);
  room.state(1);
  assert.equal(room.phase, 'waiting');
  assert.equal(room.state(1).teamCombo.active, false);
});
