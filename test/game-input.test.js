const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const vue = require('vue');
const timingContext = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'frontend', 'src', 'rhythm-timing.mjs'), 'utf8')
  .replace(/^export /gm, '') + '\nthis.timing = { createRhythmClock, rhythmPhysicalKey, rhythmPosition, predictRhythmPress };', timingContext);

// 执行组件的真实输入逻辑；网络与定时器由测试控制，重现慢请求和失败重试。
function load(component, names, fetch, props = {}, lifecycle = {}) {
  const file = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'src', component), 'utf8');
  const source = file.match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .+;\r?$/gm, '');
  const timers = new Map(), timerDelays = new Map(); let nextTimer = 0;
  const context = {
    ...vue, ...timingContext.timing, onMounted() {}, onBeforeUnmount() {}, watch() {}, defineExpose() {},
    defineProps: () => ({ user: { id: 1 }, mode: 'rhythm', ...props }), defineEmits: () => () => {},
    fetch, AbortSignal, Date, LANE_COUNT: require('../backend/rhythm-chart').LANE_COUNT, performance: { now: () => Date.now() },
    setTimeout: (fn, delay) => { const id = ++nextTimer; timers.set(id, fn); timerDelays.set(id, delay); return id; },
    clearTimeout: id => { timers.delete(id); timerDelays.delete(id); },
    ...lifecycle,
  };
  vm.runInNewContext(`${source}\nthis.exposed = { ${names.join(',')} };`, context);
  return { ...context.exposed, runTimer: async () => {
    const [id, fn] = timers.entries().next().value;
    timers.delete(id); timerDelays.delete(id); await fn();
  }, timers, timerDelays };
}

const response = data => ({ ok: true, json: async () => data });
const snapshot = (mode = 'rhythm', typed = '') => ({
  mode, phase: 'running', round: 'round-1', serverNow: Date.now(), elapsed: 1000,
  players: [], result: null,
  me: { id: 1, seat: 'seat-1', attempted: typed.length, correct: typed.length, score: 0,
    task: { id: 'task-1', text: 'abcdef', typed } },
});

test('rhythm input serializes pending key packets while preserving newly pressed keys', async () => {
  const calls = [];
  let complete;
  const game = load('ArenaGame.vue', ['sync', 'keyBuffer', 'flushKeys', 'soundOn'], (url, options) => {
    calls.push(JSON.parse(options.body));
    return new Promise(resolve => { complete = () => resolve(response(snapshot())); });
  });
  game.soundOn.value = false; game.sync(snapshot());
  game.keyBuffer.value.push({ key: 'A', at: 1000 });
  const first = game.flushKeys();
  game.keyBuffer.value.push({ key: 'B', at: 1001 });
  await game.flushKeys();
  assert.equal(calls.length, 1, '前一请求未返回时不能发送后一批');
  complete(); await first;
  const second = game.flushKeys();
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].keys, [{ key: 'B', at: 1001 }]);
  assert.equal(calls[1].round, 'round-1');
  complete(); await second;
  assert.equal(game.keyBuffer.value.length, 0);
});

test('rhythm input retries a failed request with the original key timestamps', async () => {
  const calls = [];
  const game = load('ArenaGame.vue', ['sync', 'keyBuffer', 'flushKeys', 'soundOn'], async (url, options) => {
    calls.push(JSON.parse(options.body));
    if (calls.length === 1) throw new Error('temporary connection failure');
    return response(snapshot());
  });
  game.soundOn.value = false; game.sync(snapshot());
  game.keyBuffer.value.push({ key: 'A', at: 980 });
  await game.flushKeys();
  assert.equal(game.keyBuffer.value.length, 1);
  await game.flushKeys();
  assert.deepEqual(calls[1].keys, calls[0].keys);
  assert.equal(game.keyBuffer.value.length, 0);
});

test('rhythm ignores held keys, composition and keys entered while an exit dialog is open', () => {
  const game = load('ArenaGame.vue', ['sync', 'keyBuffer', 'onKeydown', 'exitDialog'], async () => response(snapshot()));
  game.sync(snapshot());
  const event = { key: 'a', preventDefault() {}, target: { closest: () => null } };
  game.onKeydown({ ...event, repeat: true });
  game.onKeydown({ ...event, isComposing: true });
  game.exitDialog.value = { open: true }; game.onKeydown(event);
  assert.equal(game.keyBuffer.value.length, 0);
  game.exitDialog.value = null; game.onKeydown(event);
  assert.equal(game.keyBuffer.value.length, 1);
});

