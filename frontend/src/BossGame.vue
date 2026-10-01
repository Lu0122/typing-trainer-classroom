<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ArrowLeft, Crosshair, Swords, Timer, Trophy, Users, Zap } from 'lucide-vue-next';
const props = defineProps({ user: Object });
const emit = defineEmits(['back', 'login']);
const state = ref(null), draft = ref(''), message = ref(''), connected = ref(true), busy = ref(false);
const editor = ref(null), leaveDialog = ref(null), returnButton = ref(null), hit = ref(false), clock = ref(Date.now());
let poll, clockTimer, sendTimer, hitTimer, reading = null, stopped = false, composing = false, advanceRequested = false, cleanLeave = false;
let serverOffset = 0, acknowledgedEvent = null;
const task = computed(() => state.value?.me?.task);
const committed = computed(() => task.value?.typed || '');
const joined = computed(() => !!state.value?.me);
const running = computed(() => state.value?.phase === 'running');
const remaining = computed(() => {
  const end = state.value?.phase === 'waiting' ? state.value?.startsAt : state.value?.phase === 'finished' ? state.value?.result?.endedAt + 15000 : state.value?.endsAt;
  return end ? Math.max(0, Math.ceil((end - clock.value - serverOffset) / 1000)) : 0;
});
const timeLabel = computed(() => `${String(Math.floor(remaining.value / 60)).padStart(2, '0')}:${String(remaining.value % 60).padStart(2, '0')}`);
const survivalLabel = computed(() => {
  const seconds = Math.floor((state.value?.me?.survivalMs || 0) / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
});
const activeCount = computed(() => state.value?.activeCount ?? state.value?.players.filter(player => !player.eliminated).length ?? 0);
const elimination = computed(() => state.value?.elimination || { round: 0, nextAt: null, dangerCount: 0 });
const nextEliminationSeconds = computed(() => elimination.value.nextAt ? Math.max(0, Math.ceil((elimination.value.nextAt - clock.value - serverOffset) / 1000)) : 0);
const eliminated = computed(() => !!state.value?.me?.eliminated);
const onStagePlayers = computed(() => (state.value?.players || []).filter(player => !player.eliminated).slice(0, 5));
const eliminatedPlayers = computed(() => (state.value?.players || []).filter(player => player.eliminated).slice(0, 5));
const newestEvents = computed(() => [...(state.value?.events || [])].reverse().slice(0, 6));
const phaseLabel = computed(() => state.value?.phase === 'running' ? '比赛中' : state.value?.phase === 'finished' ? '本局结算' : '等待开局');

async function api(path = '', body) {
  const response = await fetch(`/api/boss${path}`, { method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(7000) });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.message || '请求失败'), { status: response.status });
  return data;
}
function apply(data) {
  if (stopped) return;
  const oldTask = task.value?.id, oldRound = state.value?.round;
  if (!connected.value) message.value = '';
  state.value = data; serverOffset = data.serverNow - Date.now(); clock.value = Date.now(); connected.value = true;
  if (oldTask !== data.me?.task?.id || oldRound !== data.round) {
    message.value = '';
    draft.value = data.me?.task?.typed || ''; advanceRequested = false;
    if (data.me?.task && !leaveDialog.value?.open) nextTick(() => editor.value?.focus({ preventScroll: true }));
  } else if (!composing && !draft.value.startsWith(committed.value)) draft.value = committed.value;
  const latest = data.events.at(-1);
  if (oldRound === data.round && acknowledgedEvent !== null && latest?.id !== acknowledgedEvent && latest?.kind === 'hit') {
    hit.value = true; clearTimeout(hitTimer); hitTimer = setTimeout(() => { hit.value = false; }, 350);
  }
  acknowledgedEvent = latest?.id ?? 0;
}
async function refresh() {
  if (stopped || busy.value || reading || !props.user) return;
  reading = (async () => { try { apply(await api()); } catch (error) { if (!stopped) { connected.value = false; message.value = error.message; } } })();
  await reading; reading = null;
}
async function action(path, body = {}) {
  if (reading) await reading;
  if (stopped || busy.value) return;
  busy.value = true; message.value = '';
  try { apply(await api(path, body)); }
  catch (error) { message.value = error.message; connected.value = ![undefined, 401].includes(error.status); }
  finally { busy.value = false; }
}
async function join() { if (!props.user) { emit('login'); return; } await action('/join'); }
function input(event) {
  if (composing || event.isComposing) return;
  if (!task.value) return;
  const value = event.target.value;
  if (!value.startsWith(committed.value)) {
    draft.value = committed.value; event.target.value = draft.value;
    message.value = '已结算的字符不能重复修改，请继续输入后面的字。'; return;
  }
  draft.value = value.slice(0, task.value.text.length);
  clearTimeout(sendTimer); sendTimer = setTimeout(flush, 180);
}
function compositionEnd(event) { composing = false; input(event); }
async function flush() {
  if (reading) await reading;
  if (stopped || busy.value || composing || !task.value || !running.value) { if (!stopped && busy.value) sendTimer = setTimeout(flush, 250); return; }
  if (draft.value.length > committed.value.length) {
    busy.value = true;
    try {
      const data = await api('/type', { seat: state.value.me.seat, ticket: task.value.id, text: draft.value.slice(0, committed.value.length + 16) });
      apply(data); message.value = '';
    } catch (error) {
      message.value = error.message;
      if (error.status === 409) { apply(await api().catch(() => state.value)); }
      else connected.value = !!error.status;
      advanceRequested = false;
      return;
    } finally { busy.value = false; }
    if (draft.value.length > committed.value.length && running.value) { sendTimer = setTimeout(flush, 220); return; }
  }
  if (advanceRequested && running.value && task.value && committed.value.length === task.value.text.length) {
    advanceRequested = false; await action('/next', { seat: state.value.me.seat, ticket: task.value.id });
  }
}
function nextSegment(event) {
  if (composing || event?.isComposing || event?.keyCode === 229) return;
  event?.preventDefault();
  if (!task.value || draft.value.length !== task.value.text.length) { message.value = '输入完整一段后，再按回车继续。'; return; }
  advanceRequested = true; clearTimeout(sendTimer); flush();
}
function charClass(char, index) { return index < draft.value.length ? (draft.value[index] === char ? 'correct' : 'wrong') : index === draft.value.length ? 'current' : ''; }
function requestLeave() { if (joined.value && state.value?.phase !== 'finished') leaveDialog.value?.showModal(); else exit(); }
async function exit() {
  if (reading) await reading;
  if (busy.value) { message.value = '正在同步输入，请稍后再退出。'; return; }
  busy.value = true;
  try {
    if (state.value?.me) await api('/leave', { seat: state.value.me.seat });
    cleanLeave = true; stopped = true; leaveDialog.value?.close(); emit('back');
  } catch (error) { message.value = `退出失败：${error.message}，请重试。`; }
  finally { busy.value = false; }
}
function leaveBeacon() {
  if (!cleanLeave && state.value?.me) navigator.sendBeacon('/api/boss/leave', new Blob([JSON.stringify({ seat: state.value.me.seat })], { type: 'application/json' }));
}
watch(() => props.user?.id, refresh);
onMounted(() => { refresh(); poll = setInterval(refresh, 1000); clockTimer = setInterval(() => { clock.value = Date.now(); }, 250); window.addEventListener('pagehide', leaveBeacon); });
onBeforeUnmount(() => { stopped = true; clearInterval(poll); clearInterval(clockTimer); clearTimeout(sendTimer); clearTimeout(hitTimer); window.removeEventListener('pagehide', leaveBeacon); leaveBeacon(); });
</script>

