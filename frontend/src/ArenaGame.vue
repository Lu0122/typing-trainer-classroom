<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ArrowLeft, BarChart3, ChevronDown, CirclePlus, Flag, Gamepad2, Keyboard, Languages, Lightbulb, Medal, Music2, Play, Radio, Timer, Trophy, Users, Volume2, VolumeX } from 'lucide-vue-next';
import RhythmBoard from './RhythmBoard.vue';
import RaceBoard from './RaceBoard.vue';
const props = defineProps({ user: Object, mode: { type: String, required: true } });
const emit = defineEmits(['back', 'login']);
const state = ref(null), draft = ref(''), error = ref(''), online = ref(true), busy = ref(false), clock = ref(Date.now());
const inviteCode = ref(''), inviteMessage = ref('');
const inputEl = ref(null), exitDialog = ref(null), backButton = ref(null), feedback = ref('');
let reading = null, stopped = false, composing = false, wantsNext = false, cleanLeave = false;
// 赛车输入的本地草稿不能被较旧的轮询快照覆盖。draftTaskId/draftDirty
// 用来区分“服务器已确认的字”和“正在等待提交的字”。
let draftTaskId = null, draftDirty = false;
let poll, clockTimer, sendTimer, feedbackTimer, launchTimer, offset = 0;
const race = computed(() => props.mode === 'race');
const title = computed(() => race.value ? '打字赛车' : '字母音游');
const me = computed(() => state.value?.me), task = computed(() => me.value?.task);
const running = computed(() => state.value?.phase === 'running');
// 音游谱面与判定参数（服务端下发，同局所有人一致）。
const chart = computed(() => state.value?.chart || null);
const judgement = computed(() => state.value?.judgement || null);
const selectedDifficulty = computed(() => String(me.value?.difficulty || 'easy').toLowerCase());
const difficultyLabel = computed(() => ({ easy: '简单', normal: '普通', hard: '困难' })[selectedDifficulty.value] || '简单');
const difficultyHint = computed(() => ({ easy: '下落 6.8 秒 · 音符减少', normal: '标准速度 · 标准谱面', hard: '快速下落 · 判定更严格' })[selectedDifficulty.value] || '下落 6.8 秒 · 音符减少');
// 判定线位置：方块在 fallMs 内从顶部落到此处，落到即为该按键的时刻。
// 判定线留出底部离场空间；方块抵达这里的瞬间与服务端的 note.at 完全一致。
const JUDGE_RATIO = 0.76;
// 与服务端判定对齐的「相对开局」毫秒数。
// 服务端只下发 elapsed（相对开局的毫秒）与 serverNow，不下发 startedAt，
// 所以用 elapsed 作为基准，再用本地时钟推进量外推两次轮询之间的时间，
// 避免轮询间隔（1s）造成方块一跳一跳。
const elapsed = computed(() => {
  const data = state.value; if (!data || data.elapsed == null) return 0;
  return Math.max(0, data.elapsed + (clock.value - data.serverNow) + offset);
});
// 音游进行中隐藏文字输入面板，改为全键位捕获。
const rhythmLive = computed(() => !race.value && running.value);
const remaining = computed(() => {
  const end = state.value?.phase === 'waiting' ? state.value.startsAt : state.value?.phase === 'finished' ? state.value.result.endedAt + 15000 : state.value?.endsAt;
  return end ? Math.max(0, Math.ceil((end - clock.value - offset) / 1000)) : 0;
});
const time = computed(() => `${String(Math.floor(remaining.value / 60)).padStart(2, '0')}:${String(remaining.value % 60).padStart(2, '0')}`);
const results = computed(() => state.value?.result?.ranking || []);
const resultLabel = computed(() => {
  if (!state.value?.result?.winners.length) return '这一局结束了，再来一次';
  return state.value.result.winners.map(p => p.name).join('、') + (race.value && state.value.result.outcome === 'finish' ? ' 率先冲线！' : ' 获得本局第一！');
});
// ── 赛车页面专用 ────────────────────────────────────────────────
const isHost = computed(() => state.value?.host === props.user?.id);
const statusText = computed(() => state.value?.phase === 'running' ? '比赛进行中' : state.value?.phase === 'finished' ? '本局结算' : state.value?.startsAt ? '发车准备' : '等待房主发车');
const raceLaunch = computed(() => {
  if (!race.value || state.value?.phase !== 'waiting' || !state.value?.startsAt || !state.value?.launchRequestedAt) return null;
  const leftMs = Math.max(0, state.value.startsAt - (clock.value + offset));
  return { phase: 'countdown', value: Math.max(1, Math.ceil(leftMs / 1000)) };
});
const isFull = computed(() => (state.value?.players.length || 0) >= (state.value?.capacity || 4));
const readyCount = computed(() => state.value?.readyCount || 0);
const allReady = computed(() => !!state.value?.allReady);
const myReady = computed(() => !!me.value?.ready);
// 1 格 = 5 m：160 格的赛程对外展示为 800 m，跟赛道示意保持同一个口径。
const trackMeters = computed(() => Math.round((state.value?.target || 160) * 5));
// 结束后不等待 15 秒冷却：直接退房重新匹配，开下一局。
async function rematch() { if (me.value) await act('/leave', { seat: me.value.seat }); await refresh(); }
// 创建房间：退出当前房，开一间全新房（邀请朋友专用；平时进入页面走自动匹配）。
async function createRoom() {
  if (!props.user) return emit('login');
  inviteMessage.value = '';
  await act('/create', {});
}
async function autoMatch() {
  if (!props.user) return emit('login');
  inviteMessage.value = '';
  await act('/join', {});
}
async function joinByCode() {
  if (!props.user) return emit('login');
  const code = inviteCode.value.trim();
  if (!/^\d{4,8}$/.test(code)) { inviteMessage.value = '请输入 4—8 位数字邀请码'; return; }
  inviteMessage.value = '';
  await act('/join-code', { code });
}
async function toggleRaceReady() {
  if (!me.value || isHost.value || state.value?.phase !== 'waiting' || state.value?.startsAt) return;
  await act('/ready', { seat: me.value.seat, ready: !myReady.value });
}
async function copyRoomCode() {
  const code = String(state.value?.roomNo || '');
  if (!code) return;
  try { await navigator.clipboard.writeText(code); inviteMessage.value = `邀请码 ${code} 已复制`; }
  catch { inviteMessage.value = `邀请码：${code}`; }
}
// 页脚快捷键：等待发车时按 Enter 立即开始（仅房主），任意时刻 Esc 返回大厅。
function onRaceKeydown(event) {
  if (!race.value || !props.user) return;
  if (event.key === 'Escape') { if (!exitDialog.value?.open) requestExit(); return; }
  if (event.key !== 'Enter') return;
  if (state.value?.phase !== 'waiting' || state.value?.startsAt || !isHost.value || exitDialog.value?.open) return;
  event.preventDefault();
  if (!busy.value) act('/start', { seat: me.value?.seat });
}

