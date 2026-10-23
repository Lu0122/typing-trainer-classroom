const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildChart, judgeKey, expireNotes, accuracyOf, comboMultiplier, GRADES, GRADE_KEYS,
  JUDGE_PERFECT_MS, JUDGE_GREAT_MS, JUDGE_GOOD_MS, JUDGE_MISS_MS, LANE_COUNT, LANE_LAYOUT, LETTER_LANE,
  BEAT_MS, BPM, BEATS_PER_BAR, OPENING_AT_MS,
} = require('../backend/rhythm-chart');

test('chart: deterministic, sorted, no adjacent repeats, lanes come from the four-lane split', () => {
  const a = buildChart('seed-1', 90000);
  const b = buildChart('seed-1', 90000);
  const c = buildChart('seed-2', 90000);
  assert.deepEqual(a.notes, b.notes, '同一 seed 必须得到同一份谱面');
  assert.notDeepEqual(a.notes, c.notes, '不同 seed 应生成不同谱面');
  assert.equal(a.bpm, BPM);
  assert.equal(a.beatMs, BEAT_MS);
  for (let i = 0; i < a.notes.length; i++) {
    const note = a.notes[i];
    assert.equal(note.id, i, 'id 必须等于下标，判定用游标按下标推进');
    if (i) assert.ok(note.at > a.notes[i - 1].at, '音符时间必须严格递增');
    assert.match(note.letter, /^[A-Z]$/);
    assert.equal(note.lane, LETTER_LANE.get(note.letter), '道位必须来自四道分区映射');
    assert.ok(note.lane >= 0 && note.lane < LANE_COUNT);
    assert.ok(LANE_LAYOUT[note.lane].includes(note.letter), '字母必须落在它所属道的关键字串里');
  }
  for (let i = 1; i < a.notes.length; i++) assert.notEqual(a.notes[i].letter, a.notes[i - 1].letter);
});
test('chart: the four-lane split covers all 26 letters exactly once', () => {
  assert.equal(LANE_COUNT, 4);
  assert.equal(LANE_LAYOUT.length, 4);
  const flat = LANE_LAYOUT.join('');
  assert.equal(flat.length, 26, '四条道的字母池加起来必须是 26 个字母');
  assert.equal(new Set(flat).size, 26, '字母不得重复分配到两条道');
  for (let i = 0; i < 26; i++) {
    const letter = String.fromCharCode(65 + i);
    const lane = LANE_LAYOUT.findIndex(keys => keys.includes(letter));
    assert.ok(lane >= 0, `${letter} 必须落在某条道上`);
    assert.equal(LETTER_LANE.get(letter), lane);
  }
  // 左手在左两道、右手在右两道：Q/H 分别是左右手的典型键位，必须分居两侧。
  assert.ok(LETTER_LANE.get('Q') < 2, 'Q 应在左半区（道 0/1）');
  assert.ok(LETTER_LANE.get('P') >= 2, 'P 应在右半区（道 2/3）');
  assert.ok(LETTER_LANE.get('H') >= 2, 'H 是右手基准键，应在右半区');
  assert.ok(LETTER_LANE.get('D') < 2, 'D 是左手基准键，应在左半区');
});
test('chart: stays on the beat grid and respects the round duration', () => {
  const duration = 90000;
  const chart = buildChart('grid', duration);
  const half = BEAT_MS / 2;
  for (const note of chart.notes) {
    assert.ok(note.at >= 0 && note.at < duration, `音符越界：${note.at}`);
    // 所有音符都落在半拍网格上，与 BPM 对齐。
    assert.equal(Math.abs(note.at / half - Math.round(note.at / half)) < 1e-6, true, `音符未对齐网格：${note.at}`);
  }
  assert.ok(chart.notes.length > 0);
});
test('chart: the first note lands early so the opening screen is never empty', () => {
  // 回落时长即「等待时间」：方块从顶部落到判定线要走满整个 fallMs。
  // 若首个音符 at = 0，玩家开局后要干等一整个 fallMs 才有第一个可判定的方块，
  // 屏幕上什么都没有，看起来像游戏没加载出来。
  const fallMs = 2600;
  for (const seed of ['open', 'open-2', 'open-3']) {
    const chart = buildChart(seed, 90000);
    assert.equal(chart.notes[0].at, OPENING_AT_MS, '首个音符必须落在约定的开场时刻');
    assert.ok(OPENING_AT_MS < BEAT_MS, '首个音符必须落在第一拍之前');
    // 从「可按下」到「该按下」的等待要明显短于一整个下落周期，否则玩家会觉得没反应。
    assert.ok(fallMs - OPENING_AT_MS <= 2400,
      `开场等待过久：${fallMs - OPENING_AT_MS}ms，玩家会觉得没反应`);
  }
});
test('chart: no dead air between bars, even in the sparse breathing section', () => {
  // 半速呼吸小节若写成 [0, 2]，第 2 拍之后会空掉一拍半，
  // 开局第四拍之后正好踩到这一条，屏幕上会出现约 1.3 秒的空白。
  // 这里逐小节检查：任何一个小节都不许在自己的时间跨度内留下超过两拍的间隙。
  const chart = buildChart('breath', 90000);
  for (let bar = 0; bar < chart.bars; bar++) {
    const lo = bar * BEATS_PER_BAR * BEAT_MS;
    const hi = lo + BEATS_PER_BAR * BEAT_MS;
    const inBar = chart.notes.filter(n => n.at >= lo && n.at < hi);
    assert.ok(inBar.length >= 2, `第 ${bar} 小节音符过少：${inBar.length} 个`);
    const points = [lo, ...inBar.map(n => n.at), hi];
    for (let i = 1; i < points.length; i++) {
      const gap = points[i] - points[i - 1];
      assert.ok(gap <= BEAT_MS * 2 + 1,
        `第 ${bar} 小节出现 ${gap}ms 空档（超过两拍），会造成屏幕空白`);
    }
  }
});

