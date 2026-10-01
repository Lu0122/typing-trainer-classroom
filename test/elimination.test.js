const test = require('node:test');
const assert = require('node:assert/strict');
const { EliminationRoom, ELIMINATION_INTERVAL_MS, ROUND_MS } = require('../src/boss');

function setup(count) {
  let time = 100000;
  const saved = [];
  const room = new EliminationRoom({ now: () => time, save: result => saved.push(result) });
  for (let id = 1; id <= count; id++) room.join({ id, displayName: `同学${id}` });
  room.start(1);
  return { room, saved, advance: ms => { time += ms; }, now: () => time };
}

test('elimination: a high-scoring quitter cannot become the last survivor', () => {
  const { room } = setup(3);
  const player = room.players.get(1);
  room.type(1, { seat: player.seat, ticket: player.task.id, text: player.task.text.slice(0, 3) });
  room.leave(1, player.seat);
  assert.equal(room.phase, 'running');
  room.leave(3, room.players.get(3).seat);
  assert.equal(room.result.outcome, 'survivor');
  assert.equal(room.result.winner.id, 2);
  assert.equal(room.result.survivors, 1);
  assert.equal(room.result.participants.find(player => player.id === 1).score, 30);
});

test('elimination: an empty match has no winner or accuracy award', () => {
  const { room } = setup(1);
  room.leave(1, room.players.get(1).seat);
  assert.equal(room.result.outcome, 'abandoned');
  assert.equal(room.result.winner, null);
  assert.equal(room.result.survivors, 0);
  assert.equal(room.result.awards.precision, null);
});

test('elimination: survival duration freezes on elimination and eliminated players cannot type', () => {
  const { room, advance } = setup(4);
  advance(ELIMINATION_INTERVAL_MS);
  const state = room.state(4);
  assert.equal(state.me.eliminated, true);
  assert.equal(state.me.survivalMs, ELIMINATION_INTERVAL_MS);
  assert.equal(state.me.task, null);
  assert.equal(state.elimination.totalRounds, Math.ceil(ROUND_MS / ELIMINATION_INTERVAL_MS));
  advance(5000);
  for (const id of [1, 2, 3]) room.state(id);
  assert.equal(room.state(4).me.survivalMs, ELIMINATION_INTERVAL_MS);
  assert.throws(() => room.type(4, { seat: room.players.get(4).seat, text: 'a' }), /已被淘汰/);
});

test('elimination: delayed ticks stop resolving rounds as soon as a survivor wins', () => {
  const { room, advance, now, saved } = setup(4);
  advance(100000);
  // 模拟心跳持续到达、淘汰调度暂时延迟的房间。
  for (const player of room.players.values()) player.seen = now();
  room.tick();
  assert.equal(room.result.outcome, 'survivor');
  assert.equal(room.eliminationRound, 3);
  assert.equal(room.result.survivors, 1);
  assert.equal(saved.length, 1);
});
