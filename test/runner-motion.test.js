const test = require('node:test');
const assert = require('node:assert/strict');
const helpers = import('../frontend/src/runner-motion.mjs');

test('runner paving keeps object identity and recycles individually behind the camera', async () => {
  const { trackPosition } = await helpers;
  for (const distance of [4.35, 149.55, 10000]) {
    let recycled = 0;
    for (let index = 0; index < 34; index++) {
      const before = trackPosition(index, distance, 34, 4.4, 17);
      const after = trackPosition(index, distance + .1, 34, 4.4, 17);
      assert.ok(after <= 17 && after > 17 - 34 * 4.4);
      if (after < before) { recycled++; assert.ok(before > 16.8); }
      else assert.ok(Math.abs(after - before - .1) < 1e-9);
    }
    assert.ok(recycled <= 1, 'A wrapping tile must not reset all the visible scenery');
  }
});

test('runner clock absorbs varying round-trip latency without jumping or reversing frames', async () => {
  const { createRunnerClock } = await helpers;
  const clock = createRunnerClock(); clock.sync(1000100, 0, 200);
  assert.equal(clock.now(216), 1000216);
  clock.sync(1000500, 400, 700); // 150 ms midpoint estimate change
  const before = clock.now(700), after = clock.now(716);
  assert.ok(after - before >= 14 && after - before <= 18);
  clock.sync(1001000, 900, 1000);
  let previous = clock.now(1000);
  for (let perf = 1016; perf < 2500; perf += 16) {
    const now = clock.now(perf); assert.ok(now >= previous); assert.ok(now - previous < 18); previous = now;
  }
  clock.sync(2000000, 2500, 2500, true); assert.equal(clock.now(2500), 2000000);
});

test('runner motion continues through obstacle boundaries and pauses without backwards correction', async () => {
  const { createRunnerMotion } = await helpers;
  const motion = createRunnerMotion();
  const state = { id: 'run', phase: 'running', serverNow: 1000, distance: 10, speed: 8, task: { deadline: 1100 } };
  let before = motion.step(state, 1000, 0);
  for (let now = 1016; now < 2000; now += 16) {
    const next = motion.step(state, now, .016); assert.ok(next > before); before = next;
  }
  const next = motion.step({ ...state, serverNow: 2000, distance: 16 }, 2016, .016);
  assert.ok(next > before && next - before < .18);
  assert.equal(motion.step({ ...state, phase: 'paused', distance: 17 }, 3000, .016), 17);
  assert.equal(motion.step({ ...state, phase: 'paused', distance: 17 }, 9000, .016), 17);
  motion.step(state, 1000, 0); assert.equal(motion.step(state, 1500, .016, false), 10);
});

test('jump and slide reach full clearance when the obstacle crosses the runner', async () => {
  const { actionPose } = await helpers;
  const deadline = 10000;
  assert.equal(actionPose('jump', deadline - 561, deadline).active, false);
  assert.equal(actionPose('jump', deadline, deadline).jump, 2.05);
  assert.equal(actionPose('slide', deadline, deadline).crouch, 1);
  assert.equal(actionPose('jump', deadline + 560, deadline).jump, 0);
  assert.equal(actionPose('left', deadline, deadline).lean, -1);
  assert.equal(actionPose('right', deadline, deadline).lean, 1);
});

test('contact feedback occurs at crossing and retains a jump landing after the next poll', async () => {
  const { createContactTracker } = await helpers;
  const tracker = createContactTracker();
  const state = { id: 'run', phase: 'running', score: 100, task: { sequence: 1, action: 'jump', deadline: 10000, cleared: true } };
  assert.deepEqual(tracker.update(state, 9900), []);
  assert.equal(tracker.update(state, 10000)[0].kind, 'pass');
  assert.deepEqual(tracker.update(state, 10010), []);
  const next = { ...state, task: { sequence: 2, action: 'slide', deadline: 15000 } };
  assert.equal(tracker.latestAction(10200).action, 'jump');
  assert.equal(tracker.update(next, 10560)[0].kind, 'land');
  assert.equal(tracker.trailingObstacle(10560, 2).sequence, 1);
  assert.equal(tracker.trailingObstacle(11600, 2), undefined);
  assert.deepEqual(tracker.update(next, 10570), []);
});

test('contact feedback deduplicates collisions and discards stale or paused collisions', async () => {
  const { createContactTracker } = await helpers;
  const tracker = createContactTracker();
  const state = { id: 'run', phase: 'running', lives: 2, event: { outcome: 'miss', sequence: 1, action: 'slide', at: 10000 } };
  assert.deepEqual(tracker.update(state, 9999), []);
  assert.equal(tracker.update(state, 10010)[0].kind, 'miss');
  assert.deepEqual(tracker.update(state, 10011), []);
  assert.deepEqual(tracker.update({ ...state, event: { ...state.event, sequence: 2, at: 7000 } }, 10020), []);
  assert.deepEqual(tracker.update({ ...state, phase: 'paused', event: { ...state.event, sequence: 3 } }, 10020), []);
  assert.deepEqual(tracker.update({ ...state, event: { ...state.event, sequence: 3 } }, 10021), []);
  assert.equal(tracker.update({ ...state, phase: 'finished', lives: 0, event: { ...state.event, sequence: 4 } }, 10020)[0].lives, 0);
});

test('contact history survives an unlimited run without replaying past actions', async () => {
  const { createContactTracker } = await helpers;
  const tracker = createContactTracker();
  for (let sequence = 1; sequence <= 500; sequence++) {
    const deadline = sequence * 4000;
    const state = { id: 'run', phase: 'running', score: sequence * 100, task: { sequence, action: 'jump', deadline, cleared: true } };
    assert.equal(tracker.update(state, deadline)[0].kind, 'pass');
    assert.equal(tracker.update(state, deadline + 560)[0].kind, 'land');
    assert.deepEqual(tracker.update(state, deadline + 2001), []);
    assert.equal(tracker.latestAction(deadline + 2001), undefined);
    assert.equal(tracker.trailingObstacle(deadline + 2001, sequence + 1), undefined);
  }
});