// ── 音效：打对字一声轻响，升档音调更高，打错是低音提示 ────────────
// 用最小的 WebAudio 振荡器实现，不引入音频资源；关掉开关后完全静音。
let audioCtx = null;
const soundOn = ref(true);
function beep(freq, dur = 0.05, gain = 0.035) {
  if (!soundOn.value) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator(), vol = audioCtx.createGain(), t = audioCtx.currentTime;
    osc.type = 'triangle'; osc.frequency.value = freq;
    vol.gain.setValueAtTime(gain, t);
    vol.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(vol); vol.connect(audioCtx.destination);
    osc.start(t); osc.stop(t + dur);
  } catch { /* 音频不可用时不影响游戏 */ }
}

async function api(path = '', body) {
  const lobbyQuery = body === undefined && !path && race.value ? '?lobby=1' : '';
  const r = await fetch(`/api/arena/${props.mode}${path}${lobbyQuery}`, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(7000) });
  const data = await r.json(); if (!r.ok) throw Object.assign(new Error(data.message || '请求失败'), { status: r.status }); return data;
}
function sync(data) {
  if (stopped) return;
  const old = me.value, oldTask = task.value?.id, oldRound = state.value?.round;
  if (!online.value) error.value = '';
  state.value = data; online.value = true; offset = data.serverNow - Date.now(); clock.value = Date.now();
  clearTimeout(launchTimer); launchTimer = null;
  // 倒计时结束点主动拉一次权威状态，不依赖下一次轮询；请求失败仍由常规轮询重试。
  if (race.value && data.phase === 'waiting' && data.startsAt) {
    launchTimer = setTimeout(() => { launchTimer = null; refresh(); }, Math.max(0, data.startsAt - data.serverNow + 40));
  }
  const incomingTaskId = data.me?.task?.id || null;
  const incomingTyped = data.me?.task?.typed || '';
  const sameLocalTask = draftTaskId && draftTaskId === incomingTaskId;
  const localDraft = draft.value;
  const shouldResetDraft = oldRound !== data.round || (oldTask !== incomingTaskId && !sameLocalTask);
  if (shouldResetDraft) {
    draft.value = incomingTyped; draftTaskId = incomingTaskId; draftDirty = false; wantsNext = false; error.value = '';
    if (data.me?.task && data.phase === 'running' && !exitDialog.value?.open) nextTick(() => inputEl.value?.focus({ preventScroll: true }));
  } else if (!composing) {
    // 服务器快照可能比输入请求晚到；只允许它确认/推进文字，不能把本地较长草稿截短。
    draftTaskId = incomingTaskId;
    if (!draftDirty || localDraft === incomingTyped || incomingTyped.startsWith(localDraft)) {
      draft.value = incomingTyped;
      draftDirty = false;
    } else if (localDraft.startsWith(incomingTyped)) {
      draft.value = localDraft;
    } else {
      // 发生短暂乱序时保留本地新增部分，避免输入框闪回空值；下一次提交会以当前题目重新校正。
      draft.value = `${incomingTyped}${localDraft.slice(Math.min(localDraft.length, incomingTyped.length))}`;
    }
  }
  // 如果上一次请求断线，保留尚未被服务端确认的输入，并在重新连上后继续同步。
  if (race.value && data.phase === 'running' && data.me?.task && !busy.value && draft.value.length > data.me.task.typed.length) {
    clearTimeout(sendTimer); sendTimer = setTimeout(flush, 120);
  }
  if (old && data.me && old.seat === data.me.seat && data.me.attempted > old.attempted) {
    const gained = data.me.correct - old.correct;
    // 赛车反馈要讲「速度」而不是「得分」：档位变化是最值得播报的事件。
    if (race.value) {
      const gearUp = data.me.gear > (old.gear || 1);
      const gearDown = data.me.gear < (old.gear || 1);
      if (gearUp) { feedback.value = `升档 · ${data.me.gear} 档 ×${data.me.gearMultiplier}`; beep(700 + data.me.gear * 70, 0.07, 0.045); }
      else if (gearDown) { feedback.value = `降档 · 掉到 ${data.me.gear} 档，稳住节奏`; beep(210, 0.1, 0.05); }
      else if (gained > 0) { feedback.value = `提速 · ${data.me.speedKmh} km/h`; beep(520 + (data.me.gear || 1) * 40, 0.045); }
      else { feedback.value = '打错了，车速下降'; beep(170, 0.12, 0.05); }
    } else {
      feedback.value = data.me.attempted - old.attempted > gained ? '连击中断 · 继续加油' : `连击得分 +${data.me.score - old.score}`;
    }
    clearTimeout(feedbackTimer); feedbackTimer = setTimeout(() => { feedback.value = ''; }, 1300);
  }
}
async function refresh() {
  if (!props.user || stopped || busy.value || reading) return;
  reading = (async () => { try { sync(await api()); } catch (e) { online.value = false; error.value = e.message; } })();
  await reading; reading = null;
}
async function act(path, body = {}) {
  if (reading) await reading;
  if (busy.value || stopped) return;
  busy.value = true; error.value = '';
  try { sync(await api(path, body)); } catch (e) { error.value = e.message; online.value = !!e.status; } finally { busy.value = false; }
}
function join() { if (!props.user) emit('login'); else act('/join'); }
async function chooseDifficulty(difficulty) {
  if (race.value) return;
  if (!props.user) return emit('login');
  if (!me.value) await act('/join');
  if (!me.value || state.value?.phase !== 'waiting') return;
  await act('/chooseDifficulty', { seat: me.value.seat, difficulty });
}
function onInput(event) {
  if (!task.value) return;
  const candidate = String(event.target.value || '').slice(0, task.value.text.length);
  // 中文输入法的拼音组合文本也要先存进本地草稿；这里只更新画面，不提交到服务器。
  // 否则轮询触发 Vue 重绘时，受控 textarea 会把输入法候选中的 yi/yiqi 清空。
  if (composing || event.isComposing) {
    draft.value = candidate;
    draftTaskId = task.value.id;
    draftDirty = true;
    return;
  }
  const locked = task.value.typed;
  const local = draft.value.startsWith(locked) ? draft.value : locked;
  // 输入法组合、轮询重绘或浏览器延迟更新可能暂时给到一个较短值。
  // 保留本地草稿并恢复 DOM，不把它当成修改已结算文字，也不清空输入框。
  if (!candidate.startsWith(local)) {
    draft.value = local;
    nextTick(() => { if (inputEl.value && inputEl.value.value !== local) inputEl.value.value = local; });
    return;
  }
  draft.value = candidate.slice(0, task.value.text.length);
  draftTaskId = task.value.id; draftDirty = true;
  clearTimeout(sendTimer); sendTimer = setTimeout(flush, 160);
}
function compositionEnd() {
  composing = false;
  // compositionend 后再读一次 textarea，避免拿到输入法尚未提交的旧值。
  window.setTimeout(() => { if (inputEl.value) onInput({ target: inputEl.value }); }, 0);
}
function compositionUpdate(event) {
  if (!task.value) return;
  draft.value = String(event.target.value || '').slice(0, task.value.text.length);
  draftTaskId = task.value.id;
  draftDirty = true;
}
async function flush() {
  if (reading) await reading;
  if (stopped || composing || !task.value || !running.value) return;
  if (busy.value) { sendTimer = setTimeout(flush, 200); return; }
  if (draft.value.length > task.value.typed.length) {
    busy.value = true;
    const submittedTaskId = task.value.id;
    const submittedText = draft.value.slice(0, task.value.typed.length + 16);
    try {
      sync(await api('/type', { seat: me.value.seat, ticket: submittedTaskId, text: submittedText }));
      if (draftTaskId === submittedTaskId && draft.value === task.value?.typed) draftDirty = false;
      error.value = '';
    }
    catch (e) {
      error.value = e.message; wantsNext = false; online.value = !!e.status;
      if (e.status === 409) { try { sync(await api()); } catch { online.value = false; } }
      else if (e.status === 429) { sendTimer = setTimeout(flush, 350); }
      return;
    } finally { busy.value = false; }
    if (task.value && running.value && draft.value.length > task.value.typed.length) { sendTimer = setTimeout(flush, 220); return; }
  }
  if (wantsNext && running.value && task.value?.typed.length === task.value?.text.length) {
    wantsNext = false; await act('/next', { seat: me.value.seat, ticket: task.value.id });
  }
}
function next(event) {
  if (composing || event?.isComposing || event?.keyCode === 229) return;
  event?.preventDefault();
  if (!task.value || draft.value.length !== task.value.text.length) { error.value = '完整输入一段后，再按回车继续。'; return; }
  wantsNext = true; clearTimeout(sendTimer); flush();
}
function charClass(char, i) { return i < draft.value.length ? (draft.value[i] === char ? 'correct' : 'wrong') : i === draft.value.length ? 'current' : ''; }

