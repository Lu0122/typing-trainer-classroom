<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Trophy } from 'lucide-vue-next';
import AppHeader from './AppHeader.vue';

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

let pollTimer;
let clockTimer;
let sendTimer;
let stopped = false;
let reading = null;
let composing = false;
let advanceRequested = false;
let serverOffset = 0;

const joined = computed(() => !!state.value?.me);
const phase = computed(() => state.value?.phase || 'waiting');
const phaseLabel = computed(() => state.value?.phaseLabel || '检录中');
const running = computed(() => phase.value === 'qualifier' || phase.value === 'final');
const spectating = computed(() => !!state.value?.me?.spectating);
const task = computed(() => state.value?.me?.task);
const committed = computed(() => task.value?.typed || '');
const modeLabel = computed(() => (mode.value === 'team' ? '团队赛' : '晋级赛'));
const isHost = computed(() => joined.value && state.value?.host === props.user?.id);

// 倒计时目标：检录看开赛时间，比赛中看本轮结束时间，结算后看成绩展示结束时间
const countdownTarget = computed(() => {
  const value = state.value;
  if (!value) return null;
  if (value.phase === 'waiting') return value.startsAt;
  if (value.phase === 'qualifier' || value.phase === 'break' || value.phase === 'final') return value.endsAt;
  return value.result?.endedAt ? value.result.endedAt + (value.config?.resultMs || 30000) : null;
});
const remaining = computed(() => {
  const target = countdownTarget.value;
  return target ? Math.max(0, Math.ceil((target - clock.value - serverOffset) / 1000)) : 0;
});
const timeLabel = computed(() => `${String(Math.floor(remaining.value / 60)).padStart(2, '0')}:${String(remaining.value % 60).padStart(2, '0')}`);
// 进度条要用当前阶段的总时长做分母，否则检录期会一直显示满格
const phaseTotal = computed(() => {
  const config = state.value?.config;
  if (!config) return 60;
  if (phase.value === 'waiting') return Math.round(config.gatherMs / 1000);
  if (phase.value === 'qualifier') return Math.round(config.qualifierMs / 1000);
  if (phase.value === 'break') return Math.round(config.breakMs / 1000);
  if (phase.value === 'final') return Math.round(config.finalMs / 1000);
  return Math.round(config.resultMs / 1000);
});
const progress = computed(() => Math.max(0, Math.min(100, (remaining.value / Math.max(1, phaseTotal.value)) * 100)));
const countdownHint = computed(() => {
  if (phase.value === 'waiting') return '距离初赛开始';
  if (phase.value === 'break') return '距离决赛开始';
  if (phase.value === 'finished') return '成绩展示结束';
  return '本轮剩余';
});

const finalists = computed(() => state.value?.finalists || 16);

// 榜单：初赛/决赛看实时成绩，公布晋级阶段看初赛结算排名，结束后看最终名次
const ranking = computed(() => {
  const value = state.value;
  if (!value) return [];
  if (value.phase === 'finished' && value.result) {
    return value.result.final?.ranking?.length ? value.result.final.ranking : value.result.qualifier?.ranking || [];
  }
  if (value.phase === 'break' && value.qualifierRanking) return value.qualifierRanking;
  return [...value.players].sort((a, b) => b.correct - a.correct || b.accuracy - a.accuracy || b.speed - a.speed);
});
const myRank = computed(() => {
  const index = ranking.value.findIndex((row) => row.id === props.user?.id);
  return index < 0 ? '—' : index + 1;
});
const qualifiedList = computed(() => (state.value?.qualifierRanking || []).filter((row) => row.qualified));
const champion = computed(() => state.value?.result?.winner || null);
const exportUrl = computed(() => `/api/competition/${mode.value}/export.csv`);

