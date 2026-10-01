<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ArrowLeft, Bike, Bot, CarFront, Flag, Gauge, Keyboard, Shield, Timer, Trophy } from 'lucide-vue-next';

const props = defineProps({ user: Object });
const emit = defineEmits(['back', 'login']);
const state = ref(null), code = ref(''), role = ref('police'), draft = ref(''), message = ref(''), busy = ref(false), clock = ref(Date.now()), serverOffset = ref(0);
const inputEl = ref(null);
let poll, timer, flushTimer, startTimer, stopped = false, reading = null, composing = false, cleanLeave = false;
const me = computed(() => state.value?.me || null);
const opponent = computed(() => (state.value?.players || []).find(player => player.id !== props.user?.id) || null);
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
const humanPlayers = computed(() => (state.value?.players || []).filter(player => !player.bot));
const finishedWinner = computed(() => state.value?.result?.winnerRole);
const catchingGap = computed(() => {
  const police = state.value?.players?.find(player => player.role === 'police');
  const thief = state.value?.players?.find(player => player.role === 'thief');
  return police && thief ? Math.max(0, Math.round(thief.position - police.position)) : 0;
});
const roleTitle = player => player?.role === 'police' ? '警察' : '小偷';
// 两名骑手共用同一条环道起点：屏幕间距就等于真实间距（起点差值 = 小偷领先米数），
// 警察追上时两个骑手正好重合，不会再出现“画面里没追上却判警察赢”的情况。
const TRACK_START_ANGLE = 145;
function riderStyle(player) {
  const angle = (TRACK_START_ANGLE + ((player.position || 0) / (state.value?.trackMeters || 520)) * 360) * Math.PI / 180;
  // Follow the visible asphalt loop around the park, not the edges of the viewport.
  const x = 50 + Math.cos(angle) * 27;
  const y = 44 + Math.sin(angle) * 34;
  return { left: `${x}%`, top: `${y}%`, transform: `translate(-50%,-50%) rotate(${angle * 180 / Math.PI + 90}deg)` };
}

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
  if (index >= typedChars.value.length) return index === typedChars.value.length ? 'current' : '';
  return typedChars.value[index] === targetChars.value[index] ? 'correct' : 'wrong';
}
function input(event) {
  if (!running.value || !me.value || state.value.phase === 'finished') return;
  const value = event.target.value;
  const locked = me.value.task?.typed || '';
  if (!value.startsWith(locked)) { draft.value = locked; event.target.value = locked; return; }
  draft.value = value.slice(0, target.value.length);
  if (composing || event.isComposing) return;
  clearTimeout(flushTimer); flushTimer = setTimeout(flush, 110);
}
async function flush() {
  if (reading) await reading;
  if (stopped || composing || !running.value || !me.value?.task || draft.value.length <= (me.value.task.typed || '').length) return;
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
  if (composing || event.isComposing || event.keyCode === 229) return;
  if (event.key === 'Enter') event.preventDefault();
}
function compositionEnd(event) { composing = false; input(event); }
function pageHide() {
  if (!cleanLeave && me.value?.seat) navigator.sendBeacon('/api/chase/leave', new Blob([JSON.stringify({ seat: me.value.seat })], { type:'application/json' }));
}
watch(() => props.user?.id, refresh);
// 等 Vue 更新并启用 textarea 后再聚焦；也覆盖输入框刚挂载和自动换段的情况。
watch([running, () => me.value?.task?.id, inputEl], focusInput, { flush: 'post' });
onMounted(() => { refresh(); poll = setInterval(refresh, 650); timer = setInterval(() => { clock.value = Date.now(); }, 100); window.addEventListener('pagehide', pageHide); });
onBeforeUnmount(() => { stopped = true; clearInterval(poll); clearInterval(timer); clearTimeout(flushTimer); clearTimeout(startTimer); window.removeEventListener('pagehide', pageHide); pageHide(); });
</script>