test('rhythm Escape opens the exit dialog without submitting a game key', () => {
  const game = load('ArenaGame.vue', ['sync', 'keyBuffer', 'onArenaKeydown', 'exitDialog'], async () => response(snapshot()));
  game.sync(snapshot());
  let opened = false;
  game.exitDialog.value = { open: false, showModal: () => { opened = true; } };
  game.onArenaKeydown({ key: 'Escape', preventDefault() {} });
  assert.equal(opened, true);
  assert.equal(game.keyBuffer.value.length, 0);
});

test('rhythm captures simultaneous physical keys with an IME and immediately forwards both for feedback', () => {
  const previews = [];
  const game = load('ArenaGame.vue', ['sync', 'onKeydown', 'keyBuffer', 'rhythmBoard'], async () => response(snapshot()), {}, { performance: { now: () => 5000 } });
  game.sync(snapshot());
  game.rhythmBoard.value = { pressKey: (...args) => previews.push(args) };
  const event = { key: 'Process', isComposing: true, timeStamp: 4980, preventDefault() {} };
  game.onKeydown({ ...event, code: 'KeyA' }); game.onKeydown({ ...event, code: 'KeyJ' });
  assert.equal(game.keyBuffer.value.length, 2);
  assert.deepEqual([...game.keyBuffer.value].map(key => key.key), ['A', 'J']);
  assert.equal(game.keyBuffer.value[0].at, 980, '按键发生时刻不能包含主线程排队的 20ms');
  assert.equal(game.keyBuffer.value[1].at, game.keyBuffer.value[0].at);
  assert.equal(previews.length, 2, '连续反馈不等待网络返回');
  game.onKeydown({ ...event, code: 'KeyS', repeat: true });
  game.onKeydown({ ...event, code: 'KeyD', ctrlKey: true });
  game.onKeydown({ ...event, code: 'KeyF', target: { closest: () => ({}) } });
  assert.equal(previews.length, 2);
});

test('rhythm local chords keep both hit effects and reconcile the combo without counting twice', async () => {
  const scope = vue.effectScope();
  try {
    const props = vue.reactive({ running: true, countdown: null, elapsed: 5000, readElapsed: () => 5000,
      judgeRatio: 0.76, confirmedInputId: 0, judgement: { perfectMs: 70, greatMs: 130, goodMs: 210, missMs: 320 },
      chart: { fallMs: 2600, notes: [{ id: 0, letter: 'A', at: 5000, lane: 1 }, { id: 1, letter: 'J', at: 5000, lane: 3 }] },
      me: { combo: 0, gradeId: 0, keys: [] } });
    const game = scope.run(() => load('RhythmBoard.vue', ['pressKey', 'displayCombo', 'hitFlashes', 'liveNotes', 'showCountdown', 'shownNotes', 'visualElapsed', 'gradeText', 'localFeedback'], () => {}, {},
      { watch: vue.watch, defineProps: () => props }));
    game.pressKey('A', 5000, 1); game.pressKey('J', 5000, 2);
    assert.equal(game.displayCombo.value, 2, '同一帧两键都应增加连击');
    assert.equal(game.hitFlashes.value.length, 2, '两条道保留各自闪光');
    assert.equal(game.liveNotes.value.length, 0, '命中卡片立即消失，不等待回包');
    props.me = { combo: 1, grade: 'perfect', gradeId: 1, keys: [{ noteId: 0, grade: 'perfect' }] };
    props.confirmedInputId = 1; await vue.nextTick();
    assert.equal(game.displayCombo.value, 2, '前一键回包不能覆盖后一键的连击');
    assert.equal(game.localFeedback.value.noteId, 1, '旧回包不能盖住较新按键的反馈');
    props.me = { combo: 2, grade: 'perfect', gradeId: 3, keys: [{ noteId: 9, grade: 'miss', expired: true }, { noteId: 0, grade: 'perfect' }, { noteId: 1, grade: 'perfect' }] };
    props.confirmedInputId = 2; await vue.nextTick();
    assert.equal(game.displayCombo.value, 2, '权威回包不能把两次命中再加一遍');
    assert.equal(game.hitFlashes.value.length, 2, '回包不能重复闪光');
    assert.equal(game.gradeText.value, 'PERFECT', '同一个回包里的旧漏键不能盖住最新命中');
    props.running = false; props.countdown = 2;
    assert.equal(game.showCountdown.value, true);
    assert.equal(game.shownNotes.value.length, 0, '倒计时期间不渲染卡片');
  } finally { scope.stop(); }
});