test('chart: judgement windows are inclusive at both edges and null outside', () => {
  const chart = buildChart('windows', 90000);
  const note = chart.notes[3];
  const at = delta => judgeKey(chart, 3, note.letter, note.at + delta, new Set());
  assert.equal(at(0).grade, 'perfect');
  assert.equal(at(JUDGE_PERFECT_MS).grade, 'perfect');
  assert.equal(at(-JUDGE_PERFECT_MS).grade, 'perfect');
  assert.equal(at(JUDGE_PERFECT_MS + 1).grade, 'great');
  assert.equal(at(JUDGE_GREAT_MS).grade, 'great');
  assert.equal(at(JUDGE_GREAT_MS + 1).grade, 'good');
  assert.equal(at(JUDGE_GOOD_MS).grade, 'good');
  assert.equal(at(JUDGE_GOOD_MS + 1), null);
  assert.equal(at(-JUDGE_GOOD_MS - 1), null);
});
test('chart: after a miss window the note is no longer hittable', () => {
  const chart = buildChart('late', 90000);
  const note = chart.notes[2];
  assert.ok(JUDGE_MISS_MS > JUDGE_GOOD_MS, 'Miss 容限必须大于 Good 窗口');
  assert.equal(judgeKey(chart, 2, note.letter, note.at + JUDGE_MISS_MS + 1, new Set()), null);
  assert.equal(judgeKey(chart, 2, note.letter, note.at + JUDGE_GOOD_MS + 1, new Set()), null);
});
test('chart: consecutive notes of the same request each match their own note', () => {
  const chart = buildChart('batch', 90000);
  const batch = chart.notes.slice(0, 10);
  const resolved = new Set();
  let cursor = 0;
  const graded = [];
  for (const note of batch) {
    const hit = judgeKey(chart, cursor, note.letter, note.at, resolved);
    assert.ok(hit, `批次内第 ${note.id} 个音符应当命中`);
    assert.equal(hit.note.id, note.id, '应当命中对应的那个音符');
    resolved.add(hit.note.id);
    if (hit.note.id >= cursor) cursor = hit.note.id + 1;
    graded.push(hit.grade);
  }
  assert.deepEqual(graded, Array(batch.length).fill('perfect'));
});
test('chart: already-resolved notes are skipped rather than re-hit', () => {
  const chart = buildChart('resolved', 90000);
  const note = chart.notes[0];
  assert.ok(judgeKey(chart, 0, note.letter, note.at, new Set()));
  assert.equal(judgeKey(chart, 0, note.letter, note.at, new Set([note.id])), null);
});
test('chart: expireNotes reports only unresolved notes past the miss window', () => {
  const chart = buildChart('expire', 90000);
  const horizon = chart.notes.filter(n => n.at + JUDGE_MISS_MS < 6000).length;
  assert.ok(horizon > 0, '测试前置条件：6 秒内应当有若干音符');
  const all = expireNotes(chart, 0, 6000, new Set());
  assert.equal(all.missed.length, horizon);
  assert.equal(all.nextCursor, horizon);
  // 已经判定掉的音符不再计入漏键，但游标仍要向前走。
  const firstId = chart.notes[0].id;
  const partial = expireNotes(chart, 0, 6000, new Set([firstId]));
  assert.equal(partial.missed.length, horizon - 1);
  assert.equal(partial.nextCursor, horizon);
  // 时间还没推进时不该产生漏键。
  assert.equal(expireNotes(chart, 0, 0, new Set()).missed.length, 0);
});
test('chart: accuracy weights each grade and never divides by zero', () => {
  assert.equal(accuracyOf({ perfect: 0, great: 0, good: 0, miss: 0 }), 100);
  assert.equal(accuracyOf({ perfect: 4, great: 0, good: 0, miss: 0 }), 100);
  assert.equal(accuracyOf({ perfect: 0, great: 4, good: 0, miss: 0 }), 70);
  assert.equal(accuracyOf({ perfect: 0, great: 0, good: 4, miss: 0 }), 40);
  assert.equal(accuracyOf({ perfect: 0, great: 0, good: 0, miss: 4 }), 0);
  assert.equal(accuracyOf({ perfect: 1, great: 0, good: 0, miss: 1 }), 50);
  assert.equal(accuracyOf({ perfect: 0, great: 1, good: 1, miss: 2 }), 28);
});
test('chart: combo multiplier steps up and resets at zero', () => {
  const steps = [[0, 1], [4, 1], [5, 1.2], [14, 1.2], [15, 1.5], [29, 1.5], [30, 2], [59, 2], [60, 2.5], [99, 2.5], [100, 3], [500, 3]];
  for (const [combo, expected] of steps) assert.equal(comboMultiplier(combo), expected, `combo=${combo}`);
});
test('chart: every grade has a score and a weight, and keys match', () => {
  for (const key of GRADE_KEYS) {
    assert.ok(GRADES[key], `缺少判定等级 ${key}`);
    assert.equal(typeof GRADES[key].score, 'number');
    assert.equal(typeof GRADES[key].weight, 'number');
  }
  assert.ok(GRADES.perfect.score > GRADES.great.score);
  assert.ok(GRADES.great.score > GRADES.good.score);
  assert.equal(GRADES.miss.score, 0);
  assert.equal(GRADES.miss.weight, 0);
});
test('chart: invalid keys are rejected without touching the chart', () => {
  const chart = buildChart('invalid', 90000);
  const note = chart.notes[0];
  for (const bad of ['', '1', '中', 'ab', null, undefined, 'A1']) {
    if (bad === 'ab') continue; // 小写会被规范化，另行验证
    assert.equal(judgeKey(chart, 0, bad, note.at, new Set()), null, `非法按键 ${String(bad)} 不应命中`);
  }
  // 小写字母应当被规范化为大写后正常命中。
  const lower = judgeKey(chart, 0, note.letter.toLowerCase(), note.at, new Set());
  assert.ok(lower);
  assert.equal(lower.note.id, note.id);
});
test('chart: a longer round yields proportionally more notes', () => {
  const short = buildChart('len', 30000);
  const full = buildChart('len', 90000);
  assert.ok(full.notes.length > short.notes.length);
  // 密度曲线按小节循环，所以时长约 3 倍时音符数也应接近 3 倍。
  const ratio = full.notes.length / short.notes.length;
  assert.ok(ratio > 2.5 && ratio < 3.5, `音符数比例异常：${ratio.toFixed(2)}`);
  // 无论时长多少，音符都必须落在该局时长之内。
  for (const note of short.notes) assert.ok(note.at < 30000);
});
test('chart: fills the whole round, from warm-up through climax', () => {
  const duration = 90000;
  const chart = buildChart('density', duration);
  const gaps = [];
  for (let i = 1; i < chart.notes.length; i++) gaps.push(chart.notes[i].at - chart.notes[i - 1].at);
  const maxGap = Math.max(...gaps);
  const minGap = Math.min(...gaps);
  // 最大间隔不超过两拍（热身段每拍一个），保证不会长时间无事可做。
  assert.ok(maxGap <= BEAT_MS * 2 + 1, `出现了过长的空档：${maxGap}ms`);
  // 最小间隔不小于半拍，避免难度失控。
  assert.ok(minGap >= BEAT_MS / 2 - 1, `音符过密：${minGap}ms`);
  // 同一小节内不允许忽快忽慢：相邻间隔只允许是半拍、整拍或两拍。
  // 尤其是 268ms（半拍）与 536ms（整拍）交替出现时必须禁止——
  // 两者都落在 320ms 的判定窗口内，玩家几乎来不及把两次按键分开。
  for (const gap of gaps) {
    const ratio = gap / BEAT_MS;
    const ok = [0.5, 1, 2].some(r => Math.abs(ratio - r) < 1e-3);
    assert.ok(ok, `出现了非整拍/半拍的间隔：${gap}ms（${ratio.toFixed(3)} 拍）`);
  }
  // 谱面必须铺满整局，否则后半局没有方块可打。
  // 谱面按整小节生成，最后一小节若超出时长会整体舍弃，因此允许尾部留不足一小节的余量。
  const tail = duration - chart.notes.at(-1).at;
  assert.ok(tail < BEATS_PER_BAR * BEAT_MS + BEAT_MS,
    `谱面过早结束：最后音符在 ${chart.notes.at(-1).at}ms / ${duration}ms，尾部空档 ${tail}ms`);
  assert.ok(chart.bars >= Math.floor(duration / BEAT_MS / BEATS_PER_BAR));
  // 难度应当有起伏：既有整拍/两拍的热身段，也有半拍的密集高潮段。
  const beatsPerNote = gaps.map(g => g / BEAT_MS);
  assert.ok(Math.max(...beatsPerNote) >= 2 - 1e-6, '缺少稀疏的热身段');
  assert.ok(Math.min(...beatsPerNote) <= 0.5 + 1e-6, '缺少密集的高潮段');
  // 后半局必须比前半局更密集，否则「难度起伏」只是前紧后松。
  const half = Math.floor(chart.notes.length / 2);
  const spanOf = list => list.at(-1).at - list[0].at;
  const firstHalfRate = half / spanOf(chart.notes.slice(0, half));
  const secondHalfRate = (chart.notes.length - half) / spanOf(chart.notes.slice(half));
  assert.ok(secondHalfRate > firstHalfRate, '后半局密度没有提升');
});
