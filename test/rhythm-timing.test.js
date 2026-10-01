const test = require('node:test');
const assert = require('node:assert/strict');
const timing = import('../frontend/src/rhythm-timing.mjs');

test('rhythm uses one monotonic clock across polling jitter, waiting and a new round', async () => {
  const { createRhythmClock } = await timing;
  const clock = createRhythmClock();
  clock.sync({ round: 'one', phase: 'running', elapsed: 1000 }, 5000, 40);
  assert.equal(clock.read(5000), 1020, '补偿一次往返中的下行时间');
  assert.equal(clock.read(5500), 1520);
  clock.sync({ round: 'one', phase: 'running', elapsed: 1490 }, 5500, 20);
  assert.equal(clock.read(5500), 1520, '轮询到达时画面不能倒退或跳跃');
  assert.equal(clock.read(6000), 2000, '校时平滑收敛');
  clock.sync({ round: 'one', phase: 'waiting', elapsed: 0 }, 6000);
  assert.equal(clock.read(10000), 0, '倒计时期间不能提前推进谱面');
  clock.sync({ round: 'two', phase: 'running', elapsed: 0 }, 10000);
  assert.equal(clock.read(10100), 100, '新一局重新锚定');
});

test('rhythm note centers reach the actual judge line at the same timestamp used by judgement', async () => {
  const { rhythmPosition, predictRhythmPress } = await timing;
  const note = { id: 0, letter: 'K', lane: 3, at: 7000 };
  for (const fallMs of [6800, 2600, 1900]) {
    for (const ratio of [0.76, 0.86]) {
      assert.equal(rhythmPosition(note, note.at, fallMs, ratio).top, ratio * 100);
      assert.equal(rhythmPosition(note, note.at - fallMs, fallMs, ratio).top, 7);
      assert.equal(predictRhythmPress([note], 'K', note.at, new Set()).grade, 'perfect');
    }
  }
});