test('chase reschedules input while another action is busy instead of dropping the draft', async () => {
  const calls = [];
  const game = load('ChaseGame.vue', ['apply', 'draft', 'busy', 'flush'], async (url, options) => {
    calls.push(JSON.parse(options.body));
    return response(snapshot('chase', 'abc'));
  });
  game.apply(snapshot('chase')); game.draft.value = 'abc'; game.busy.value = true;
  await game.flush();
  assert.equal(calls.length, 0);
  assert.equal(game.timers.size, 1);
  game.busy.value = false;
  await game.runTimer();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].text, 'abc');
  assert.equal(game.draft.value, 'abc');
});

test('chase focuses after the countdown when the input is enabled, even if the task id is unchanged', async () => {
  const scope = vue.effectScope();
  try {
    let focused = 0;
    const game = scope.run(() => load('ChaseGame.vue', ['apply', 'running', 'inputEl', 'busy'], async () => response(snapshot('chase')), {}, { watch: vue.watch }));
    game.inputEl.value = { disabled: true, focus() { assert.equal(this.disabled, false); focused++; } };
    // 模拟 Vue 在 post watcher 之前更新 textarea 的 disabled 属性。
    scope.run(() => vue.watch(game.running, running => { game.inputEl.value.disabled = !running; }, { flush: 'pre' }));
    game.apply({ ...snapshot('chase'), phase: 'countdown', startsAt: Date.now() + 3000 });
    await vue.nextTick();
    assert.equal(focused, 0, '倒计时期间输入框应保持禁用');
    game.busy.value = true; game.apply(snapshot('chase'));
    assert.equal(focused, 0, '不能在 DOM 仍禁用时过早聚焦');
    await vue.nextTick();
    assert.equal(focused, 1, '开始后无需再点击输入框');
  } finally { scope.stop(); }
});

test('chase focuses a newly mounted input and the next paragraph without stealing focus on every poll', async () => {
  const scope = vue.effectScope();
  try {
    let focused = 0;
    const game = scope.run(() => load('ChaseGame.vue', ['apply', 'inputEl', 'draft'], async () => response(snapshot('chase')), {}, { watch: vue.watch }));
    game.apply(snapshot('chase'));
    await vue.nextTick();
    game.inputEl.value = { disabled: false, focus() { focused++; } };
    await vue.nextTick();
    assert.equal(focused, 1, '状态先到、输入框后挂载也能自动聚焦');
    game.apply(snapshot('chase'));
    await vue.nextTick();
    assert.equal(focused, 1, '普通轮询不能反复抢回焦点');
    game.draft.value = 'abcdef';
    const next = snapshot('chase'); next.me.task.id = 'task-2';
    game.apply(next); await vue.nextTick();
    assert.equal(focused, 2);
    assert.equal(game.draft.value, '');
  } finally { scope.stop(); }
});

test('chase cancels queued focus if the match finishes before the DOM update', async () => {
  const scope = vue.effectScope();
  try {
    let focused = 0;
    const game = scope.run(() => load('ChaseGame.vue', ['apply', 'inputEl'], async () => response(snapshot('chase')), {}, { watch: vue.watch }));
    game.inputEl.value = { disabled: false, focus() { focused++; } };
    game.apply(snapshot('chase')); game.apply({ ...snapshot('chase'), phase: 'finished' });
    await vue.nextTick();
    assert.equal(focused, 0);
  } finally { scope.stop(); }
});

test('chase refreshes at the countdown boundary and cancels that refresh when the countdown is cancelled', async () => {
  let requests = 0;
  const game = load('ChaseGame.vue', ['apply'], async () => { requests++; return response(snapshot('chase')); });
  const serverNow = Date.now();
  game.apply({ ...snapshot('chase'), phase: 'countdown', serverNow, startsAt: serverNow + 3000 });
  assert.equal(game.timers.size, 1);
  assert.equal([...game.timerDelays.values()][0], 3020);
  await game.runTimer();
  assert.equal(requests, 1);
  game.apply({ ...snapshot('chase'), phase: 'countdown', startsAt: Date.now() + 3000 });
  game.apply({ ...snapshot('chase'), phase: 'waiting' });
  assert.equal(game.timers.size, 0);
});

const raceSnapshot = (typed = '', text = '一起出发') => {
  const data = snapshot('race', typed);
  data.me.task.text = text;
  return data;
};
const raceInputNames = ['sync', 'draft', 'inputValue', 'onInput', 'compositionStart', 'compositionUpdate', 'compositionEnd', 'charClass', 'flush', 'next', 'error', 'soundOn'];
const inputEvent = (value, isComposing = false) => ({ target: { value }, isComposing });

