<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ArrowLeft, ArrowRight, Bike, Bot, Camera, Copy, Flag, Gauge, Keyboard, Shield, Timer, Trophy } from 'lucide-vue-next';
import AppHeader from './AppHeader.vue';
import { createChaseScene } from './chase-scene';
import { chasePoint } from './chase-motion.mjs';
import { chasePressure } from './chase-camera.mjs';

const props = defineProps({ user: Object });
const emit = defineEmits(['back', 'login']);
const state = ref(null), code = ref(''), role = ref('police'), draft = ref(''), message = ref(''), busy = ref(false), clock = ref(Date.now()), serverOffset = ref(0);
const inputEl = ref(null), sceneEl = ref(null), sceneMessage = ref(''), cameraMode = ref('pursuit'), quality = ref('auto'), composing = ref(false), resultVisible = ref(false);
let poll, timer, flushTimer, startTimer, resultTimer, stopped = false, reading = null, cleanLeave = false, scene;
const me = computed(() => state.value?.me || null);
const running = computed(() => state.value?.phase === 'running');
const isLobby = computed(() => !state.value || state.value.phase === 'lobby');
const remaining = computed(() => {
  const data = state.value; if (!data) return 120;
  const end = data.phase === 'countdown' ? data.startsAt : data.phase === 'running' ? data.endsAt : data.result?.endedAt;
  return end ? Math.max(0, Math.ceil((end - clock.value - serverOffset.value) / 1000)) : 120;
});
const clockLabel = computed(() => `${String(Math.floor(remaining.value / 60)).padStart(2,'0')}:${String(remaining.value % 60).padStart(2,'0')}`);
const countdown = computed(() => state.value?.phase === 'countdown' ? Math.max(1, Math.ceil((state.value.startsAt - clock.value - serverOffset.value) / 1000)) : null);
const target = computed(() => me.value?.task?.text || '');
const accuracy = player => player?.attempted ? Math.round(player.correct / player.attempted * 100) : 100;
const targetChars = computed(() => Array.from(target.value));
const typedChars = computed(() => Array.from(draft.value));
const police = computed(() => state.value?.players?.find(player => player.role === 'police'));
const thief = computed(() => state.value?.players?.find(player => player.role === 'thief'));
const racers = computed(() => ['police','thief'].map(kind => state.value?.players?.find(player => player.role === kind) || { role: kind, name: '等待加入', correct: 0, combo: 0, speedKmh: 0 }));
const phaseLabel = computed(() => ({ lobby:'海港环道', waiting:'等待对手', countdown:'即将出发', running:'正在追逐', finished:'比赛结束' })[state.value?.phase || 'lobby']);
const qualityLabel = computed(() => ({ auto:'自动', smooth:'流畅', high:'精细' })[quality.value]);
const gapPressure = computed(() => chasePressure(police.value && thief.value ? thief.value.position - police.value.position : 16, state.value?.trackMeters || 520));
const catchingGap = computed(() => gapPressure.value.label);
const cameraLabel = computed(() => ({ pursuit:'追逐', follow:'跟随', overview:'全景' })[cameraMode.value]);
const nextCameraLabel = computed(() => ({ pursuit:'跟随', follow:'全景', overview:'追逐' })[cameraMode.value]);
const gapCaption = computed(() => gapPressure.value.laps ? `小偷领先 ${gapPressure.value.laps} 圈` : !running.value ? '追逐距离' : gapPressure.value.level === 'danger' ? me.value?.role === 'thief' ? '警察逼近' : '就快追上' : gapPressure.value.level === 'near' ? '距离很近' : '追逐距离');
const roleTitle = player => player?.role === 'police' ? '警察' : '小偷';
const portrait = player => `/assets/chase/${player.role === 'police' ? 'police' : 'thief'}-portrait-v2.png`;
const playerLabel = player => player.id === props.user?.id ? '你' : player.bot ? '电脑' : player.name;
function radarPoint(player) {
  const point = chasePoint(player.position || (player.role === 'thief' ? 16 : 0), state.value?.trackMeters || 520);
  return { x: 100 + point.x * 2.6, y: 62 + point.z * 2.6 };
}
function toggleCamera() { cameraMode.value = ({ pursuit:'follow', follow:'overview', overview:'pursuit' })[cameraMode.value]; focusInput(); }
function cycleQuality() { quality.value = ({ auto:'smooth', smooth:'high', high:'auto' })[quality.value]; scene?.setQuality(quality.value); focusInput(); }

