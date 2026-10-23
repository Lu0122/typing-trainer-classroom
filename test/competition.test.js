const assert = require('node:assert/strict');
const test = require('node:test');
const { CompetitionRoom, ROUND_MS } = require('../backend/competition');

function user(id) { return { id, displayName: `选手${id}` }; }

test('personal competition starts, scores correct input, and ranks players', () => {
  let now = 1_000_000; let saved;
  const room = new CompetitionRoom('personal', { now: () => now, save: (result) => { saved = result; } });
  const first = room.join(user(1));
  const second = room.join(user(2));
  room.start(1);
  const target = room.state(1).me.task;
  room.type(1, { seat: first.me.seat, ticket: target.id, text: target.text.slice(0, 6) });
  room.type(2, { seat: second.me.seat, ticket: room.state(2).me.task.id, text: room.state(2).me.task.text.slice(0, 3) });
  now += ROUND_MS + 1;
  const finished = room.state(1);
  assert.equal(finished.phase, 'finished');
  assert.equal(saved.mode, 'personal');
  assert.equal(finished.result.ranking[0].id, 1);
});

test('team competition balances teams and calculates team totals', () => {
  let now = 2_000_000; let saved;
  const room = new CompetitionRoom('team', { now: () => now, save: (result) => { saved = result; } });
  const a = room.join(user(1)); const b = room.join(user(2)); const c = room.join(user(3));
  assert.notEqual(a.me.team, b.me.team);
  assert.equal(a.me.team, c.me.team);
  room.start(1);
  const state = room.state(1);
  room.type(1, { seat: a.me.seat, ticket: state.me.task.id, text: state.me.task.text.slice(0, 4) });
  now += ROUND_MS + 1;
  const finished = room.state(1);
  assert.equal(finished.phase, 'finished');
  assert.equal(saved.teams.length, 2);
  assert.ok(saved.teams.some((team) => team.correct === 4));
});