test('race: pinyin candidates stay visible across polling without being judged or submitted', async () => {
  const calls = [];
  const game = load('ArenaGame.vue', raceInputNames, async (url, options) => {
    const body = JSON.parse(options.body); calls.push(body);
    return response(raceSnapshot(body.text));
  }, { mode: 'race' });
  game.soundOn.value = false; game.sync(raceSnapshot());
  game.compositionStart(inputEvent(''));
  game.onInput(inputEvent('yi', true));
  game.sync(raceSnapshot());
  assert.equal(game.inputValue.value, 'yi', '轮询不能清空输入法候选');
  assert.equal(game.draft.value, '');
  assert.equal(game.charClass('一', 0), 'current');
  assert.equal(game.charClass('起', 1), '');
  game.compositionUpdate(inputEvent('yiqi'));
  await game.flush();
  game.next({ preventDefault() { assert.fail('输入法选词回车不能触发换段'); } });
  assert.equal(calls.length, 0);
  assert.equal(game.error.value, '');

  game.compositionEnd(inputEvent('一起'));
  game.onInput(inputEvent('一起')); // 部分浏览器在 compositionend 后再次触发 input。
  assert.equal(game.inputValue.value, '一起');
  assert.equal(game.charClass('一', 0), 'correct');
  assert.equal(game.charClass('起', 1), 'correct');
  await game.flush(); await game.flush();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].text, '一起');
});

test('race: an in-flight response during composition does not lock pinyin into the committed prefix', async () => {
  const calls = [];
  const game = load('ArenaGame.vue', raceInputNames, async (url, options) => {
    const body = JSON.parse(options.body); calls.push(body);
    return response(raceSnapshot(body.text));
  }, { mode: 'race' });
  game.soundOn.value = false; game.sync(raceSnapshot());
  game.onInput(inputEvent('一起'));
  game.compositionStart(inputEvent('一起'));
  game.onInput(inputEvent('一起chufa', true));
  game.sync(raceSnapshot('一起'));
  assert.equal(game.draft.value, '一起');
  assert.equal(game.inputValue.value, '一起chufa');
  assert.equal(game.charClass('出', 2), 'current');
  await game.flush();
  assert.equal(calls.length, 0);
  game.compositionEnd(inputEvent('一起出'));
  await game.flush();
  assert.equal(calls[0].text, '一起出');
});

test('race: final-character pinyin can exceed the paragraph length without being truncated or scored', async () => {
  const calls = [];
  const game = load('ArenaGame.vue', raceInputNames, async (url, options) => {
    calls.push(JSON.parse(options.body));
    return response(raceSnapshot('', '速度'));
  }, { mode: 'race' });
  game.soundOn.value = false; game.sync(raceSnapshot('速', '速度'));
  game.compositionStart(inputEvent('速'));
  game.onInput(inputEvent('速du', true));
  assert.equal(game.inputValue.value, '速du');
  assert.equal(game.charClass('度', 1), 'current');
  await game.flush();
  assert.equal(calls.length, 0);
  game.compositionEnd(inputEvent('速度'));
  await game.flush();
  assert.equal(calls[0].text, '速度');
});

test('race: cancelling composition leaves no mistakes, while a confirmed wrong character is judged', async () => {
  const calls = [];
  const game = load('ArenaGame.vue', raceInputNames, async (url, options) => {
    calls.push(JSON.parse(options.body));
    return response(raceSnapshot('异'));
  }, { mode: 'race' });
  game.soundOn.value = false; game.sync(raceSnapshot());
  game.compositionStart(inputEvent(''));
  game.onInput(inputEvent('yi', true));
  game.compositionEnd(inputEvent(''));
  await game.flush();
  assert.equal(calls.length, 0);
  assert.equal(game.charClass('一', 0), 'current');
  game.compositionStart(inputEvent(''));
  game.onInput(inputEvent('yi', true));
  game.compositionEnd(inputEvent('异'));
  assert.equal(game.charClass('一', 0), 'wrong');
  await game.flush();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].text, '异');
});

test('competition polling preserves local text and corrections made after its snapshot', () => {
  const game = load('CompetitionGame.vue', ['applyEvent', 'eventDraft'], async () => response({}), {}, {
    window: { innerWidth: 1033 }, document: { body: {}, activeElement: null }
  });
  const state = typed => ({ id: 'event-1', status: 'running', mode: 'speed', serverNow: Date.now(),
    round: { id: 'round-1', status: 'running', text: '清晨的校园笼罩着一层薄雾', startsAt: Date.now(), durationMs: 60000 },
    me: { typed }, players: [] });
  game.applyEvent(state('清晨'));
  game.eventDraft.value = '清晨的校园笼罩着一层薄雾';
  game.applyEvent(state('清晨的校园'));
  assert.equal(game.eventDraft.value, '清晨的校园笼罩着一层薄雾');
  game.eventDraft.value = '清晨的校';
  game.applyEvent(state('清晨的校园'));
  assert.equal(game.eventDraft.value, '清晨的校', '旧快照不能撤销本地修改');
  game.applyEvent({ ...state(''), round: { ...state('').round, id: 'round-2' } });
  assert.equal(game.eventDraft.value, '', '新一轮才重置输入');
});