async function api(action = '', body) {
  const response = await fetch(`/api/chase${action}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(7000),
  });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.message || '请求失败'), { status: response.status });
  return data;
}
function apply(data) {
  if (!data || stopped || (state.value?.round === data.round && state.value?.serverNow > data.serverNow)) return;
  if (!Array.isArray(data.players)) data.players = [];
  if (!Array.isArray(data.events)) data.events = [];
  const oldTicket = me.value?.task?.id;
  state.value = data; clock.value = Date.now(); serverOffset.value = data.serverNow - Date.now();
  if (oldTicket !== data.me?.task?.id) draft.value = data.me?.task?.typed || '';
  clearTimeout(startTimer); startTimer = null;
  // 倒计时到点立即同步开局，不再等下一次 650ms 轮询才启用输入框。
  if (data.phase === 'countdown' && Number.isFinite(data.startsAt)) {
    startTimer = setTimeout(() => { startTimer = null; return refresh(); }, Math.max(0, data.startsAt - data.serverNow) + 20);
  }
}
function focusInput() {
  const input = inputEl.value;
  if (stopped || !running.value || !me.value?.task || !input || input.disabled) return;
  input.focus({ preventScroll: true });
}
async function refresh() {
  if (stopped || reading || busy.value || !props.user) return;
  reading = (async () => { try { apply(await api()); } catch (error) { if (!stopped) message.value = error.message; } })();
  await reading; reading = null;
}
async function action(path, body) {
  if (!props.user) { emit('login'); return; }
  if (reading) await reading;
  if (busy.value || stopped) return;
  busy.value = true; message.value = '';
  try { apply(await api(path, body)); }
  catch (error) { message.value = error.message; if (error.status === 409) apply(await api().catch(() => state.value)); }
  finally { busy.value = false; }
}
function createRoom() { action('/create', { role: 'police' }); }
function joinRoom() { action('/join-code', { code: code.value.trim() }); }
function playBot() { action('/bot', { role: role.value }); }
function startMatch() { action('/start', { seat: me.value?.seat }); }
async function leave() {
  if (reading) await reading;
  if (busy.value) { message.value = '正在同步输入，请稍后再退出。'; return; }
  busy.value = true;
  try {
    if (me.value?.seat) await api('/leave', { seat: me.value.seat });
    cleanLeave = true; stopped = true; emit('back');
  } catch (error) { message.value = `退出失败，请重试：${error.message}`; }
  finally { busy.value = false; }
}
async function copyCode() {
  if (!state.value?.code) return;
  try { await navigator.clipboard.writeText(state.value.code); message.value = `房间号 ${state.value.code} 已复制`; }
  catch { message.value = `房间号：${state.value.code}`; }
}
function charClass(index) {
  if (composing.value && index >= (me.value?.task?.typed || '').length) return '';
  if (index >= typedChars.value.length) return index === typedChars.value.length ? 'current' : '';
  return typedChars.value[index] === targetChars.value[index] ? 'correct' : 'wrong';
}
function input(event) {
  if (!running.value || !me.value || state.value.phase === 'finished') return;
  const value = event.target.value;
  const locked = me.value.task?.typed || '';
  if (!value.startsWith(locked)) { draft.value = locked; event.target.value = locked; return; }
  draft.value = value.slice(0, target.value.length);
  if (composing.value || event.isComposing) return;
  clearTimeout(flushTimer); flushTimer = setTimeout(flush, 110);
}
async function flush() {
  if (reading) await reading;
  if (stopped || composing.value || !running.value || !me.value?.task || draft.value.length <= (me.value.task.typed || '').length) return;
  if (busy.value) { clearTimeout(flushTimer); flushTimer = setTimeout(flush, 130); return; }
  busy.value = true;
  let retryDelay = 130;
  try { apply(await api('/type', { seat: me.value.seat, ticket: me.value.task.id, text: draft.value.slice(0, (me.value.task.typed || '').length + 20) })); }
  catch (error) {
    message.value = error.message;
    if ([400, 401, 403].includes(error.status)) return;
    retryDelay = error.status === 429 ? 350 : 500;
    if (error.status === 409) apply(await api().catch(() => state.value));
  }
  finally { busy.value = false; }
  if (!stopped && draft.value.length > (me.value?.task?.typed || '').length) { clearTimeout(flushTimer); flushTimer = setTimeout(flush, retryDelay); }
}
// 段落由服务端在输入完成后自动切换，回车不再需要，只阻止它插入换行。
function onKeydown(event) {
  if (composing.value || event.isComposing || event.keyCode === 229) return;
  if (event.key === 'Enter') event.preventDefault();
}
function compositionEnd(event) { composing.value = false; input(event); }
function pageHide() {
  if (!cleanLeave && me.value?.seat) navigator.sendBeacon('/api/chase/leave', new Blob([JSON.stringify({ seat: me.value.seat })], { type:'application/json' }));
}
watch(() => props.user?.id, refresh);
// 等 Vue 更新并启用 textarea 后再聚焦；也覆盖输入框刚挂载和自动换段的情况。
watch([running, () => me.value?.task?.id, inputEl], focusInput, { flush: 'post' });
watch(() => state.value?.phase, phase => {
  clearTimeout(resultTimer); resultVisible.value = false;
  if (phase !== 'finished') return;
  const delay = state.value.result?.outcome === 'caught' && !state.value.result?.left && !window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 450 : 0;
  resultTimer = setTimeout(() => { resultVisible.value = true; }, delay);
});
onMounted(() => {
  try { scene = createChaseScene(sceneEl.value, () => ({ state: state.value, camera: cameraMode.value, userId: props.user?.id }), text => { sceneMessage.value = text; }); }
  catch { sceneMessage.value = '3D 场景暂时不可用，可以继续打字比赛。'; }
  refresh(); poll = setInterval(refresh, 650); timer = setInterval(() => { clock.value = Date.now(); }, 100); window.addEventListener('pagehide', pageHide);
});
onBeforeUnmount(() => { stopped = true; scene?.dispose(); clearInterval(poll); clearInterval(timer); clearTimeout(flushTimer); clearTimeout(startTimer); clearTimeout(resultTimer); window.removeEventListener('pagehide', pageHide); pageHide(); });
</script>

<template>
  <main class="chase-game" :class="{ 'is-playing': running || countdown, 'is-setup': isLobby || state?.phase === 'waiting', 'chase-pressure-near': running && gapPressure.level === 'near', 'chase-pressure-danger': running && gapPressure.level === 'danger' }">
    <AppHeader
      title="生死时速"
      subtitle="海港追逐"
      :icon="Shield"
      back-label="返回大厅"
      :user="props.user"
      @back="leave"
      @account="emit('login')"
    >
      <template #status>
        <span v-if="state?.code">房间 {{ state.code }}</span>
        <b>{{ clockLabel }}</b>
      </template>
      <template #actions>
        <button class="ah-link" type="button" @click="toggleCamera" :aria-label="`${cameraLabel}视角，切换到${nextCameraLabel}`">
          <Camera :size="15" />{{ cameraLabel }}
        </button>
        <button class="ah-link" type="button" @click="cycleQuality" :aria-label="`画质：${qualityLabel}`">
          <Gauge :size="15" />{{ qualityLabel }}
        </button>
      </template>
    </AppHeader>
    <div class="chase-layout">
      <section class="chase-world" aria-label="海港环道，警察与小偷沿同一条赛道追逐">
        <div ref="sceneEl" class="chase-scene"></div><div class="chase-vignette"></div>
        <div class="chase-world-caption"><span><i></i>{{ phaseLabel }}</span><small>520 m 环道</small></div>
        <div class="chase-rider-chips">
          <div v-for="player in racers" :key="player.role" class="chase-rider-chip" :class="player.role">
            <img :src="portrait(player)" :alt="roleTitle(player) + '骑手'"/>
            <div><strong>{{ roleTitle(player) }}<small v-if="player.id"> · {{ playerLabel(player) }}</small></strong><span><b>{{ player.speedKmh || 0 }}</b> km/h</span></div>
          </div>
        </div>
        <div class="chase-gap" v-if="state?.phase !== 'finished'"><Shield :size="16"/><span>{{ gapCaption }}</span><strong>{{ catchingGap }}<small> m</small></strong><Bike :size="17"/></div>
        <div v-if="countdown" class="chase-countdown" aria-live="assertive"><span>准备出发</span><strong :key="countdown">{{ countdown }}</strong><small>倒计时结束后直接打字</small></div>
        <div v-if="state?.phase === 'finished' && resultVisible" class="chase-result" :class="state.result.winnerRole" aria-live="polite">
          <Trophy :size="32"/><strong>{{ state.result.left ? '对手已经离开赛道' : state.result.outcome === 'caught' ? '警察抓到小偷！' : '小偷成功逃脱！' }}</strong>
          <span>{{ state.result.winnerRole === 'police' ? '警察获胜' : '小偷获胜' }} · {{ Math.floor(state.result.durationMs / 1000) }} 秒</span>
          <button class="chase-primary" type="button" @click="leave">返回大厅<ArrowRight :size="16"/></button>
        </div>
        <p v-if="sceneMessage" class="chase-scene-error" role="status">{{ sceneMessage }}</p>
      </section>
      <aside class="chase-sidebar" aria-label="比赛设置与选手信息">
        <section v-if="isLobby" class="chase-setup" aria-label="比赛房间设置">
          <header><span class="chase-eyebrow">选择你的角色</span><h2>海港追逐赛</h2><p>打得越准，追得越紧。</p></header>
          <div class="chase-role-choice">
            <button type="button" :aria-pressed="role === 'police'" :class="{active: role === 'police'}" @click="role = 'police'"><img :src="'/assets/chase/police-portrait-v2.png'" alt=""/><span><Shield :size="15"/>当警察</span></button>
            <button type="button" :aria-pressed="role === 'thief'" :class="{active: role === 'thief'}" @click="role = 'thief'"><img :src="'/assets/chase/thief-portrait-v2.png'" alt=""/><span><Bike :size="15"/>当小偷</span></button>
          </div>
          <button class="chase-primary chase-bot-button" type="button" :disabled="busy" @click="playBot"><Bot :size="18"/>人机比赛<ArrowRight :size="16"/></button>
          <div class="chase-divider"><span>和好友一起</span></div>
          <button class="chase-secondary chase-create-button" type="button" :disabled="busy" @click="createRoom"><Shield :size="17"/>创建双人房</button>
          <div class="chase-code"><label for="chase-code-input">已有房间？</label><div><input id="chase-code-input" v-model="code" inputmode="numeric" maxlength="8" aria-label="房间邀请码" placeholder="房间号" @keydown.enter="joinRoom"/><button class="chase-primary" type="button" :disabled="busy" @click="joinRoom">加入</button></div></div>
          <small v-if="!user" class="chase-login-tip">登录后即可参加</small>
          <p class="chase-rule">追上即胜 · 小偷坚持 2 分钟获胜</p>
        </section>
        <template v-else>
          <section v-if="state?.phase === 'waiting'" class="chase-wait">
            <span class="chase-eyebrow">邀请好友来追逐</span><div><strong>{{ state.code }}</strong><button type="button" class="chase-secondary" @click="copyCode" aria-label="复制房间号"><Copy :size="17"/></button></div>
            <p>{{ state.players.length < 2 ? '等待另一位选手加入' : '两位选手已就位' }}</p>
            <button v-if="state.host === user?.id" type="button" class="chase-primary" :disabled="busy || state.players.length < 2" @click="startMatch">开始追逐<ArrowRight :size="17"/></button>
            <small v-else>等待房主开始</small>
          </section>
          <div class="chase-player-cards">
            <section v-for="player in racers" :key="player.role" class="chase-player-card" :class="player.role">
              <header><img :src="portrait(player)" alt=""/><div><strong>{{ roleTitle(player) }}<small v-if="player.id === user?.id">（你）</small></strong><span>{{ playerLabel(player) }}</span></div><i></i></header>
              <dl><div><dt>速度</dt><dd>{{ player.speedKmh || 0 }}<small> km/h</small></dd></div><div><dt>正确字数</dt><dd>{{ player.correct || 0 }}</dd></div><div><dt>连击</dt><dd>{{ player.combo || 0 }}</dd></div><div><dt>正确率</dt><dd>{{ accuracy(player) }}%</dd></div></dl>
            </section>
          </div>
          <section class="chase-radar" aria-label="赛道位置总览">
            <div><span>环道位置</span><strong>相距 {{ catchingGap }} m</strong></div>
            <svg viewBox="0 0 200 124" role="img" aria-label="警察与小偷的实时赛道位置"><ellipse cx="100" cy="62" rx="67.6" ry="46.8" class="radar-road"/><ellipse cx="100" cy="62" rx="67.6" ry="46.8" class="radar-center"/><circle v-for="player in racers" :key="player.role" :cx="radarPoint(player).x" :cy="radarPoint(player).y" r="5" :class="player.role"/></svg>
          </section>
          <p class="chase-rule">{{ me?.role === 'police' ? '准确输入，追上小偷' : '保持输入，甩开警察' }}</p>
        </template>
      </aside>
      <section v-if="running || countdown" class="chase-practice" aria-label="打字区域">
        <header><span><Keyboard :size="18"/><strong>{{ countdown ? '准备好，马上出发' : '输入下方文字' }}</strong></span><small>打完自动换段</small></header>
        <p class="chase-target"><span v-for="(char,index) in targetChars" :key="index" :class="charClass(index)">{{ char }}</span></p>
        <textarea ref="inputEl" :value="draft" :disabled="!running || me?.role == null" aria-label="输入上方目标文字" :placeholder="countdown ? '倒计时结束后自动聚焦…' : '在此输入…'" @input="input" @compositionstart="composing = true" @compositionend="compositionEnd" @keydown="onKeydown" @paste.prevent @drop.prevent autocomplete="off" autocapitalize="off" spellcheck="false" rows="1"></textarea>
        <div class="chase-my-metrics"><span><Gauge :size="14"/>正确率 <b>{{ accuracy(me) }}%</b></span><span><Flag :size="14"/>正确字数 <b>{{ me?.correct || 0 }}</b></span><span><Bike :size="14"/>连击 <b>{{ me?.combo || 0 }}</b></span><span class="chase-typing-hint">{{ me?.role === 'police' ? '追上即胜' : '坚持到时间结束' }}</span></div>
      </section>
    </div>
    <p v-if="message" class="chase-message" role="status">{{ message }}</p>
  </main>
</template>

<style src="./chase.css"></style>