<template>
  <div class="boss-game">
    <header class="boss-header">
      <button ref="returnButton" class="boss-back" @click="requestLeave"><ArrowLeft :size="17"/>返回游戏大厅</button>
      <div class="boss-brand"><Swords :size="23"/><strong>极速淘汰赛</strong></div>
      <div class="boss-session"><span class="boss-phase"><i class="boss-status-dot"></i>{{ phaseLabel }}</span><span><Users :size="16"/>幸存 {{ activeCount }}/{{ state?.players.length || 0 }}</span><b><Timer :size="16"/>{{ timeLabel }}</b></div>
    </header>

    <main class="boss-layout">
      <section class="boss-arena elimination-arena" :class="{ 'is-hit': hit, 'is-victory': state?.result?.outcome === 'survivor' }">
        <div class="boss-arena-heading"><h1>{{ eliminated ? '已淘汰 · 观战中' : state?.phase === 'finished' ? '本局已结束' : '末位淘汰，留到最后' }}</h1><span class="boss-stage">第 {{ elimination.round || 1 }} / {{ elimination.totalRounds || 9 }} 轮</span></div>
        <div class="boss-arena-body">
        <div class="stage-self-card"><div class="stage-self-avatar"><img v-if="state?.me?.avatarUrl" :src="state.me.avatarUrl" alt=""/><span v-else>{{ state?.me?.name?.slice(0,1) || '我' }}</span></div><div><strong>{{ state?.me?.name || '你' }}</strong><small :class="{ out: eliminated }">{{ !joined ? '未加入' : eliminated ? '已淘汰' : '存活中' }}</small><p>{{ state?.me ? `当前第 ${state.players.findIndex(player => player.id === state.me.id) + 1} 名` : '等待加入' }}</p></div></div>
        <div class="boss-health elimination-clock"><div><strong>{{ nextEliminationSeconds }}<small> 秒</small></strong><span>{{ running ? `下一轮将淘汰末位 ${elimination.dangerCount} 人` : '每 20 秒结算一次' }}</span></div><progress aria-label="本轮淘汰倒计时" :value="nextEliminationSeconds" max="20"></progress></div>
        <div class="boss-scene elimination-map" aria-hidden="true">
          <i class="zone-ring is-outer"></i><i class="zone-ring is-middle"></i><i class="zone-ring is-safe"></i>
          <div v-for="(player,index) in onStagePlayers" :key="`alive-${player.seat}`" class="zone-player is-alive" :class="{ 'is-self': player.id === props.user?.id }" :style="{ '--slot': index }"><img v-if="player.avatarUrl" :src="player.avatarUrl" alt=""/><b v-else>{{ player.name.slice(0,1) }}</b><small>{{ player.id === props.user?.id ? '你' : player.name }}</small></div>
          <div v-for="(player,index) in eliminatedPlayers" :key="`out-${player.seat}`" class="zone-player is-out" :style="{ '--slot': index + onStagePlayers.length }"><img v-if="player.avatarUrl" :src="player.avatarUrl" alt=""/><b v-else>{{ player.name.slice(0,1) }}</b></div>
          <div class="elimination-emblem"><span>安全区</span><strong>{{ activeCount }}</strong><small>人存活</small></div>
        </div>
        </div>
      </section>

      <aside class="boss-team">
        <header><h2>实时排名</h2><span>{{ activeCount }} 人存活</span></header>
        <button v-if="!joined && state?.phase !== 'finished'" class="boss-primary" :disabled="busy" @click="join">{{ props.user ? '加入淘汰赛' : '登录并加入' }} <ArrowLeft class="boss-arrow" :size="16"/></button>
        <div v-if="joined && state?.phase === 'waiting'" class="boss-gather"><strong>{{ remaining }} 秒后自动开局</strong><button v-if="state.captain === props.user?.id" class="boss-secondary" :disabled="busy" @click="action('/start')">立即开始</button></div>
        <p v-if="!state?.players.length" class="boss-empty">等待选手加入</p>
        <ol class="boss-roster"><li v-for="(player,index) in state?.players || []" :key="player.seat" :class="{ 'is-self': player.id === props.user?.id, 'is-eliminated': player.eliminated }"><span class="boss-rank">{{ index + 1 }}</span><img v-if="player.avatarUrl" :src="player.avatarUrl" :alt="player.name + '的头像'"/><span v-else class="boss-initial">{{ player.name.slice(0, 1) }}</span><div><strong>{{ player.name }}<small v-if="player.id === props.user?.id">你</small><em v-if="player.eliminated" class="boss-combo-tag">已淘汰</em></strong><span>{{ player.accuracy }}% 准确率 · {{ player.correct }} 字{{ player.combo ? ` · ${player.combo} 连击` : '' }}</span></div><b>{{ player.score || 0 }}<small>积分</small></b></li></ol>
        <section class="boss-live"><header><Zap :size="17"/><h2>淘汰战报</h2></header><ul><li v-for="event in newestEvents" :key="event.id" :class="{ 'is-combo': event.kind === 'elimination' }">{{ event.text }}</li><li v-if="!newestEvents.length">暂无战报</li></ul></section>
      </aside>

      <section class="boss-practice">
        <template v-if="state?.phase === 'finished'">
          <div class="boss-result" role="status"><Trophy :size="35"/><div><span class="boss-kicker">{{ state.result.outcome === 'survivor' ? 'LAST SURVIVOR' : '淘汰赛结算' }}</span><h2>{{ state.result.outcome === 'survivor' ? `${state.result.winner?.name || '选手'} 留到了最后` : '本局排名已锁定' }}</h2><p>最终幸存 {{ state.result.survivors || 0 }} 人 · {{ remaining }} 秒后可重新集结</p></div></div>
          <div class="boss-awards"><div><span>生存之星</span><strong>{{ state.result.awards.contribution?.name || '等待下次挑战' }}</strong><small>{{ state.result.awards.contribution?.score || 0 }} 积分</small></div><div><span>精准之星</span><strong>{{ state.result.awards.precision?.name || '需完成至少 20 字' }}</strong><small>{{ state.result.awards.precision ? state.result.awards.precision.accuracy + '% 准确率' : '稳住节奏，继续练习' }}</small></div><div><span>连击之星</span><strong>{{ state.result.awards.combo?.name || '等待下次挑战' }}</strong><small>{{ state.result.awards.combo?.bestCombo || 0 }} 连击</small></div></div>
        </template>
        <template v-else>
          <header><span><Crosshair :size="18"/>输入目标文字</span><b class="practice-round"><i></i>{{ eliminated ? '观战中' : running ? `第 ${elimination.round || 1} 轮` : '等待开始' }}</b></header>
          <div v-if="task && running" class="boss-target"><span v-for="(char,index) in task.text" :key="index" :class="charClass(char,index)">{{ char }}</span></div>
          <div v-else class="boss-waiting"><p>{{ eliminated ? '你已淘汰，可继续查看排名。' : joined ? '开局后显示目标段落。' : '加入后开始打字，每 20 秒淘汰末位选手。' }}</p></div>
          <label class="boss-input-label" for="boss-input">你的输入</label>
          <div class="boss-input-row"><textarea id="boss-input" ref="editor" :value="draft" :maxlength="task?.text.length" :disabled="!task || !running || !connected || eliminated" @input="input" @compositionstart="composing = true" @compositionend="compositionEnd" @keydown.enter="nextSegment" @paste.prevent @drop.prevent autocomplete="off" spellcheck="false" placeholder="在此输入…"></textarea><button class="boss-primary" :disabled="busy || !task || draft.length !== task.text.length || !connected || eliminated" @click="nextSegment">下一段 <Zap :size="17"/><small>Enter ↵</small></button></div>
        </template>
        <p v-if="message || !connected" class="boss-feedback" role="status">{{ message || '连接中断，正在重试…' }}<button v-if="!connected" class="boss-secondary" @click="refresh">重试连接</button></p>
        <div class="boss-my-stats"><span>积分<strong>{{ state?.me?.score || 0 }}</strong></span><span>连击<strong>{{ state?.me?.combo || 0 }}</strong></span><span>正确字数<strong>{{ state?.me?.correct || 0 }}</strong></span><span>存活时长<strong>{{ survivalLabel }}</strong></span></div>
      </section>
    </main>
    <dialog ref="leaveDialog" class="boss-leave" aria-labelledby="boss-leave-title" @close="returnButton?.focus()"><h2 id="boss-leave-title">离开淘汰赛？</h2><p>退出本局比赛，训练记录会保留。</p><div><button class="boss-secondary" @click="leaveDialog.close()">继续挑战</button><button class="boss-primary" :disabled="busy" @click="exit">确认离开</button></div></dialog>
  </div>
</template>

<style src="./boss.css"></style>
