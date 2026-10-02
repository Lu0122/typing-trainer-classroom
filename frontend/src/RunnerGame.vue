<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, Footprints, Heart, Pause, Play, Trophy, Volume2, VolumeX } from 'lucide-vue-next';
import RunnerLeaderboard from './RunnerLeaderboard.vue';
import { createRunnerScene } from './runner-scene';
const props = defineProps({ user: Object });
const emit = defineEmits(['back', 'login']);
const state = ref({ phase: 'idle' }), draft = ref(''), composing = ref(false), language = ref('english');
const busy = ref(false), connected = ref(true), message = ref(''), sceneMessage = ref('');
const sceneHost = ref(null), editor = ref(null), rankingDialog = ref(null), sound = ref(false);
const period = ref('all'), board = ref(null), rankingError = ref(''), rankingLoading = ref(false);
const resultRank = computed(() => board.value?.language === state.value.language ? board.value?.myBest?.rank : null);
const clock = ref(performance.now());
let poll, clockTimer, sendTimer, startTimer, scene, stopped = false, reading, writing, pending = null, inputId = 0;
let clockServer = Date.now(), clockPerformance = performance.now(), rankRequest = 0, lastEvent, lastFinished, audio;
const task = computed(() => state.value.task);
const running = computed(() => state.value.phase === 'running');
const solved = computed(() => !!task.value && !composing.value && draft.value === task.value.text);
const serverTime = () => clockServer + performance.now() - clockPerformance;
const seconds = computed(() => Math.max(0, ((task.value?.deadline || 0) - (clockServer + clock.value - clockPerformance)) / 1000));
const countdown = computed(() => Math.max(0, Math.ceil(((state.value.startsAt || 0) - (clockServer + clock.value - clockPerformance)) / 1000)));
const distance = computed(() => Math.floor((state.value.distance || 0) + (running.value && task.value ? Math.max(0, Math.min(clockServer + clock.value - clockPerformance, task.value.deadline + 350) - state.value.serverNow) / 1000 * state.value.speed : 0)));
const actionIcon = computed(() => ({ jump: ArrowUp, slide: ArrowDown, left: ArrowLeft, right: ArrowRight }[task.value?.action] || Footprints));
const inputEnabled = computed(() => running.value && !!task.value && connected.value && !busy.value);
async function api(path = '', body) {
  const before = performance.now();
  const response = await fetch(`/api/runner${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(7000) });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.message || '请求失败'), { status: response.status });
  return { data, before, after: performance.now() };
}
function focusInput() { if (!stopped && inputEnabled.value && !rankingDialog.value?.open) editor.value?.focus({ preventScroll: true }); }
function apply({ data, before, after }) {
  if (stopped) return;
  const previousTask = task.value?.id, previousRun = state.value.id;
  state.value = data; clockServer = data.serverNow + (after - before) / 2; clockPerformance = after; clock.value = after;
  connected.value = true; inputId = Math.max(inputId, data.lastInputId || 0);
  if (previousTask !== data.task?.id || previousRun !== data.id) { draft.value = data.task?.typed || ''; pending = null; composing.value = false; message.value = ''; }
  if (data.language && (previousRun !== data.id || ['running', 'paused', 'countdown'].includes(data.phase))) language.value = data.language;
  if (data.event && `${data.id}:${data.event.sequence}:${data.event.outcome}` !== lastEvent) {
    lastEvent = `${data.id}:${data.event.sequence}:${data.event.outcome}`;
    playTone(data.event.outcome === 'clear');
  }
  clearTimeout(startTimer);
  if (data.phase === 'countdown') startTimer = setTimeout(refresh, Math.max(0, data.startsAt - serverTime()) + 10);
  if (data.phase === 'finished' && lastFinished !== data.id) { lastFinished = data.id; loadRanking(); }
}
async function refresh() {
  if (stopped || !props.user || busy.value || writing || reading) return;
  reading = (async () => {
    try { apply(await api()); }
    catch (error) { if (!stopped) { connected.value = false; message.value = `${error.message}，正在重连…`; } }
  })();
  await reading; reading = null;
}
async function flush() {
  if (stopped || writing || !pending || busy.value) return;
  if (reading) await reading;
  const packet = pending; pending = null;
  writing = (async () => {
    try { apply(await api('/type', packet)); }
    catch (error) {
      if (stopped) return;
      if (error.status === 409) { try { apply(await api()); } catch { connected.value = false; } }
      else { connected.value = false; message.value = `${error.message}，正在重试…`; pending ||= packet; }
    }
  })();
  await writing; writing = null;
  if (pending) { clearTimeout(sendTimer); sendTimer = setTimeout(flush, connected.value ? 40 : 600); }
}
function input(event) {
  draft.value = event.target.value;
  if (composing.value || event.isComposing || !running.value || !task.value || task.value.cleared) return;
  pending = { runId: state.value.id, ticket: task.value.id, text: draft.value, inputId: ++inputId };
  clearTimeout(sendTimer); sendTimer = setTimeout(flush, solved.value ? 0 : 50);
}
function compositionEnd(event) { composing.value = false; input(event); }
async function action(path) {
  if (busy.value || stopped) return false;
  if (reading) await reading;
  if (writing) await writing;
  if (pending && path !== '/start') await flush();
  busy.value = true; message.value = '';
  try { apply(await api(path, path === '/start' ? { language: language.value } : { runId: state.value.id })); return true; }
  catch (error) { message.value = error.message; if (error.status === 401) emit('login'); return false; }
  finally { busy.value = false; nextTick(focusInput); }
}
function start() { if (!props.user) { emit('login'); return; } prepareSound(); action('/start'); }
async function back() { if (['running', 'countdown'].includes(state.value.phase) && !await action('/pause')) return; emit('back'); }
async function togglePause() { if (state.value.phase === 'paused') await action('/resume'); else if (['running', 'countdown'].includes(state.value.phase)) await action('/pause'); }
async function openRanking() { if (['running', 'countdown'].includes(state.value.phase) && !await action('/pause')) return; rankingDialog.value?.showModal(); loadRanking(); }
async function loadRanking() {
  const request = ++rankRequest; rankingLoading.value = true; rankingError.value = '';
  if (board.value && (board.value.language !== language.value || board.value.period !== period.value)) board.value = null;
  try { const { data } = await api(`/leaderboard?period=${period.value}&language=${language.value}`); if (request === rankRequest && !stopped) board.value = data; }
  catch (error) { if (request === rankRequest && !stopped) rankingError.value = error.message; }
  finally { if (request === rankRequest) rankingLoading.value = false; }
}
function charClass(char, index) { if (composing.value) return ''; return index < draft.value.length ? draft.value[index] === char ? 'correct' : 'wrong' : index === draft.value.length ? 'current' : ''; }
function prepareSound() {
  if (!sound.value) return;
  try { audio ||= new (window.AudioContext || window.webkitAudioContext)(); audio.resume().catch(() => {}); } catch { sound.value = false; }
}
function playTone(success) {
  if (!sound.value || !audio || audio.state !== 'running') return;
  const oscillator = audio.createOscillator(), gain = audio.createGain(), at = audio.currentTime;
  oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(success ? 660 : 170, at); oscillator.frequency.exponentialRampToValueAtTime(success ? 990 : 90, at + .16);
  gain.gain.setValueAtTime(.04, at); gain.gain.exponentialRampToValueAtTime(.001, at + .22);
  oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(at); oscillator.stop(at + .23);
  oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
}
function toggleSound() { sound.value = !sound.value; prepareSound(); }
function pauseBeacon() { if (state.value.id && ['running', 'countdown'].includes(state.value.phase)) navigator.sendBeacon('/api/runner/pause', new Blob([JSON.stringify({ runId: state.value.id })], { type: 'application/json' })); }
function visibility() { if (document.hidden && ['running', 'countdown'].includes(state.value.phase)) action('/pause'); }
function keydown(event) {
  if (event.key === 'Escape' && !event.isComposing && !composing.value && !rankingDialog.value?.open) { event.preventDefault(); togglePause(); }
}
watch([inputEnabled, () => task.value?.id], () => nextTick(focusInput), { flush: 'post' });
watch([period, language], loadRanking);
watch(() => props.user?.id, refresh);
onMounted(() => {
  try { scene = createRunnerScene(sceneHost.value, () => ({ state: state.value, now: serverTime(), solved: solved.value }), text => { sceneMessage.value = text; }); }
  catch { sceneMessage.value = '3D 场景暂时不可用，打字挑战仍可继续。'; }
  refresh(); loadRanking(); poll = setInterval(refresh, 650); clockTimer = setInterval(() => { clock.value = performance.now(); }, 50);
  document.addEventListener('visibilitychange', visibility); window.addEventListener('keydown', keydown); window.addEventListener('pagehide', pauseBeacon);
});
onBeforeUnmount(() => {
  pauseBeacon(); stopped = true; clearInterval(poll); clearInterval(clockTimer); clearTimeout(sendTimer); clearTimeout(startTimer); scene?.dispose(); audio?.close().catch(() => {});
  document.removeEventListener('visibilitychange', visibility); window.removeEventListener('keydown', keydown); window.removeEventListener('pagehide', pauseBeacon);
});
</script>

<template>
  <div class="runner-game">
    <header class="runner-header">
      <button class="runner-back" aria-label="返回大厅" :disabled="busy" @click="back"><ArrowLeft :size="18"/><span>返回大厅</span></button>
      <div class="runner-brand"><Footprints :size="25"/><div><strong>遗迹逃亡</strong><small>TYPE · RUN · EXPLORE</small></div></div>
      <div class="runner-header-actions"><button class="runner-icon-button" :aria-label="sound ? '关闭音效' : '开启音效'" :title="sound ? '关闭音效' : '开启音效'" @click="toggleSound"><component :is="sound ? Volume2 : VolumeX" :size="19"/></button><button class="runner-button runner-ranking-button" @click="openRanking"><Trophy :size="17"/>排行榜</button></div>
    </header>
    <main class="runner-layout">
      <section class="runner-stage" aria-label="无限打字逃亡赛场" :class="{ 'is-hit': state.event?.outcome === 'miss' && state.event.sequence === task?.sequence - 1 }">
        <div ref="sceneHost" class="runner-canvas"></div>
        <div class="runner-vignette" aria-hidden="true"></div>
        <div class="runner-hud"><div><span>关卡</span><strong>{{ state.level || 1 }}<small> / ∞</small></strong></div><div><span>逃亡距离</span><strong>{{ distance.toLocaleString() }}<small> m</small></strong></div><div class="runner-hearts" aria-label="剩余失误机会"><Heart v-for="n in 3" :key="n" :size="20" :class="{ 'is-empty': n > (state.lives ?? 3) }"/><small>{{ state.lives ?? 3 }} / 3</small></div><button v-if="['running','countdown','paused'].includes(state.phase)" class="runner-icon-button runner-pause" :disabled="busy" :aria-label="state.phase === 'paused' ? '继续游戏' : '暂停游戏'" @click="togglePause"><component :is="state.phase === 'paused' ? Play : Pause" :size="20"/></button></div>
        <div v-if="state.phase === 'idle'" class="runner-overlay runner-intro">
          <span class="runner-eyebrow">无限路线 · 打字冒险</span><h1>向未知，<br/><em>再跑远一点。</em></h1><p>打出目标文字，跳跃、滑铲、避开障碍。<br/>每 10 个障碍进入下一关，三次失误结束。</p>
          <div class="runner-language" aria-label="打字语言"><button :aria-pressed="language === 'english'" @click="language = 'english'">英文单词</button><button :aria-pressed="language === 'chinese'" @click="language = 'chinese'">中文词句</button></div>
          <button class="runner-primary" :disabled="busy" @click="start"><Play :size="19"/>{{ props.user ? '开始逃亡' : '登录并开始' }}</button>
          <small>按目标文字打字即可，动作会自动完成。</small>
        </div>
        <div v-else-if="state.phase === 'countdown'" class="runner-countdown" role="status"><span>准备出发</span><strong>{{ countdown || '出发' }}</strong><small>倒计时结束后，直接开始打字</small></div>
        <div v-else-if="state.phase === 'paused'" class="runner-overlay runner-compact-overlay"><span class="runner-eyebrow">休息一下，路线为你停留</span><h1>已暂停</h1><button class="runner-primary" :disabled="busy" @click="action('/resume')"><Play :size="19"/>继续逃亡</button><button class="runner-button" :disabled="busy" @click="action('/finish')">结束并保存成绩</button></div>
        <div v-else-if="state.phase === 'finished'" class="runner-overlay runner-result"><span class="runner-eyebrow">{{ state.reason === 'collision' ? '冒险结束' : '本次纪录已保存' }}</span><h1>{{ distance.toLocaleString() }}<em> m</em></h1><p>第 {{ state.level }} 关 · {{ state.cleared }} 个障碍 · {{ state.accuracy }}% 准确率</p><div class="runner-result-stats"><span>得分<strong>{{ state.score.toLocaleString() }}</strong></span><span>最高连击<strong>{{ state.bestCombo }}</strong></span><span>我的排名<strong>{{ resultRank ? `#${resultRank}` : '—' }}</strong></span></div><div class="runner-language" aria-label="下一局语言"><button :aria-pressed="language === 'english'" @click="language = 'english'">英文单词</button><button :aria-pressed="language === 'chinese'" @click="language = 'chinese'">中文词句</button></div><button class="runner-primary" :disabled="busy" @click="start"><Play :size="19"/>再跑一次</button></div>
        <section v-if="state.phase === 'running' && task" class="runner-input-panel" aria-label="打字操作区">
          <header><div class="runner-action" :class="{ 'is-ready': solved || task.cleared }"><component :is="solved || task.cleared ? Check : actionIcon" :size="20"/><strong>{{ solved || task.cleared ? '动作就绪' : task.label }}</strong></div><span>{{ solved || task.cleared ? `下个：${state.upcoming?.[0]?.label || '继续前进'}` : `剩余 ${seconds.toFixed(1)} 秒` }}</span></header>
          <div class="runner-word" :class="{ 'is-ready': solved || task.cleared }"><span v-for="(char,index) in task.text" :key="index" :class="charClass(char,index)">{{ char }}</span></div>
          <label class="runner-input-label" for="runner-input">输入上方文字</label><input id="runner-input" ref="editor" :value="draft" :disabled="!inputEnabled" :readonly="task.cleared || solved" @input="input" @compositionstart="composing = true" @compositionend="compositionEnd" @paste.prevent @drop.prevent autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" :placeholder="task.cleared || solved ? '已完成，准备穿过障碍…' : '在此输入…'" aria-label="输入上方文字"/>
          <div class="runner-input-footer"><span>得分 <b>{{ state.score.toLocaleString() }}</b></span><span>连击 <b>{{ state.combo }}</b></span><span>正确率 <b>{{ state.accuracy }}%</b></span><progress aria-label="本关进度" :value="state.levelProgress" :max="state.levelSteps"></progress></div>
        </section>
        <p v-if="message || sceneMessage" class="runner-message" role="status">{{ message || sceneMessage }}<button v-if="!connected" class="runner-button" @click="refresh">重连</button></p>
      </section>
      <aside class="runner-sidebar"><RunnerLeaderboard :board="board" :period="period" :language="language" :loading="rankingLoading" :error="rankingError" @period="period = $event" @refresh="loadRanking"/></aside>
    </main>
    <dialog ref="rankingDialog" class="runner-rank-dialog" @close="focusInput"><button class="runner-rank-close runner-button" @click="rankingDialog.close()">关闭</button><RunnerLeaderboard :board="board" :period="period" :language="language" :loading="rankingLoading" :error="rankingError" @period="period = $event" @refresh="loadRanking"/></dialog>
  </div>
</template>
<style src="./runner.css"></style>