// ── 音游按键采集 ────────────────────────────────────────────────
// 每次按键记录「相对开局的毫秒偏移」并先入本地缓冲，再攒成批次上报。
// 用本地时间戳而不是发送时刻，判定才不受网络往返影响；
// 攒批则避免每个字母都发一次请求（26 键全开放时按键非常密集）。
const keyBuffer = ref([]);
let flushTimer = null;
const KEYS_MAX = 32;        // 与服务端 RHYTHM_KEYS_MAX 一致
const FLUSH_MS = 130;       // 攒批窗口：短到玩家感觉不到延迟，长到能合并连续按键
// 本地按键 → 相对开局的偏移。必须用与服务端判定完全同一条时间轴：
// 以服务端本次下发的 elapsed 为锚点，加上「此刻」相对该次下发时刻的本地推进量。
// 若直接用 now - startedAt 会因 startedAt 未下发而得到 NaN。
function toElapsed() {
  const data = state.value;
  if (!data || data.elapsed == null) return 0;
  return Math.max(0, Math.round(data.elapsed + (Date.now() - data.serverNow) + offset));
}
function onKeydown(event) {
  if (!rhythmLive.value) return;
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  const key = event.key;
  if (key.length !== 1 || !/[a-zA-Z]/.test(key)) return;
  event.preventDefault();
  keyBuffer.value.push({ key: key.toUpperCase(), at: toElapsed() });
  // 缓冲满了立刻发，避免超过服务端单包上限被拒。
  if (keyBuffer.value.length >= KEYS_MAX) { clearTimeout(flushTimer); flushTimer = null; flushKeys(); return; }
  if (!flushTimer) flushTimer = setTimeout(() => { flushTimer = null; flushKeys(); }, FLUSH_MS);
}
async function flushKeys() {
  if (stopped || !keyBuffer.value.length || !me.value) return;
  const keys = keyBuffer.value.splice(0, KEYS_MAX);
  try {
    sync(await api('/press', { seat: me.value.seat, keys }));
    error.value = '';
  } catch (e) {
    error.value = e.message; online.value = !!e.status;
    // 身份失效（换局/被移除）时直接丢弃缓冲，避免无限重试堆积。
    if (e.status === 409 || e.status === 403) keyBuffer.value.length = 0;
  }
}
function requestExit() { if (me.value && state.value.phase !== 'finished') exitDialog.value.showModal(); else exit(); }
async function exit() {
  if (reading) await reading;
  if (busy.value) { error.value = '正在同步输入，请稍后退出。'; return; }
  busy.value = true;
  try { if (me.value) await api('/leave', { seat: me.value.seat }); cleanLeave = true; stopped = true; exitDialog.value?.close(); emit('back'); }
  catch (e) { error.value = '退出失败，请重试：' + e.message; } finally { busy.value = false; }
}
watch(() => props.user?.id, refresh);
onMounted(() => {
  refresh(); poll = setInterval(refresh, 1000);
  clockTimer = setInterval(() => { clock.value = Date.now(); }, 250);
  // 音游用全局键盘监听：26 键全开放，且不允许输入法参与。
  // 赛车用另一个全局监听：Enter 发车 / Esc 返回（对应页脚快捷键提示）。
  window.addEventListener('keydown', onKeydown);
  window.addEventListener('keydown', onRaceKeydown);
});
onBeforeUnmount(() => {
  stopped = true; clearInterval(poll); clearInterval(clockTimer); clearTimeout(sendTimer); clearTimeout(feedbackTimer); clearTimeout(flushTimer); clearTimeout(launchTimer);
  window.removeEventListener('keydown', onKeydown);
  window.removeEventListener('keydown', onRaceKeydown);
  if (!cleanLeave && me.value) fetch(`/api/arena/${props.mode}/leave`, { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seat: me.value.seat }) }).catch(() => {});
});
</script>