<template>
  <main class="chase-game" :class="{ 'is-running': running }">
    <header class="chase-topbar">
      <button class="chase-back" type="button" @click="leave"><ArrowLeft :size="20"/>返回大厅</button>
      <div class="chase-title"><CarFront :size="40"/><div><h1>生死时速</h1><p>快速打字，追上小偷！</p></div></div>
      <div class="chase-top-metrics"><div><small><Timer :size="15"/>剩余时间</small><strong>{{ clockLabel }}</strong></div><div><small>房间</small><strong>{{ state?.code || '—' }}</strong></div></div>
    </header>

    <section class="chase-world" aria-label="顺时针警察追小偷赛道">
      <div class="chase-background"></div><div class="chase-vignette"></div>
      <div class="chase-hud chase-police-hud">
        <div class="chase-hud-head"><div class="chase-avatar police"><img :src="'/assets/chase-police-rider.png'" alt="警察骑手"/></div><div><strong>警察{{ me?.role === 'police' ? '（你）' : '' }}</strong><small>{{ me?.role === 'police' ? accuracy(me) + '% 正确率' : (opponent?.role === 'police' ? accuracy(opponent) + '% 正确率' : '追捕方') }}</small></div><span class="chase-role-dot police"></span></div>
        <dl><div><dt>速度</dt><dd>{{ (state?.players?.find(p=>p.role==='police')?.speedKmh || 0) }} km/h</dd></div><div><dt>正确字数</dt><dd>{{ state?.players?.find(p=>p.role==='police')?.correct || 0 }}</dd></div><div><dt>连击</dt><dd>{{ state?.players?.find(p=>p.role==='police')?.combo || 0 }}</dd></div></dl>
        <div class="chase-speedbar"><i :style="{width:Math.min(100,(state?.players?.find(p=>p.role==='police')?.speedKmh||0)/140*100)+'%'}"></i></div>
      </div>
      <div class="chase-hud chase-thief-hud">
        <div class="chase-hud-head"><div class="chase-avatar thief"><img :src="'/assets/chase-thief-rider.png'" alt="小偷骑手"/></div><div><strong>小偷{{ me?.role === 'thief' ? '（你）' : '' }}</strong><small>{{ opponent?.role === 'thief' ? accuracy(opponent) + '% 正确率' : me?.role === 'thief' ? accuracy(me) + '% 正确率' : '逃跑方' }}</small></div><span class="chase-role-dot thief"></span></div>
        <dl><div><dt>速度</dt><dd>{{ (state?.players?.find(p=>p.role==='thief')?.speedKmh || 0) }} km/h</dd></div><div><dt>正确率</dt><dd>{{ accuracy(state?.players?.find(p=>p.role==='thief')) }}%</dd></div><div><dt>已领先</dt><dd>{{ Math.max(0,Math.round((state?.players?.find(p=>p.role==='thief')?.position||0)-(state?.players?.find(p=>p.role==='police')?.position||0))) }} m</dd></div></dl>
        <div class="chase-speedbar thief"><i :style="{width:Math.min(100,(state?.players?.find(p=>p.role==='thief')?.speedKmh||0)/140*100)+'%'}"></i></div>
      </div>

      <div v-if="state && state.phase!=='lobby'" class="chase-track">
        <div class="chase-track-label start">起点</div><div class="chase-track-label checkpoint">公园环道</div>
        <div v-for="player in state.players" :key="player.id" class="chase-rider" :class="player.role" :style="riderStyle(player)">
          <div class="chase-name-tag">{{ player.bot ? '电脑' : player.id===user?.id ? '你' : player.name }}</div>
          <img :src="player.role==='police'?'/assets/chase-police-rider.png':'/assets/chase-thief-rider.png'" :alt="roleTitle(player)"/>
        </div>
      </div>
      <div v-if="state?.phase==='countdown'" class="chase-countdown"><strong>{{ countdown }}</strong><span>出发！</span></div>
      <div v-if="state?.phase==='finished'" class="chase-result" :class="state.result.winnerRole"><Trophy :size="30"/><strong>{{ state.result.left ? '对手已经离开赛道' : state.result.outcome==='caught'?'警察抓到小偷！':'小偷成功逃脱！' }}</strong><span>{{ state.result.winnerRole==='police'?'警察获胜':'小偷获胜' }} · {{ Math.floor(state.result.durationMs/1000) }} 秒</span><button @click="leave">返回大厅</button></div>
      <div v-if="state?.phase==='running'" class="chase-catch-gap"><span>警察还差</span><strong>{{ catchingGap }} m</strong><span>追上小偷</span></div>
      <div v-if="state?.events?.length" class="chase-event">{{ state.events.at(-1).text }}</div>
    </section>

    <section v-if="state?.phase==='lobby' || !state" class="chase-setup" aria-label="比赛房间设置">
      <header><Bike :size="20"/><div><strong>选择比赛方式</strong><small>警察由房主创建，第二位玩家担任小偷</small></div></header>
      <button class="chase-setup-primary" :disabled="busy" @click="createRoom"><CarFront :size="18"/>创建双人房</button>
      <div class="chase-code"><input v-model="code" inputmode="numeric" maxlength="8" aria-label="房间邀请码" placeholder="输入房间号" @keydown.enter="joinRoom"/><button :disabled="busy" @click="joinRoom">加入</button></div>
      <div class="chase-role-choice"><button :class="{active:role==='police'}" @click="role='police'"><Shield :size="15"/>当警察</button><button :class="{active:role==='thief'}" @click="role='thief'"><Bike :size="15"/>当小偷</button></div>
      <button class="chase-setup-bot" :disabled="busy" @click="playBot"><Bot :size="17"/>人机比赛</button>
      <small v-if="!user" class="chase-login-tip">登录后即可创建房间、加入好友或挑战电脑</small>
    </section>

    <section v-if="state && state.phase!=='lobby' && state.phase!=='finished'" class="chase-practice">
      <header><div><Keyboard :size="21"/><strong>{{ state.phase==='waiting'?'等待房间开始':'请根据下方内容输入' }}</strong><span>{{ state.phase==='waiting'?'分享邀请码，邀请对手加入':me?.role==='police'?'打得越准，速度越快，追上小偷！':'保持输入，别让警察追上！' }}</span></div><div class="chase-round-pill"><i></i>{{ state.phase==='running'?'正在比赛':state.phase==='countdown'?'即将出发':'等待对手' }}</div></header>
      <div v-if="state.phase==='waiting'" class="chase-wait-inline">
        <span>房间邀请码</span><strong>{{ state.code }}</strong><button type="button" @click="copyCode">复制</button>
        <p>{{ state.players.length<2?'等待对手加入，地图已就绪。':'两位选手已就位，房主可以开始。' }}</p>
        <button v-if="state.host===user?.id" class="chase-wait-start" :disabled="state.players.length<2" @click="startMatch">开始追逐</button>
      </div>
      <template v-else>
        <div class="chase-target"><small>当前输入内容 · 打完自动换下一段</small><p><span v-for="(char,index) in targetChars" :key="index" :class="charClass(index)">{{ char }}</span><b v-if="running" class="chase-caret"></b></p></div>
        <div class="chase-input-row"><textarea ref="inputEl" :value="draft" :disabled="!running || state.phase==='finished' || me?.role==null" aria-label="输入上方目标文字" placeholder="在此输入…" @input="input" @compositionstart="composing = true" @compositionend="compositionEnd" @keydown.enter="onKeydown" @paste.prevent @drop.prevent autocomplete="off" spellcheck="false"></textarea></div>
        <div class="chase-my-metrics"><span><Gauge :size="18"/><small>正确率</small><b>{{ accuracy(me) }}%</b></span><span><Flag :size="18"/><small>正确字数</small><b>{{ me?.correct || 0 }}</b></span><span><Bike :size="18"/><small>当前连击</small><b>{{ me?.combo || 0 }}</b></span><span><Timer :size="18"/><small>剩余时间</small><b>{{ clockLabel }}</b></span></div>
      </template>
    </section>
    <p v-if="message" class="chase-message" role="status">{{ message }}</p>
  </main>
</template>

<style src="./chase.css"></style>
