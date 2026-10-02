const test = require('node:test');
const assert = require('node:assert/strict');
const helpers = import('../frontend/src/runner-route.mjs');

test('route branches curve continuously in opposite directions instead of turning scenery instantly', async () => {
  const { createRouteSampler, TURN_ANGLE, TURN_LENGTH } = await helpers;
  const left = createRouteSampler([{ distance: 100, from: 0, to: -TURN_ANGLE }]);
  const right = createRouteSampler([{ distance: 100, from: 0, to: TURN_ANGLE }]);
  const a = left.sample(100), b = right.sample(100);
  assert.equal(a.heading, 0); assert.equal(b.heading, 0);
  for (let distance = 100; distance <= 150; distance += .2) {
    const l = left.sample(distance), r = right.sample(distance);
    assert.ok(Math.abs(l.x + r.x) < 1e-9); assert.ok(Math.abs(l.z - r.z) < 1e-9);
    const next = left.sample(distance + .01); assert.ok(Math.hypot(next.x - l.x, next.z - l.z) < .011);
  }
  assert.equal(left.sample(100 + TURN_LENGTH).heading, -TURN_ANGLE);
  assert.ok(left.sample(150).x < -25); assert.ok(right.sample(150).x > 25);
});

test('retaining the last route turns preserves visible relative positions after old turns are pruned', async () => {
  const { createRouteSampler, TURN_ANGLE } = await helpers;
  const turns = Array.from({ length: 10 }, (_, index) => ({ sequence: index * 5 + 5, distance: 100 + index * 200, from: index * TURN_ANGLE, to: (index + 1) * TURN_ANGLE }));
  const full = createRouteSampler(turns), bounded = createRouteSampler(turns.slice(-8));
  const origin = 1950, fullOrigin = full.sample(origin), boundedOrigin = bounded.sample(origin);
  for (let along = origin - 18; along < origin + 150; along += .5) {
    const a = full.sample(along), b = bounded.sample(along);
    assert.ok(Math.abs((a.x - fullOrigin.x) - (b.x - boundedOrigin.x)) < 1e-8);
    assert.ok(Math.abs((a.z - fullOrigin.z) - (b.z - boundedOrigin.z)) < 1e-8);
    assert.equal(a.heading, b.heading);
  }
});

test('fork previews switch immediately; confirmed routes keep their selected direction', async () => {
  const { planRoute, TURN_ANGLE } = await helpers;
  const state = { phase: 'running', routeTurns: [], task: { sequence: 5, action: 'fork', routeAt: 200, selection: 'left' } };
  assert.equal(planRoute(state, 'right')[0].to, TURN_ANGLE);
  assert.equal(planRoute({ ...state, task: { ...state.task, cleared: true } }, 'right')[0].to, -TURN_ANGLE);
  const committed = { sequence: 5, distance: 200, from: 0, to: TURN_ANGLE, direction: 'right' };
  assert.deepEqual(planRoute({ ...state, routeTurns: [committed] }, 'left'), [committed]);
  assert.deepEqual(planRoute({ ...state, phase: 'finished' }), []);
});