async function api(path = '', body) {
  const response = await fetch(`/api/competition/${mode.value}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(7000)
  });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.message || '请求失败'), { status: response.status });
  return data;
}

function apply(data) {
  if (stopped) return;
  const oldRound = state.value?.round;
  const oldTask = task.value?.id;
  const oldPhase = state.value?.phase;
  state.value = data;
  serverOffset = data.serverNow - Date.now();
  clock.value = Date.now();
  connected.value = true;
  if (oldRound !== data.round || oldTask !== data.me?.task?.id) {
    draft.value = data.me?.task?.typed || '';
    advanceRequested = false;
    nextTick(() => editor.value?.focus({ preventScroll: true }));
  } else if (!composing && !draft.value.startsWith(committed.value)) {
    draft.value = committed.value;
  }
  if (oldPhase !== data.phase) message.value = '';
}

async function refresh() {
  if (stopped || reading || !props.user) return;
  reading = (async () => {
    try {
      apply(await api());
    } catch (error) {
      connected.value = false;
      message.value = error.message;
    }
  })();
  await reading;
  reading = null;
}

async function action(path, body = {}) {
  if (!props.user) {
    emit('login');
    return;
  }
  if (reading) await reading;
  if (busy.value || stopped) return;
  busy.value = true;
  message.value = '';
  try {
    apply(await api(path, body));
  } catch (error) {
    message.value = error.message;
    connected.value = error.status !== 401;
  } finally {
    busy.value = false;
  }
}

async function chooseMode(nextMode) {
  if (nextMode === mode.value) return;
  await leaveServer();
  mode.value = nextMode;
  state.value = null;
  draft.value = '';
  message.value = '';
  await refresh();
}

function join() {
  action('/join');
}

function input(event) {
  if (composing || event.isComposing || !task.value) return;
  const value = event.target.value;
  if (!value.startsWith(committed.value)) {
    draft.value = committed.value;
    event.target.value = draft.value;
    message.value = '已结算的文字不能修改，请继续输入。';
    return;
  }
  draft.value = value.slice(0, task.value.text.length);
  clearTimeout(sendTimer);
  sendTimer = setTimeout(flush, 160);
}

async function flush() {
  if (reading) await reading;
  if (busy.value || composing || !task.value || !running.value) return;
  if (draft.value.length > committed.value.length) {
    busy.value = true;
    try {
      apply(await api('/type', {
        seat: state.value.me.seat,
        ticket: task.value.id,
        text: draft.value.slice(0, committed.value.length + 16)
      }));
    } catch (error) {
      message.value = error.message;
    } finally {
      busy.value = false;
    }
    if (draft.value.length > committed.value.length && running.value) {
      sendTimer = setTimeout(flush, 180);
      return;
    }
  }
  if (advanceRequested && task.value && committed.value.length === task.value.text.length) {
    advanceRequested = false;
    await action('/next', { seat: state.value.me.seat, ticket: task.value.id });
  }
}

function nextSegment(event) {
  if (composing || event?.isComposing || event?.keyCode === 229) return;
  event?.preventDefault();
  if (!task.value || draft.value.length !== task.value.text.length) {
    message.value = '请先完整输入这一段。';
    return;
  }
  advanceRequested = true;
  clearTimeout(sendTimer);
  flush();
}

function charClass(char, index) {
  if (index < draft.value.length) return draft.value[index] === char ? 'correct' : 'wrong';
  return index === draft.value.length ? 'current' : '';
}

async function leave() {
  await leaveServer();
  stopped = true;
  emit('back');
}

async function leaveServer() {
  if (!state.value?.me || busy.value) return;
  busy.value = true;
  try {
    await api('/leave', { seat: state.value.me.seat });
    state.value = null;
  } catch (error) {
    message.value = `退出失败：${error.message}`;
  } finally {
    busy.value = false;
  }
}

function teamName(team) {
  return team === 'red' ? '红队' : '蓝队';
}

watch(() => props.user?.id, refresh);
onMounted(() => {
  refresh();
  pollTimer = setInterval(refresh, 900);
  clockTimer = setInterval(() => { clock.value = Date.now(); }, 250);
});
onBeforeUnmount(() => {
  stopped = true;
  clearInterval(pollTimer);
  clearInterval(clockTimer);
  clearTimeout(sendTimer);
});
</script>

<template>
  <div class="competition-page">
    <AppHeader
      title="打字比赛"
      subtitle="QUALIFIER · FINAL"
      :icon="Trophy"
      back-label="返回大厅"
      :user="props.user"
      @back="leave"
      @account="emit('login')"
    >
      <template #status>
        <span>{{ phaseLabel }}</span>
        <b>{{ timeLabel }}</b>
      </template>
      <template #actions>
        <a class="ah-link" :href="`/board?mode=${mode}`" target="_blank" rel="noopener">大屏模式 ↗</a>
      </template>
    </AppHeader>

    <main class="competition-main">
      <div class="competition-mode-tabs">
        <button type="button" :class="{ active: mode === 'personal' }" @click="chooseMode('personal')">
          <strong>个人晋级赛</strong><small>初赛 90 秒 → 前 16 名 → 决赛 60 秒</small>
        </button>
        <button type="button" :class="{ active: mode === 'team' }" @click="chooseMode('team')">
          <strong>团队赛</strong><small>红蓝对抗 · 单轮 90 秒比总分</small>
        </button>
      </div>

      <section class="competition-layout">
        <div class="competition-play-panel">
          <div class="competition-panel-head">
            <div><span>{{ modeLabel }}</span><h2>{{ phaseLabel }}</h2></div>
            <span class="competition-status" :class="phase">{{ phaseLabel }}</span>
          </div>

          <div class="competition-timer">
            <small>{{ countdownHint }}</small>
            <strong>{{ timeLabel }}</strong>
            <div class="competition-timer-bar"><i :style="{ width: `${progress}%` }"></i></div>
          </div>

          <div v-if="phase === 'finished'" class="competition-podium">
            <template v-if="mode === 'team'">
              <b>{{ teamName(champion?.team) }}获胜</b>
              <span>总正确字数 {{ champion?.correct || 0 }}</span>
            </template>
            <template v-else>
              <b>{{ champion?.name || '无' }} 夺冠</b>
              <span>决赛 {{ champion?.correct || 0 }} 字 · 准确率 {{ champion?.accuracy || 0 }}%</span>
            </template>
            <ol class="competition-podium-list">
              <li v-for="row in ranking.slice(0, 3)" :key="row.id"><b>{{ row.rank }}</b><span>{{ row.name }}</span><em>{{ row.correct }} 字</em></li>
            </ol>
            <a class="competition-export" :href="exportUrl">导出成绩单（CSV）</a>
          </div>

          <div v-else-if="phase === 'break'" class="competition-break">
            <b>晋级决赛 · 前 {{ qualifiedList.length }} 名</b>
            <div class="competition-break-list">
              <span v-for="row in qualifiedList" :key="row.id" :class="{ mine: row.id === props.user?.id }">
                {{ row.rank }}. {{ row.name }} <em>{{ row.correct }} 字</em>
              </span>
            </div>
            <small v-if="joined && !state.me?.qualified">你没有晋级，接下来可以观战决赛。</small>
          </div>

          <div v-else-if="phase === 'final' && spectating" class="competition-spectate">
            <b>你未晋级决赛，正在观战</b>
            <small>决赛前 {{ finalists }} 名选手正在作答，右侧榜单实时更新。</small>
          </div>

          <div v-else-if="task && running" class="competition-target">
            <span v-for="(char, index) in task.text" :key="index" :class="charClass(char, index)">{{ char }}</span>
          </div>

          <div v-else class="competition-waiting">
            <strong>{{ joined ? `${remaining} 秒后自动开始初赛` : '加入赛场，等待统一开赛' }}</strong>
            <small>{{ mode === 'team' ? '系统会自动把选手分到红队和蓝队' : `初赛 90 秒按正确字数取前 ${finalists} 名进入决赛` }}</small>
          </div>

          <label class="competition-input-label" for="competition-input">你的输入</label>
          <textarea
            id="competition-input"
            ref="editor"
            :value="draft"
            :maxlength="task?.text.length"
            :disabled="!task || !running || !connected || spectating"
            @input="input"
            @compositionstart="composing = true"
            @compositionend="composing = false; input($event)"
            @keydown.enter="nextSegment"
            @paste.prevent
            autocomplete="off"
            spellcheck="false"
            :placeholder="running ? '在这里输入目标文字…' : '等待比赛开始…'"
          ></textarea>

          <div class="competition-actions">
            <button v-if="!joined && phase === 'waiting'" type="button" class="competition-primary" :disabled="busy" @click="join">{{ props.user ? '加入比赛' : '登录后加入' }}</button>
            <button v-else-if="isHost && phase === 'waiting'" type="button" class="competition-primary" :disabled="busy" @click="action('/start')">立即开始初赛</button>
            <button v-else-if="running && task && draft.length === task.text.length" type="button" class="competition-primary" @click="nextSegment">下一段 ↵</button>
            <button v-if="joined && phase !== 'finished'" type="button" class="competition-secondary" @click="leave">退出比赛</button>
          </div>

          <p v-if="message" class="competition-message" role="status">{{ message }}</p>

          <div class="competition-stats">
            <span>我的名次<strong>{{ myRank }}</strong></span>
            <span>本轮字数<strong>{{ state?.me?.correct || 0 }}</strong></span>
            <span>准确率<strong>{{ state?.me?.accuracy || 100 }}%</strong></span>
            <span>速度<strong>{{ state?.me?.speed || 0 }} 字/分</strong></span>
          </div>
          <p v-if="state?.me?.flagged" class="competition-warning">系统检测到你的输入速率异常，本轮成绩可能作废。</p>
        </div>

        <aside class="competition-sidebar">
          <header>
            <div><span>实时榜单</span><h2>{{ mode === 'team' ? '红蓝对抗' : phase === 'break' ? '晋级名单' : '个人排名' }}</h2></div>
            <b>{{ state?.players?.length || 0 }}/{{ state?.capacity || 60 }}</b>
          </header>

          <div v-if="mode === 'team'" class="competition-team-score">
            <div class="red"><span>红队</span><strong>{{ state?.teams?.find(item => item.team === 'red')?.correct || 0 }}</strong></div>
            <em>VS</em>
            <div class="blue"><span>蓝队</span><strong>{{ state?.teams?.find(item => item.team === 'blue')?.correct || 0 }}</strong></div>
          </div>

          <ol class="competition-ranking">
            <li
              v-for="(row, index) in ranking"
              :key="row.id"
              :class="{ mine: row.id === props.user?.id, cut: mode === 'personal' && index + 1 === finalists + 1 }"
            >
              <b>{{ row.rank ?? index + 1 }}</b>
              <span class="competition-avatar">{{ row.name.slice(0, 1) }}</span>
              <div>
                <strong>{{ row.name }}<small v-if="row.id === props.user?.id">我</small></strong>
                <span v-if="mode === 'team'" :class="row.team">{{ teamName(row.team) }} · </span>
                <span>{{ row.accuracy }}% · {{ row.speed }} 字/分</span>
              </div>
              <em>{{ row.correct }}</em>
              <i v-if="row.disqualified" class="flag">作废</i>
              <i v-else-if="row.flagged" class="flag">异常</i>
            </li>
            <li v-if="!ranking.length" class="empty">等待选手加入</li>
          </ol>
        </aside>
      </section>
    </main>
  </div>
</template>

<style scoped>
.competition-page{min-height:100vh;background:linear-gradient(180deg,#eff7ff,#f8fbff 58%,#edf5fd);color:#203b59;font-family:"Microsoft YaHei UI",system-ui,sans-serif}
.competition-main{width:min(1120px,calc(100% - 32px));margin:auto;padding:22px 0 40px}
.competition-mode-tabs{display:flex;gap:10px;margin-bottom:16px}
.competition-mode-tabs button{display:flex;flex-direction:column;align-items:flex-start;min-width:230px;padding:12px 18px;border:1px solid #cfe0ef;border-radius:11px;background:#fff;color:#52718e;cursor:pointer;text-align:left}
.competition-mode-tabs button.active{border-color:#3988d5;background:#eaf5ff;color:#2167a6;box-shadow:0 5px 16px #3387d51f}
.competition-mode-tabs strong{font-size:15px}
.competition-mode-tabs small{margin-top:4px;font-size:11px}
.competition-layout{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(290px,.9fr);gap:16px}
.competition-play-panel,.competition-sidebar{border:1px solid #d5e4f0;border-radius:15px;background:#fff;box-shadow:0 12px 30px #2b65960d}
.competition-play-panel{padding:20px}
.competition-panel-head,.competition-sidebar>header{display:flex;align-items:flex-start;justify-content:space-between}
.competition-panel-head span:first-child,.competition-sidebar header span{color:#7d97ae;font-size:11px;letter-spacing:.5px}
.competition-panel-head h2,.competition-sidebar h2{margin:4px 0 0;font-size:17px;color:#183b5f}
.competition-status{padding:4px 10px;border-radius:999px;background:#eef4fa;color:#5a7d9b;font-size:11px}
.competition-status.qualifier,.competition-status.final{background:#e6f4ff;color:#1f6bb0}
.competition-status.break{background:#fff4e0;color:#a86a12}
.competition-status.finished{background:#e9f7ef;color:#1f7a4d}
.competition-timer{display:flex;flex-direction:column;gap:6px;margin:14px 0 16px}
.competition-timer small{color:#8299ad;font-size:11px}
.competition-timer strong{color:#1f6bb0;font:700 34px Consolas,monospace;line-height:1}
.competition-timer-bar{height:6px;border-radius:999px;background:#e7eff7;overflow:hidden}
.competition-timer-bar i{display:block;height:100%;background:linear-gradient(90deg,#4fa0e8,#2d7bca);transition:width .3s linear}
.competition-target{min-height:112px;padding:16px;border-radius:12px;background:#f6faff;border:1px solid #e2edf7;font-size:20px;line-height:1.9;letter-spacing:1px;word-break:break-all}
.competition-target span{padding:1px 0}
.competition-target .correct{color:#1f8a5b}
.competition-target .wrong{color:#d5484a;background:#fdecec;border-radius:3px}
.competition-target .current{border-left:2px solid #2d7bca;animation:caret 1s steps(2) infinite}
@keyframes caret{50%{border-color:transparent}}
.competition-waiting,.competition-spectate,.competition-break{display:flex;flex-direction:column;gap:8px;min-height:112px;justify-content:center;padding:16px;border-radius:12px;background:#f6faff;border:1px dashed #cfe0ef}
.competition-waiting strong,.competition-spectate b,.competition-break b{font-size:16px;color:#1f5c92}
.competition-waiting small,.competition-spectate small,.competition-break small{color:#7d97ae;font-size:12px}
.competition-break-list{display:flex;flex-wrap:wrap;gap:8px}
.competition-break-list span{padding:4px 10px;border-radius:999px;background:#eaf5ff;color:#2167a6;font-size:12px}
.competition-break-list span.mine{background:#2d7bca;color:#fff}
.competition-break-list em{font-style:normal;opacity:.75}
.competition-podium{display:flex;flex-direction:column;gap:10px;min-height:112px;padding:16px;border-radius:12px;background:linear-gradient(180deg,#f3f9ff,#eaf4ff);border:1px solid #cfe4f7}
.competition-podium b{font-size:20px;color:#16518a}
.competition-podium>span{color:#5b7d9c;font-size:12px}
.competition-podium-list{display:flex;flex-direction:column;gap:6px;margin:4px 0 0;padding:0;list-style:none}
.competition-podium-list li{display:flex;align-items:center;gap:10px;font-size:13px;color:#2b4f70}
.competition-podium-list b{font:700 14px Consolas,monospace;color:#2d7bca}
.competition-podium-list em{margin-left:auto;font-style:normal;color:#7d97ae}
.competition-export{align-self:flex-start;margin-top:4px;padding:7px 14px;border-radius:9px;background:#1f6bb0;color:#fff;font-size:12px;text-decoration:none}
.competition-input-label{margin:16px 0 6px;color:#7d97ae;font-size:11px}
.competition-input-label+textarea{width:100%;min-height:74px;padding:12px 14px;border:1px solid #cfe0ef;border-radius:11px;background:#fff;color:#183b5f;font-size:17px;line-height:1.6;resize:vertical}
.competition-input-label+textarea:focus{outline:none;border-color:#3988d5;box-shadow:0 0 0 3px #3988d51f}
.competition-input-label+textarea:disabled{background:#f4f8fc;color:#9db3c6}
.competition-actions{display:flex;gap:10px;margin-top:12px}
.competition-primary{padding:10px 20px;border:0;border-radius:10px;background:#1f6bb0;color:#fff;font-size:13px;cursor:pointer}
.competition-primary:disabled{opacity:.5;cursor:not-allowed}
.competition-secondary{padding:10px 16px;border:1px solid #cfe0ef;border-radius:10px;background:#fff;color:#5a7d9b;font-size:13px;cursor:pointer}
.competition-message{margin:10px 0 0;color:#b4472f;font-size:12px}
.competition-warning{margin:8px 0 0;color:#a86a12;font-size:12px}
.competition-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:16px}
.competition-stats span{display:flex;flex-direction:column;gap:4px;padding:10px 12px;border-radius:10px;background:#f6faff;color:#7d97ae;font-size:11px}
.competition-stats strong{color:#183b5f;font:700 16px Consolas,monospace}
.competition-sidebar{padding:18px}
.competition-sidebar header b{color:#7d97ae;font:600 12px Consolas,monospace}
.competition-team-score{display:flex;align-items:center;gap:10px;margin:14px 0 6px}
.competition-team-score div{flex:1;padding:10px;border-radius:10px;text-align:center}
.competition-team-score .red{background:#fdeeee;color:#b4373a}
.competition-team-score .blue{background:#eef2fd;color:#3a55b4}
.competition-team-score span{display:block;font-size:11px}
.competition-team-score strong{font:700 20px Consolas,monospace}
.competition-team-score em{font-style:normal;color:#b3c5d5;font-size:11px}
.competition-ranking{margin:12px 0 0;padding:0;list-style:none;max-height:min(58vh,520px);overflow:auto}
.competition-ranking li{display:flex;align-items:center;gap:9px;padding:8px 6px;border-bottom:1px solid #eef4fa;font-size:13px}
.competition-ranking li.cut{border-top:2px dashed #e2b04a;margin-top:2px}
.competition-ranking li.mine{background:#f2f9ff;border-radius:8px}
.competition-ranking li>b{width:22px;color:#9db3c6;font:700 12px Consolas,monospace;text-align:right}
.competition-avatar{width:26px;height:26px;border-radius:50%;background:#e7f1fb;color:#2d7bca;display:grid;place-items:center;font-size:12px;flex:none}
.competition-ranking li>div{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1}
.competition-ranking li>div strong{font-size:13px;color:#22496c;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.competition-ranking li>div strong small{margin-left:6px;padding:1px 5px;border-radius:4px;background:#2d7bca;color:#fff;font-size:10px}
.competition-ranking li>div span{color:#8ba3b8;font-size:11px}
.competition-ranking li>div span.red{color:#b4373a}
.competition-ranking li>div span.blue{color:#3a55b4}
.competition-ranking li>em{font:700 14px Consolas,monospace;color:#2d7bca}
.competition-ranking .flag{font-style:normal;padding:1px 5px;border-radius:4px;background:#fdecec;color:#c0392b;font-size:10px}
.competition-ranking .empty{justify-content:center;color:#a7bccd;font-size:12px;border:0}
@media (max-width:900px){.competition-layout{grid-template-columns:1fr}.competition-stats{grid-template-columns:repeat(2,1fr)}}
</style>