<template>
  <div class="arena-game" :class="race ? 'is-race' : 'is-rhythm'">
    <header class="arena-header"><button ref="backButton" class="arena-back" @click="requestExit"><ArrowLeft :size="17"/>{{ race ? '返回大厅' : '返回大厅' }}</button><div class="arena-brand"><Flag v-if="race" :size="24"/><Music2 v-else :size="24"/><strong>{{ title }}<small>{{ race ? 'TYPE & DRIVE' : 'HIT THE LETTERS' }}</small></strong></div><nav v-if="!race" class="rhythm-topnav" aria-label="游戏模式"><span class="is-active"><Gamepad2 :size="17"/>练习模式</span><span><Trophy :size="17"/>挑战模式</span><span><BarChart3 :size="17"/>排行榜</span></nav><div class="arena-room-status"><span v-if="race">房间：{{ state?.roomNo ?? '--' }}</span><span v-else>{{ state?.phase === 'running' ? '等级荣誉' : '等待来袭' }}</span><span><Users :size="15"/>{{ state?.players.length || 0 }}/{{ state?.capacity || (race ? 4 : 60) }}</span><b><Timer :size="17"/>{{ race && state?.phase === 'waiting' ? '00:00' : time }}</b></div></header>
    <main class="arena-layout">
      <section class="arena-stage">
        <template v-if="race">
          <header class="rg-head">
            <div class="rg-head-copy">
              <h1>打字提速，冲向终点！</h1>
              <p>输入文字，让你的赛车一路狂飙！</p>
            </div>
            <div class="rg-chips">
              <span class="rg-chip">赛道长度: {{ trackMeters }} m</span>
              <span class="rg-chip">剩余时间: {{ running ? remaining : state?.durationSeconds || 120 }} s</span>
            </div>
          </header>
          <!-- 四道赛道：每人一条道，颜色跟人走，行序按名次实时排列 -->
          <RaceBoard :players="state?.players || []" :target="state?.target || 160" :running="running"
            :waiting="state?.phase === 'waiting'" :capacity="state?.capacity || 4" :user-id="props.user?.id" />
          <div v-if="raceLaunch" class="rg-launch-overlay" :class="`is-${raceLaunch.phase}`" role="status" aria-live="assertive"><span>{{ raceLaunch.phase === 'prepare' ? '准备' : '倒计时' }}</span><strong>{{ raceLaunch.value }}</strong><small>{{ raceLaunch.phase === 'prepare' ? '秒后进入发车倒计时' : '保持专注，即将发车' }}</small></div>
        </template>
        <template v-else>
          <header class="rhythm-hero">
            <div>
              <h1><span>跟着节奏，</span><em>敲准每一个字母！</em></h1>
              <p>音乐 + 打字 = 更有趣的练习体验</p>
            </div>
            <div class="rhythm-difficulty" :aria-label="`当前难度：${difficultyLabel}`">
              <small>难度选择 · {{ difficultyLabel }} · {{ difficultyHint }}</small>
              <div><button type="button" :class="{ 'is-selected': selectedDifficulty === 'easy' }" :aria-pressed="selectedDifficulty === 'easy'" :disabled="running || busy" @click="chooseDifficulty('easy')">简单</button><button type="button" :class="{ 'is-selected': selectedDifficulty === 'normal' }" :aria-pressed="selectedDifficulty === 'normal'" :disabled="running || busy" @click="chooseDifficulty('normal')">普通</button><button type="button" :class="{ 'is-selected': selectedDifficulty === 'hard' }" :aria-pressed="selectedDifficulty === 'hard'" :disabled="running || busy" @click="chooseDifficulty('hard')">困难</button></div>
            </div>
          </header>
          <RhythmBoard :chart="chart" :judgement="judgement" :me="me" :running="running" :elapsed="elapsed" :judge-ratio="JUDGE_RATIO" />
        </template>
        <p v-if="feedback" class="arena-hit-feedback" role="status">{{ feedback }}</p>
      </section>

      <aside v-if="race" class="arena-board">
        <template v-if="race">
          <header class="rg-side-head">
            <span class="rg-status-label"><i class="rg-dot" :data-phase="state?.phase || 'waiting'"></i>{{ statusText }}</span>
            <Users :size="18"/>
          </header>
          <button v-if="!props.user" class="arena-primary rg-join" @click="join"><Flag :size="16"/>登录后选择比赛模式</button>
          <template v-else-if="!me && state?.phase === 'waiting'">
            <div class="rg-match-choice">
              <button class="arena-primary rg-join" :disabled="busy" @click="autoMatch"><Flag :size="16"/><span><strong>自动匹配</strong><small>加入等待中的公共房间</small></span></button>
              <button class="arena-secondary rg-create" :disabled="busy" @click="createRoom"><CirclePlus :size="16"/><span><strong>创建好友房</strong><small>生成邀请码，邀请同学</small></span></button>
              <div class="rg-code-entry"><label for="race-invite-code">输入邀请码加入</label><div><input id="race-invite-code" v-model.trim="inviteCode" inputmode="numeric" maxlength="8" placeholder="例如 1024" @keydown.enter="joinByCode"/><button type="button" :disabled="busy" @click="joinByCode">加入</button></div></div>
            </div>
            <p v-if="inviteMessage" class="rg-invite-message" role="status">{{ inviteMessage }}</p>
          </template>
          <template v-else-if="state?.phase === 'waiting'">
            <button class="arena-secondary rg-room-code" type="button" @click="copyRoomCode"><span>房间邀请码</span><strong>{{ state?.roomNo }}</strong><small>点击复制</small></button>
            <p v-if="inviteMessage" class="rg-invite-message" role="status">{{ inviteMessage }}</p>
            <p class="rg-countdown">{{ state?.startsAt ? '发车流程已开始' : isHost ? (allReady ? '所有选手已准备，可以发车' : `${readyCount}/${state?.players.length || 0} 已准备，等待其他选手`) : (myReady ? '你已准备，等待房主发车' : '点击下方按钮准备') }}</p>
          </template>
          <button v-else-if="state?.phase === 'finished'" class="arena-primary rg-join" :disabled="busy" @click="rematch"><Flag :size="16"/>再来一局</button>
          <div class="rg-room">
            <div v-if="(state?.players.length || 0) <= 1" class="rg-invite">
              <svg class="rg-flags" viewBox="0 0 96 66" aria-hidden="true">
                <g stroke="#c8cdd3" stroke-width="3" stroke-linecap="round">
                  <line x1="26" y1="6" x2="70" y2="60"/><line x1="70" y1="6" x2="26" y2="60"/>
                </g>
                <g>
                  <rect x="26" y="6" width="9" height="9" fill="#3a4149"/><rect x="44" y="6" width="9" height="9" fill="#3a4149"/>
                  <rect x="35" y="6" width="9" height="9" fill="#f2f5f8"/><rect x="53" y="6" width="9" height="9" fill="#f2f5f8"/>
                  <rect x="35" y="15" width="9" height="9" fill="#3a4149"/><rect x="53" y="15" width="9" height="9" fill="#3a4149"/>
                  <rect x="26" y="15" width="9" height="9" fill="#f2f5f8"/><rect x="44" y="15" width="9" height="9" fill="#f2f5f8"/>
                </g>
                <g>
                  <rect x="61" y="6" width="9" height="9" fill="#3a4149"/><rect x="43" y="6" width="9" height="9" fill="#3a4149"/>
                  <rect x="52" y="6" width="9" height="9" fill="#f2f5f8"/><rect x="34" y="6" width="9" height="9" fill="#f2f5f8"/>
                  <rect x="52" y="15" width="9" height="9" fill="#3a4149"/><rect x="34" y="15" width="9" height="9" fill="#3a4149"/>
                  <rect x="61" y="15" width="9" height="9" fill="#f2f5f8"/><rect x="43" y="15" width="9" height="9" fill="#f2f5f8"/>
                </g>
              </svg>
              <strong>还没有同学加入</strong>
              <p>快来邀请朋友一起比赛吧！</p>
            </div>
            <ol v-else class="rg-room-list">
              <li v-for="p in state.players" :key="p.seat" :class="{ 'is-self': p.id === props.user?.id }">
                <span class="rg-room-avatar"><img v-if="p.avatarUrl" :src="p.avatarUrl" alt=""/><i v-else>{{ p.name.slice(0, 1) }}</i></span>
                <div><strong>{{ p.name }}<small v-if="p.id === props.user?.id">（我）</small><em v-if="!running" class="rg-ready-state" :class="{ 'is-ready': p.ready || p.id === state?.host }">{{ p.id === state?.host ? '房主' : p.ready ? '已准备' : '未准备' }}</em></strong><span>{{ running ? `${p.distance} 格 · ${p.speedKmh} km/h` : '等待发车' }}</span></div>
                <b v-if="running">No.{{ p.rank }}</b>
              </li>
            </ol>
          </div>
          <div class="rg-stats">
            <span>我的名次<strong>{{ running || state?.phase === 'finished' ? (me ? '第 ' + me.rank + ' 名' : '--') : '--' }}</strong></span>
            <span>最高速度<strong>{{ me ? me.topSpeedKmh + ' km/h' : '--' }}</strong></span>
          </div>
        </template>
      </aside>

      <aside v-if="!race" class="arena-sidebar" aria-label="音游辅助信息">
        <section class="arena-board arena-live-panel">
          <header><strong><Radio :size="19"/>实时对战</strong><small><i></i>在线玩家 {{ state?.players.length || 0 }}/{{ state?.capacity || 60 }}</small></header>
          <button v-if="!props.user" class="arena-primary" @click="join"><Gamepad2 :size="18"/>登录并参赛</button>
          <button v-else-if="!me && state?.phase === 'waiting'" class="arena-primary" :disabled="busy" @click="join"><Gamepad2 :size="18"/>加入音游挑战</button>
          <div v-if="me && state?.phase === 'waiting'" class="arena-gather"><strong>{{ remaining }} 秒后自动开始</strong><p>等待同学一起加入。</p><button v-if="state.host === props.user?.id" class="arena-secondary" :disabled="busy" @click="act('/start', { seat: me.seat })">{{ state.players.length === 1 ? '单人试练' : '立即开始' }}</button></div>
          <p v-if="!me && running" class="arena-observer">正在观战。开赛后不再加入，请等下一局。</p>
          <p v-if="!running && !me" class="arena-invite-note">还没有同学对战，快来邀请朋友一起挑战吧！</p>
        </section>
        <section class="arena-board arena-leader-panel">
          <header><strong><Medal :size="19"/>今日排行榜</strong><small>实时更新</small></header>
          <ol class="arena-ranking"><li v-for="p in state?.players || []" :key="p.seat" :class="{ 'is-self': p.id === props.user?.id }"><span class="arena-rank">{{ p.rank }}</span><div><strong>{{ p.name }}<small v-if="p.id === props.user?.id">你</small></strong><span>{{ p.accuracy }}% 准确率 · Perfect {{ p.counts?.perfect || 0 }}</span></div><b>{{ p.score }}<small>分</small></b></li><li v-if="!state?.players.length" class="arena-empty">暂无成绩<br/><small>完成一局即可登榜</small></li></ol>
          <div v-if="me" class="arena-personal"><span>PERFECT<strong>{{ me.counts?.perfect || 0 }}</strong></span><span>MISS<strong>{{ me.counts?.miss || 0 }}</strong></span></div>
        </section>
        <section class="arena-board arena-tips-panel">
          <header><strong><Lightbulb :size="19"/>游戏小贴士</strong></header>
          <ol><li><b>1</b><span>跟着节奏，按下对应的字母键</span></li><li><b>2</b><span>连击越多，得分越高</span></li><li><b>3</b><span>尽量获得 <strong>PERFECT</strong> 评价</span></li></ol>
        </section>
      </aside>

      <section v-if="race" class="arena-input-panel rg-panel">
        <template v-if="state?.phase === 'finished'"><div class="arena-result-heading"><Trophy :size="32"/><div><span class="arena-eyebrow">{{ state.result.outcome === 'finish' ? '冲线成功' : '本局结算' }}</span><h2>{{ resultLabel }}</h2><p>{{ state.result.durationSeconds }} 秒 · {{ remaining }} 秒后开放下一局</p></div></div><div class="arena-podium"><article v-for="p in results.slice(0,3)" :key="p.seat"><span>第 {{ p.rank }} 名</span><strong>{{ p.name }}</strong><b>{{ p.distance }} 格</b><small>{{ p.accuracy }}% 准确率 · 峰值 {{ p.topSpeedKmh }} km/h</small></article></div><p v-if="!results.length">所有参赛者已离开，下一局重新集结。</p></template>
        <template v-else>
          <header class="rg-panel-head">
            <strong class="rg-panel-title"><Keyboard :size="16"/>输入区域</strong>
            <div class="rg-panel-metas">
              <span class="rg-meta"><Languages :size="13"/>中文模式<ChevronDown :size="13"/></span>
              <button type="button" class="rg-meta rg-sound" :aria-pressed="soundOn" @click="soundOn = !soundOn"><Volume2 v-if="soundOn" :size="13"/><VolumeX v-else :size="13"/>音效{{ soundOn ? '开' : '关' }}<ChevronDown :size="13"/></button>
            </div>
          </header>
          <div v-if="task && running" class="arena-target rg-target"><span v-for="(char,index) in task.text" :key="index" :class="charClass(char,index)">{{ char }}</span></div>
          <div class="arena-input-row rg-input-row">
            <textarea id="arena-input" ref="inputEl" :value="draft" :maxlength="task?.text.length" :disabled="!task || !running || !online" @compositionstart="composing = true" @compositionupdate="compositionUpdate" @compositionend="compositionEnd" @input="onInput" @keydown.enter="next" @paste.prevent @drop.prevent autocomplete="off" spellcheck="false" placeholder="点击这里，开始输入文字…"></textarea>
            <button v-if="state?.phase === 'waiting'" class="rg-go" :class="{ 'is-ready-toggle': !isHost }" :disabled="busy || !me || !!state?.startsAt || (isHost && !allReady)" @click="isHost ? act('/start', { seat: me.seat }) : toggleRaceReady()"><strong><Play :size="16"/>{{ state?.startsAt ? '准备发车中' : isHost ? '开始发车' : myReady ? '取消准备' : '准备' }}</strong><small>{{ state?.startsAt ? '赛道上正在倒计时' : isHost ? (allReady ? '所有人已准备，点击开始' : `${readyCount}/${state?.players.length || 0} 已准备`) : myReady ? '点击取消自己的准备状态' : '点击后等待房主开始' }}</small></button>
          </div>
        </template>
        <p v-if="error || !online" class="arena-error" role="status">{{ error || '连接中断，正在重试…' }}<button v-if="!online" class="arena-secondary" @click="refresh">重试连接</button></p>
      </section>

      <section v-else-if="state?.phase === 'finished'" class="arena-input-panel is-cover">
        <div class="arena-result-heading"><Trophy :size="32"/><div><span class="arena-eyebrow">本局结算</span><h2>{{ resultLabel }}</h2><p>{{ state.result.durationSeconds }} 秒 · {{ remaining }} 秒后开放下一局</p></div></div>
        <div class="arena-podium"><article v-for="p in results.slice(0,3)" :key="p.seat"><span>第 {{ p.rank }} 名</span><strong>{{ p.name }}</strong><b>{{ p.score }} 分</b><small>{{ p.accuracy }}% 准确率 · Perfect {{ p.counts?.perfect || 0 }}</small></article></div>
        <p v-if="!results.length">所有参赛者已离开，下一局重新集结。</p>
        <p v-if="error || !online" class="arena-error" role="status">{{ error || '连接中断，正在重试…' }}<button v-if="!online" class="arena-secondary" @click="refresh">重试连接</button></p>
      </section>

      <footer v-if="race" class="rg-footer">
        <span class="rg-footer-tip"><Lightbulb :size="14"/>小提示：输入越快，车速越快，保持准确率才能持续加速！</span>
        <span class="rg-footer-keys"><Keyboard :size="14"/>支持中英文输入<i>|</i>Enter 开始<i>|</i>Esc 返回</span>
      </footer>
    </main>
    <dialog ref="exitDialog" class="arena-exit" aria-labelledby="arena-exit-title" @close="backButton?.focus()"><h2 id="arena-exit-title">退出当前比赛？</h2><p>训练记录会保留。比赛开始后无法重新加入这一局，其他同学可以继续。</p><div><button class="arena-secondary" @click="exitDialog.close()">继续比赛</button><button class="arena-primary" :disabled="busy" @click="exit">确认退出</button></div></dialog>
  </div>
</template>

<style src="./arena.css"></style>
<style src="./race.css"></style>