test('battle countdown advances locally while waiting for server confirmation to unlock play', () => {
  const game = load('BattleGame.vue', ['state', 'battleClock', 'serverClockOffset', 'countdownSeconds', 'remaining'], async () => response({}), { competition: true });
  game.serverClockOffset.value = 0;
  game.battleClock.value = 100000;
  game.state.value = { phase: 'countdown', startsAt: 105000, endsAt: 225000, durationMs: 120000 };
  assert.equal(game.countdownSeconds.value, 5);
  assert.equal(game.remaining.value, '00:05');
  game.battleClock.value = 103100;
  assert.equal(game.countdownSeconds.value, 2);
  assert.equal(game.remaining.value, '00:02');
  game.battleClock.value = 105200;
  assert.equal(game.countdownSeconds.value, 0);
  assert.equal(game.state.value.phase, 'countdown', '本地倒计时归零不能擅自解锁输入');
  game.state.value = { ...game.state.value, phase: 'running' };
  assert.equal(game.remaining.value, '02:00');
});

test('battle performance announcements preserve an ongoing draft and never take input focus', async () => {
  let broadcasts = [];
  const packet = () => ({ phase: 'running', round: 'round-1', serverNow: Date.now(), me: { id: 1, team: 'red' }, events: [], broadcasts });
  const game = load('BattleGame.vue', ['refresh', 'state', 'task', 'input', 'inputEl', 'globalAnnouncement', 'connected'], async () => response(packet()));
  game.state.value = packet();
  game.task.value = { id: 'task-1', text: '清晨的校园笼罩着一层薄雾', progress: 0 };
  game.input.value = '清晨的校园';
  let focused = 0;
  game.inputEl.value = { focus() { focused++; } };
  await game.refresh();
  broadcasts = [{ id: 'notice-1', team: 'red', title: '刷新本局最快段落', detail: '第 1 段用时 30 秒' }];
  await game.refresh();
  assert.equal(game.globalAnnouncement.value.id, 'notice-1');
  assert.equal(game.input.value, '清晨的校园');
  assert.equal(game.task.value.id, 'task-1');
  assert.equal(game.connected.value, true);
  assert.equal(focused, 0);
});

test('competition frontend submits later correct positions after mistakes and previews combo and accuracy', async () => {
  const calls=[];
  const game=load('BattleGame.vue',['state','task','input','handleBattleInput','sendCharacterBatch','canAttackCharacter','myCombo','myMultiplier','localBattleStats','characterState'], async (url,options)=>{
    calls.push(JSON.parse(options.body));
    return response({phase:'running',round:'r1',inputRules:{allowMistakes:true},me:{id:1,team:'red',correct:8,attempted:9,combo:2,multiplier:1},players:[]});
  }, {competition:true});
  game.state.value={phase:'running',round:'r1',inputRules:{allowMistakes:true},me:{id:1,team:'red',correct:6,attempted:6,combo:6,multiplier:1.5}};
  game.task.value={id:'t1',text:'abcdefghijklm',progress:6,typed:'abcdef'};
  game.input.value='abcdefx';game.handleBattleInput();
  assert.equal(game.myCombo.value,0);assert.equal(game.myMultiplier.value,1);assert.equal(game.localBattleStats.value.accuracy,86);
  game.input.value='abcdefxhi';game.handleBattleInput();
  assert.equal(game.canAttackCharacter.value,true);assert.equal(game.myCombo.value,2);
  await game.sendCharacterBatch();
  assert.equal(calls[0].text,'abcdefxhi');
  assert.equal(game.task.value.progress,9);assert.equal(game.task.value.typed,'abcdefxhi');
  assert.equal(game.characterState('g',6).wrong,true,'已提交的错字仍须标红');
  assert.equal(game.myCombo.value,2);assert.equal(game.localBattleStats.value.accuracy,89);
  game.input.value='abcdefghi';game.handleBattleInput();
  assert.equal(game.input.value,'abcdefxhi','已经结算的错字不能改成正确字后再计分');
});
