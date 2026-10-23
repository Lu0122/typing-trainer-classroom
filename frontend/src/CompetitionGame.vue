<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
const props = defineProps({ user: { type: Object, default: null } });
const emit = defineEmits(['back', 'login']);
const mode = ref('personal');
const state = ref(null);
const draft = ref('');
const message = ref('');
const busy = ref(false);
const connected = ref(true);
const clock = ref(Date.now());
const editor = ref(null);
let pollTimer; let clockTimer; let sendTimer; let stopped = false; let reading = null; let composing = false; let advanceRequested = false;
let serverOffset = 0;

const joined = computed(() => !!state.value?.me);
const running = computed(() => state.value?.phase === 'running');
const task = computed(() => state.value?.me?.task);
const committed = computed(() => task.value?.typed || '');
const remaining = computed(() => {
  const target = state.value?.phase === 'waiting' ? state.value.startsAt : state.value?.phase === 'running' ? state.value.endsAt : state.value?.result?.endedAt;
  return target ? Math.max(0, Math.ceil((target - clock.value - serverOffset) / 1000)) : 0;
});
const timeLabel = computed(() => `${String(Math.floor(remaining.value / 60)).padStart(2, '0')}:${String(remaining.value % 60).padStart(2, '0')}`);
const modeLabel = computed(() => mode.value === 'team' ? '团队赛' : '个人赛');
const sortedPlayers = computed(() => [...(state.value?.players || [])].sort((a, b) => b.correct - a.correct || b.accuracy - a.accuracy || b.speed - a.speed));
const currentRank = computed(() => { const index = sortedPlayers.value.findIndex((player) => player.id === props.user?.id); return index < 0 ? '-' : index + 1; });

