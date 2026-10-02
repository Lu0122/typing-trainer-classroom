const test = require('node:test');
const assert = require('node:assert/strict');
const moduleReady = import('../frontend/src/chase-motion.mjs');
const players = (police = 0, thief = 16) => [{ id: 'p1', role: 'police', position: police, speedKmh: 90 }, { id: 't1', role: 'thief', position: thief, speedKmh: 100 }];
const roundState = (positions, phase = 'running', round = 'round1') => ({ round, phase, players: positions });

test('追逐动画停手后不按速度推算额外距离', async () => {
  const { createChaseMotion } = await moduleReady;
  const motion = createChaseMotion(), state = roundState(players(32, 45));
  for (let frame = 0; frame < 300; frame++) {
    const display = motion.step(state, 1 / 60);
    assert.deepEqual(display.map(player => player.position), [32, 45]);
    assert.ok(display.every(player => player.moved === 0));
  }
});

test('服务器确认的位移逐帧前进，保持边界并最终准确停在目标', async () => {
  const { createChaseMotion } = await moduleReady;
  const motion = createChaseMotion(); motion.step(roundState(players()), 1 / 60);
  let before = 0;
  const updated = roundState(players(27, 42));
  for (let frame = 0; frame < 120; frame++) {
    const display = motion.step(updated, 1 / 60);
    assert.ok(display[0].position >= before && display[0].position <= 27);
    if (frame === 0) assert.ok(display[0].position > 0 && display[0].position < 27);
    before = display[0].position;
  }
  assert.equal(before, 27);
});

test('跨过环道起点仍沿前进方向衔接，不反向绕一整圈', async () => {
  const { chasePoint, createChaseMotion } = await moduleReady;
  const zero = chasePoint(0), lap = chasePoint(520);
  assert.ok(Math.hypot(zero.x - lap.x, zero.z - lap.z) < 1e-10);
  const beforePoint = chasePoint(519.99), afterPoint = chasePoint(520.01);
  assert.ok(Math.hypot(beforePoint.x - afterPoint.x, beforePoint.z - afterPoint.z) < .01);
  assert.ok(afterPoint.angle > beforePoint.angle);
  assert.ok(Math.abs(Math.hypot(zero.tx, zero.tz) - 1) < 1e-10);
  const motion = createChaseMotion(); motion.step(roundState(players(519, 535)), 1 / 60);
  const first = motion.step(roundState(players(523, 539)), 1 / 60);
  assert.ok(first[0].position > 519 && first[0].position < 523);
});

test('换房与倒计时重置位置，不保留上一局动画位移', async () => {
  const { createChaseMotion } = await moduleReady;
  const motion = createChaseMotion(); motion.step(roundState(players(600, 619)), 1 / 60);
  const newRoom = motion.step(roundState(players(), 'countdown', 'round2'), 1 / 60);
  assert.deepEqual(newRoom.map(player => player.position), [0, 16]);
  assert.ok(newRoom.every(player => player.moved === 0));
});

test('抓到时两名骑手在同一接触点收尾，逃脱时保留实际间距', async () => {
  const { createChaseMotion } = await moduleReady;
  const motion = createChaseMotion(); motion.step(roundState(players(15, 16)), 1 / 60);
  const caught = { ...roundState(players(17.55, 16), 'finished'), result: { outcome: 'caught' } };
  let display;
  for (let frame = 0; frame < 120; frame++) display = motion.step(caught, 1 / 60);
  assert.deepEqual(display.map(player => player.position), [16, 16]);
  const escaped = { ...roundState(players(35, 66), 'finished', 'round3'), result: { outcome: 'escaped' } };
  assert.deepEqual(motion.step(escaped, 1 / 60).map(player => player.position), [35, 66]);
});

test('因对手离开而获胜时保留距离，不播放虚假的追上动作', async () => {
  const { createChaseMotion } = await moduleReady;
  const state = { ...roundState(players(20, 60), 'finished'), result: { outcome: 'caught', left: true } };
  assert.deepEqual(createChaseMotion().step(state, 1 / 60).map(player => player.position), [20, 60]);
});