async function api(path = '', body) {
  const response = await fetch(`/api/competition/${mode.value}${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(7000) });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.message || '请求失败'), { status: response.status });
  return data;
}
function apply(data) {
  if (stopped) return;
  const oldRound = state.value?.round; const oldTask = task.value?.id;
  state.value = data; serverOffset = data.serverNow - Date.now(); clock.value = Date.now(); connected.value = true;
  if (oldRound !== data.round || oldTask !== data.me?.task?.id) {
    draft.value = data.me?.task?.typed || ''; advanceRequested = false;
    nextTick(() => editor.value?.focus({ preventScroll: true }));
  } else if (!composing && !draft.value.startsWith(committed.value)) draft.value = committed.value;
}
async function refresh() {
  if (stopped || reading || !props.user) return;
  reading = (async () => { try { apply(await api()); } catch (error) { connected.value = false; message.value = error.message; } })();
  await reading; reading = null;
}
async function action(path, body = {}) {
  if (!props.user) { emit('login'); return; }
  if (reading) await reading;
  if (busy.value || stopped) return;
  busy.value = true; message.value = '';
  try { apply(await api(path, body)); } catch (error) { message.value = error.message; connected.value = error.status !== 401; } finally { busy.value = false; }
}
async function chooseMode(nextMode) {
  if (nextMode === mode.value) return;
  await leaveServer();
  mode.value = nextMode; state.value = null; draft.value = ''; message.value = ''; await refresh();
}
function join() { action('/join'); }
function input(event) {
  if (composing || event.isComposing || !task.value) return;
  const value = event.target.value;
  if (!value.startsWith(committed.value)) { draft.value = committed.value; event.target.value = draft.value; message.value = '已结算的文字不能修改，请继续输入。'; return; }
  draft.value = value.slice(0, task.value.text.length); clearTimeout(sendTimer); sendTimer = setTimeout(flush, 160);
}
async function flush() {
  if (reading) await reading;
  if (busy.value || composing || !task.value || !running.value) return;
  if (draft.value.length > committed.value.length) {
    busy.value = true;
    try { apply(await api('/type', { seat: state.value.me.seat, ticket: task.value.id, text: draft.value.slice(0, committed.value.length + 16) })); } catch (error) { message.value = error.message; } finally { busy.value = false; }
    if (draft.value.length > committed.value.length && running.value) { sendTimer = setTimeout(flush, 180); return; }
  }
  if (advanceRequested && task.value && committed.value.length === task.value.text.length) { advanceRequested = false; await action('/next', { seat: state.value.me.seat, ticket: task.value.id }); }
}
function nextSegment(event) {
  if (composing || event?.isComposing || event?.keyCode === 229) return;
  event?.preventDefault();
  if (!task.value || draft.value.length !== task.value.text.length) { message.value = '请先完整输入这一段。'; return; }
  advanceRequested = true; clearTimeout(sendTimer); flush();
}
function charClass(char, index) { return index < draft.value.length ? (draft.value[index] === char ? 'correct' : 'wrong') : index === draft.value.length ? 'current' : ''; }
async function leave() {
  await leaveServer();
  stopped = true; emit('back');
}
async function leaveServer() {
  if (!state.value?.me || busy.value) return;
  busy.value = true;
  try { await api('/leave', { seat: state.value.me.seat }); state.value = null; }
  catch (error) { message.value = `退出失败：${error.message}`; }
  finally { busy.value = false; }
}
function teamName(team) { return team === 'red' ? '红队' : '蓝队'; }
watch(() => props.user?.id, refresh);
onMounted(() => { refresh(); pollTimer = setInterval(refresh, 900); clockTimer = setInterval(() => { clock.value = Date.now(); }, 250); });
onBeforeUnmount(() => { stopped = true; clearInterval(pollTimer); clearInterval(clockTimer); clearTimeout(sendTimer); });
</script>

<template>
  <div class="competition-page">
    <header class="competition-header"><button type="button" @click="leave">‹ 返回游戏大厅</button><div><strong>比赛模式</strong><small>TYPE TOGETHER · WIN TOGETHER</small></div><span class="competition-clock">{{ timeLabel }}</span></header>
    <main class="competition-main">
      <section class="competition-hero"><span class="competition-kicker">MVP · 60 秒同题比赛</span><h1>和同学一起，打出你的最好成绩。</h1><p>个人赛比正确字数，团队赛比全队总分。所有选手使用同一套题目，服务端统一计时。</p></section>
      <div class="competition-mode-tabs"><button type="button" :class="{ active: mode === 'personal' }" @click="chooseMode('personal')"><strong>个人赛</strong><small>看个人排名 · 1—40 人</small></button><button type="button" :class="{ active: mode === 'team' }" @click="chooseMode('team')"><strong>团队赛</strong><small>红队对蓝队 · 自动均衡分组</small></button></div>
      <section class="competition-layout">
        <div class="competition-play-panel">
          <div class="competition-panel-head"><div><span>{{ modeLabel }}</span><h2>{{ state?.phase === 'finished' ? '比赛已结束' : running ? '比赛进行中' : '等待选手集合' }}</h2></div><span class="competition-status" :class="state?.phase">{{ running ? '比赛中' : state?.phase === 'finished' ? '已结算' : '等待开赛' }}</span></div>
          <div v-if="state?.phase === 'finished'" class="competition-result"><b>{{ mode === 'team' ? `${teamName(state.result?.winner?.team)}获胜` : `${state.result?.winner?.name || '本局'} 暂列第一` }}</b><span>{{ mode === 'team' ? `总正确字数 ${state.result?.winner?.correct || 0}` : `正确 ${state.result?.winner?.correct || 0} 字 · 准确率 ${state.result?.winner?.accuracy || 0}%` }}</span></div>
          <div v-else-if="task && running" class="competition-target"><span v-for="(char,index) in task.text" :key="index" :class="charClass(char,index)">{{ char }}</span></div>
          <div v-else class="competition-waiting"><strong>{{ joined ? `还有 ${Math.max(0, Math.ceil((state.startsAt - clock - serverOffset) / 1000))} 秒自动开赛` : '选择比赛类型后加入赛场' }}</strong><small>{{ mode === 'team' ? '系统会自动把选手分到红队和蓝队' : '完成 60 秒后按正确字数排名' }}</small></div>
          <label class="competition-input-label" for="competition-input">你的输入</label><textarea id="competition-input" ref="editor" :value="draft" :maxlength="task?.text.length" :disabled="!task || !running || !connected" @input="input" @compositionstart="composing = true" @compositionend="composing = false; input($event)" @keydown.enter="nextSegment" @paste.prevent autocomplete="off" spellcheck="false" placeholder="加入比赛后，在这里输入目标文字…"></textarea>
          <div class="competition-actions"><button v-if="!joined && state?.phase !== 'finished'" type="button" class="competition-primary" :disabled="busy" @click="join">{{ props.user ? '加入比赛' : '登录后加入' }}</button><button v-else-if="joined && state?.phase === 'waiting' && state.host === props.user?.id" type="button" class="competition-primary" :disabled="busy" @click="action('/start')">立即开始</button><button v-else-if="joined && running && task && draft.length === task.text.length" type="button" class="competition-primary" @click="nextSegment">下一段 ↵</button><button v-if="joined && state?.phase !== 'finished'" type="button" class="competition-secondary" @click="leave">退出比赛</button></div>
          <p v-if="message" class="competition-message" role="status">{{ message }}</p>
          <div class="competition-stats"><span>我的排名<strong>{{ currentRank }}</strong></span><span>正确字数<strong>{{ state?.me?.correct || 0 }}</strong></span><span>准确率<strong>{{ state?.me?.accuracy || 100 }}%</strong></span><span>速度<strong>{{ state?.me?.speed || 0 }} 字/分</strong></span></div>
        </div>
        <aside class="competition-sidebar"><header><div><span>实时榜单</span><h2>{{ mode === 'team' ? '红蓝对抗' : '个人排名' }}</h2></div><b>{{ state?.players?.length || 0 }}/40</b></header><div v-if="mode === 'team'" class="competition-team-score"><div class="red"><span>红队</span><strong>{{ state?.teams?.find(item => item.team === 'red')?.correct || 0 }}</strong></div><em>VS</em><div class="blue"><span>蓝队</span><strong>{{ state?.teams?.find(item => item.team === 'blue')?.correct || 0 }}</strong></div></div><ol class="competition-ranking"><li v-for="(player,index) in sortedPlayers" :key="player.id" :class="{ mine: player.id === props.user?.id }"><b>{{ index + 1 }}</b><span class="competition-avatar">{{ player.name.slice(0,1) }}</span><div><strong>{{ player.name }}<small v-if="player.id === props.user?.id">我</small></strong><span v-if="mode === 'team'" :class="player.team">{{ teamName(player.team) }} · </span><span>{{ player.accuracy }}% · {{ player.speed }} 字/分</span></div><em>{{ player.correct }}</em></li><li v-if="!sortedPlayers.length" class="empty">等待选手加入</li></ol></aside>
      </section>
    </main>
  </div>
</template>

<style scoped>
.competition-page{min-height:100vh;background:linear-gradient(180deg,#eff7ff,#f8fbff 58%,#edf5fd);color:#203b59;font-family:"Microsoft YaHei UI",system-ui,sans-serif}.competition-header{height:68px;display:flex;align-items:center;gap:24px;padding:0 max(20px,calc((100% - 1160px)/2));background:#fff;border-bottom:1px solid #dce9f5}.competition-header button{border:0;background:none;color:#527492;cursor:pointer;font-size:13px}.competition-header>div{display:flex;flex-direction:column;gap:2px}.competition-header strong{font-size:18px}.competition-header small{color:#91a9bd;font:9px Consolas,monospace;letter-spacing:1.2px}.competition-clock{margin-left:auto;color:#2d7bca;font:700 22px Consolas,monospace}.competition-main{width:min(1100px,calc(100% - 32px));margin:auto;padding:30px 0 44px}.competition-hero{margin-bottom:22px}.competition-kicker{color:#397fc5;font:700 11px Consolas,monospace;letter-spacing:1px}.competition-hero h1{margin:9px 0 8px;color:#183b5f;font-size:31px}.competition-hero p{margin:0;color:#66829b;font-size:13px}.competition-mode-tabs{display:flex;gap:10px;margin-bottom:16px}.competition-mode-tabs button{display:flex;flex-direction:column;align-items:flex-start;min-width:190px;padding:12px 18px;border:1px solid #cfe0ef;border-radius:11px;background:#fff;color:#52718e;cursor:pointer}.competition-mode-tabs button.active{border-color:#3988d5;background:#eaf5ff;color:#2167a6;box-shadow:0 5px 16px #3387d51f}.competition-mode-tabs strong{font-size:15px}.competition-mode-tabs small{margin-top:4px;font-size:11px}.competition-layout{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(280px,.9fr);gap:16px}.competition-play-panel,.competition-sidebar{border:1px solid #d5e4f0;border-radius:15px;background:#fff;box-shadow:0 12px 30px #2b65960d}.competition-play-panel{padding:22px}.competition-panel-head,.competition-sidebar>header{display:flex;align-items:flex-start;justify-content:space-between}.competition-panel-head span:first-child,.competition-sidebar header span{color:#5c83a4;font-size:11px}.competition-panel-head h2,.competition-sidebar h2{margin:5px 0 0;color:#213f5d;font-size:21px}.competition-status{padding:5px 9px;border-radius:99px;color:#64839e;background:#f0f6fb;font-size:11px}.competition-status.running{color:#2b8e67;background:#eaf8f0}.competition-status.finished{color:#9a6d23;background:#fff5dd}.competition-target{min-height:150px;margin:22px 0 13px;padding:22px;border:1px solid #d7e5ef;border-radius:11px;color:#6c8397;background:#fbfdff;font:18px/2 Consolas,"Microsoft YaHei",monospace;letter-spacing:1px}.competition-target span{padding:2px 1px;border-radius:3px}.competition-target span.correct{color:#267c58}.competition-target span.wrong{color:#b94444;background:#ffe8e5}.competition-target span.current{color:#fff;background:#278aca}.competition-waiting,.competition-result{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:150px;margin:22px 0 13px;border:1px dashed #c4dceb;border-radius:11px;background:#f8fcff}.competition-waiting strong{color:#2d6f9e;font-size:17px}.competition-waiting small{margin-top:8px;color:#8299aa}.competition-result b{color:#25825e;font-size:24px}.competition-result span{margin-top:8px;color:#738b9c}.competition-input-label{display:block;margin:12px 0 6px;color:#638099;font-size:11px}.competition-play-panel textarea{width:100%;height:100px;padding:12px;border:2px solid #c4dceb;border-radius:9px;resize:vertical;color:#294b68;font:16px/1.7 Consolas,"Microsoft YaHei",monospace;outline:0}.competition-play-panel textarea:focus{border-color:#3e92d3;box-shadow:0 0 0 3px #3e92d31c}.competition-actions{display:flex;gap:9px;margin-top:12px}.competition-primary,.competition-secondary{padding:10px 18px;border-radius:8px;cursor:pointer;font-weight:700}.competition-primary{border:0;background:#2f83d0;color:#fff}.competition-primary:disabled{opacity:.5;cursor:default}.competition-secondary{border:1px solid #cbdde9;background:#fff;color:#5c7a93}.competition-message{margin:10px 0;color:#bc5a4b;font-size:12px}.competition-stats{display:grid;grid-template-columns:repeat(4,1fr);margin-top:18px;border-top:1px solid #e1ebf2}.competition-stats span{padding:12px 5px;text-align:center;color:#8298a8;font-size:11px;border-right:1px solid #e1ebf2}.competition-stats span:last-child{border:0}.competition-stats strong{display:block;margin-top:4px;color:#2b78b1;font:700 16px Consolas,monospace}.competition-sidebar{padding:18px}.competition-sidebar header>b{color:#8098ab;font:13px Consolas,monospace}.competition-team-score{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:8px;margin:17px 0;padding:12px;border:1px solid #e5edf4;border-radius:10px;background:#f9fcff;text-align:center}.competition-team-score div{display:flex;flex-direction:column;gap:3px}.competition-team-score span{font-size:11px}.competition-team-score strong{font:700 22px Consolas,monospace}.competition-team-score .red{color:#d85855}.competition-team-score .blue{color:#3679cb}.competition-team-score em{color:#a7b6c2;font:italic 12px Georgia,serif}.competition-ranking{display:flex;flex-direction:column;gap:7px;margin:17px 0 0;padding:0;list-style:none}.competition-ranking li{display:grid;grid-template-columns:22px 30px 1fr auto;align-items:center;gap:7px;padding:8px 5px;border-radius:8px}.competition-ranking li.mine{background:#edf6ff}.competition-ranking li.empty{display:block;padding:25px;text-align:center;color:#8da1b0;font-size:12px}.competition-ranking li>b{color:#7f98aa;text-align:center;font:700 13px Consolas,monospace}.competition-avatar{display:grid;place-items:center;width:28px;height:28px;border-radius:50%;color:#fff;background:#76a6cf;font-size:12px}.competition-ranking li:nth-child(1) .competition-avatar{background:#e4a944}.competition-ranking div{min-width:0}.competition-ranking strong{display:block;overflow:hidden;color:#345872;font-size:12px;text-overflow:ellipsis;white-space:nowrap}.competition-ranking strong small{margin-left:4px;color:#297ac5;font-size:10px}.competition-ranking div>span{font-size:10px;color:#8da0ad}.competition-ranking div>span.red{color:#d45c59}.competition-ranking div>span.blue{color:#367dcc}.competition-ranking em{color:#2e75a8;font:700 14px Consolas,monospace;font-style:normal}@media(max-width:760px){.competition-main{width:calc(100% - 20px);padding-top:20px}.competition-hero h1{font-size:25px}.competition-layout{grid-template-columns:1fr}.competition-mode-tabs button{flex:1;min-width:0}.competition-header{padding-inline:12px}.competition-header strong{font-size:16px}.competition-stats{grid-template-columns:repeat(2,1fr)}.competition-stats span:nth-child(2){border-right:0}.competition-clock{font-size:18px}.competition-play-panel{padding:15px}}
</style>
