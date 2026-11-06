<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { Trophy } from 'lucide-vue-next';
import AppHeader from './AppHeader.vue';
import PinyinLineInput from './PinyinLineInput.vue';

const props = defineProps({ user: { type: Object, default: null }, locked: { type: Boolean, default: false } });
const emit = defineEmits(['back', 'login']);

const mode = ref('personal');
const state = ref(null);
const draft = ref('');
const message = ref('');
const busy = ref(false);
const connected = ref(true);
const clock = ref(Date.now());
const editor = ref(null);

// 新赛事引擎：有老师创建的赛事时，学生端优先显示新赛事入口。
const eventList = ref([]);
const eventId = ref(null);
const eventState = ref(null);
const eventSideId = ref(null);
const eventDraft = ref('');
const eventSubmittedPrefix = ref('');
const eventLineInput = ref(null);
const viewportWidth = ref(window.innerWidth);
const viewportHeight = ref(window.innerHeight);
const eventStage = ref(null);
const eventPracticeWidth = ref(0);
let eventStageObserver;
const eventBusy = ref(false);
const eventMessage = ref('');
const eventMode = ref(true);
let eventReading = null;
let eventSendTimer;
let eventPollTimer;
let eventBoundaryTimer;

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

const eventJoined = computed(() => !!eventState.value?.me);
const eventIsTeam = computed(() => eventState.value?.mode === 'team');
const eventIsSpeed = computed(() => eventState.value?.mode === 'speed');
const eventLanguage = computed(() => eventState.value?.config?.language === 'en' ? '英文' : '中文');
const eventRunning = computed(() => eventState.value?.status === 'running' && eventState.value?.round?.status === 'running');
const eventPlayerFinished = computed(() => Boolean(eventState.value?.me?.finished));
const eventCanType = computed(() => eventRunning.value && !eventPlayerFinished.value);
const eventFinished = computed(() => eventState.value?.status === 'finished');
// 老师终止赛事：学生被放回其他页面，这里只负责给出明确提示，不再上报成绩。
const eventTerminated = computed(() => eventState.value?.status === 'terminated');
const eventText = computed(() => eventState.value?.round?.text || '');
const eventCommitted = computed(() => eventState.value?.me?.typed || '');
const eventLockedPrefix = computed(() => eventSubmittedPrefix.value.length > eventCommitted.value.length ? eventSubmittedPrefix.value : eventCommitted.value);
const eventVisibleLines = computed(() => viewportWidth.value <= 620 ? 4 : Math.max(3, Math.min(9, Math.floor((viewportHeight.value - 310) / 89))));
const eventLineLimit = computed(() => {
  const english = eventState.value?.config?.language === 'en';
  const width = eventPracticeWidth.value || Math.max(280, viewportWidth.value - (viewportWidth.value > 900 ? 420 : 80));
  const charWidth = viewportWidth.value <= 620 ? (english ? 9 : 17) : (english ? 12 : 22);
  return Math.max(10, Math.min(english ? 110 : 64, Math.floor((width - 18) / charWidth)));
});
const eventLines = computed(() => {
  const text = eventText.value;
  const english = eventState.value?.config?.language === 'en';
  const limit = eventLineLimit.value;
  const lines = [];
  for (let offset = 0; offset < text.length;) {
    let end = Math.min(offset + limit, text.length);
    if (end < text.length) {
      if (english) {
        const space = text.lastIndexOf(' ', end);
        if (space >= offset + Math.floor(limit * .55)) end = space + 1;
      } else {
        const marks = ['，', '。', '；', '！', '？'];
        const cut = Math.max(...marks.map(mark => text.lastIndexOf(mark, end - 1)));
        if (cut >= offset + Math.floor(limit * .6)) end = cut + 1;
      }
    }
    lines.push({ offset, line: text.slice(offset, end) });
    offset = end;
  }
  return lines;
});
const eventActiveLineIndex = computed(() => {
  const index = eventLines.value.findIndex(segment => eventDraft.value.length < segment.offset + segment.line.length);
  return index < 0 ? Math.max(0, eventLines.value.length - 1) : index;
});
watch(eventActiveLineIndex, (index, previous) => {
  if (index !== previous && eventRunning.value && eventState.value?.me) {
    nextTick(() => {
      if (eventRunning.value && document.activeElement === document.body) eventLineInput.value?.focus();
    });
  }
}, { flush: 'post' });
const eventUsedSeconds = computed(() => {
  const round = eventState.value?.round;
  if (!round?.startsAt) return 0;
  const elapsed = eventFinished.value && eventState.value?.me?.timeMs != null
    ? eventState.value.me.timeMs
    : Math.max(0, clock.value + serverOffset - round.startsAt);
  return Math.min(Math.round(elapsed / 1000), Math.ceil(round.durationMs / 1000));
});
const eventTypedAccuracy = computed(() => {
  if (!eventDraft.value.length) return 0;
  let correct = 0;
  for (let index = 0; index < eventDraft.value.length; index += 1) if (eventDraft.value[index] === eventText.value[index]) correct += 1;
  return Math.round(correct / eventDraft.value.length * 100);
});
const eventTypedProgress = computed(() => Math.round(eventDraft.value.length / Math.max(1, eventText.value.length) * 100));
const eventTypedSpeed = computed(() => {
  let correct = 0;
  for (let index = 0; index < eventDraft.value.length; index += 1) if (eventDraft.value[index] === eventText.value[index]) correct += 1;
  return Math.round(correct * 60 / Math.max(1, eventUsedSeconds.value));
});
const eventRanking = computed(() => {
  const settled = eventState.value?.ranking || [];
  if (settled.length) return settled;
  if (eventIsSpeed.value) return (eventState.value?.players || []).slice()
    .sort((a, b) => b.correct - a.correct || b.accuracy - a.accuracy || (a.timeMs ?? Infinity) - (b.timeMs ?? Infinity))
    .map((player, index) => ({ ...player, rank: index + 1 }));
  return (eventState.value?.players || []).slice().sort((a, b) => {
    if (a.finished !== b.finished) return a.finished ? -1 : 1;
    if (a.finished && b.finished) return (a.elapsedMs ?? Number.MAX_SAFE_INTEGER) - (b.elapsedMs ?? Number.MAX_SAFE_INTEGER);
    return b.correct - a.correct || b.accuracy - a.accuracy;
  }).map((player, index) => ({ ...player, rank: index + 1 }));
});
const eventRemaining = computed(() => {
  const target = eventState.value?.round?.status === 'countdown' ? eventState.value.round.startsAt : eventState.value?.round?.endsAt;
  return target ? Math.max(0, Math.ceil((target - clock.value - serverOffset) / 1000)) : 0;
});
const eventTimeLabel = computed(() => `${String(Math.floor(eventRemaining.value / 60)).padStart(2, '0')}:${String(eventRemaining.value % 60).padStart(2, '0')}`);
const eventProgress = computed(() => {
  const total = Number(eventState.value?.round?.status === 'countdown' ? eventState.value?.config?.countdownMs : eventState.value?.round?.durationMs || eventState.value?.config?.roundMs || 1) / 1000;
  return Math.max(0, Math.min(100, eventRemaining.value / Math.max(1, total) * 100));
});
const eventPhaseLabel = computed(() => {
  if (!props.user) return '登录后查看赛事';
  if (!eventState.value) return '等待老师开赛';
  if (eventTerminated.value) return '比赛已终止';
  if (eventFinished.value) return '比赛结束';
  if (eventState.value?.status === 'paused') return eventState.value?.round?.status === 'scheduled' ? '等待计划时间' : '比赛已暂停';
  if (eventState.value?.round?.status === 'countdown') return '即将开赛';
  if (eventRunning.value) return '比赛进行中';
  if (eventState.value?.round?.status === 'settled') return '等待下一轮';
  if (eventState.value?.status === 'registration') return '检录中';
  return '等待老师开赛';
});

// Chrome 在 Windows 上默认用覆盖式滚动条，静止时完全看不见，
// 全班四五十人时学生根本看不出「本场结果 / 选手排名」还能往下翻。
// 所以自绘一个常驻滑块：只有内容真的溢出才出现，滚动 / 尺寸变化 / 行数变化时重算。
const resultScrollEl = ref(null);
const rankScrollEl = ref(null);
const resultThumb = reactive({ visible: false, height: 0, top: 0 });
const rankThumb = reactive({ visible: false, height: 0, top: 0 });

function updateScrollThumb(el, thumb) {
  if (!el) { thumb.visible = false; return; }
  const { scrollHeight, clientHeight, scrollTop } = el;
  if (scrollHeight <= clientHeight + 2) { thumb.visible = false; return; }
  const height = Math.max(26, Math.round((clientHeight / scrollHeight) * clientHeight));
  const maxTop = Math.max(0, clientHeight - height);
  const ratio = scrollTop / Math.max(1, scrollHeight - clientHeight);
  thumb.visible = true;
  thumb.height = height;
  thumb.top = Math.round(Math.min(maxTop, Math.max(0, ratio * maxTop)));
}
const updateResultThumb = () => updateScrollThumb(resultScrollEl.value, resultThumb);
const updateRankThumb = () => updateScrollThumb(rankScrollEl.value, rankThumb);
function updateListThumbs() { updateResultThumb(); updateRankThumb(); }

function updateViewportWidth() {
  // 放在提前 return 之前：作答中也要保持滑块位置正确。
  updateListThumbs();
  // Keep line boundaries and page position stable once the contestant is typing.
  if (eventDraft.value.length) return;
  viewportWidth.value = window.innerWidth;
  viewportHeight.value = window.innerHeight;
  if (eventStage.value) {
    const style = getComputedStyle(eventStage.value);
    eventPracticeWidth.value = eventStage.value.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  }
}

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

async function eventApi(path = '', body) {
  const response = await fetch(`/api/competitions/${eventId.value}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(7000)
  });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.message || '赛事请求失败'), { status: response.status });
  return data;
}

function applyEvent(data) {
  if (stopped) return;
  const oldRound = eventState.value?.round?.id;
  const oldRoundStatus = eventState.value?.round?.status;
  eventState.value = data;
  // 名次变化会改变列表高度，滑块要跟着重算。
  nextTick(updateListThumbs);
  clearTimeout(eventBoundaryTimer);
  if (data.round?.status === 'countdown') eventBoundaryTimer = setTimeout(refreshEventState, Math.max(0, data.round.startsAt - data.serverNow + 80));
  if (data.mode === 'team' && !(data.sides || []).some((side) => side.id === eventSideId.value)) eventSideId.value = data.sides?.[0]?.id || null;
  serverOffset = (data.serverNow || Date.now()) - Date.now();
  clock.value = Date.now();
  if (oldRound !== data.round?.id) {
    eventDraft.value = data.me?.typed || '';
    eventSubmittedPrefix.value = data.me?.typed || '';
  }
  // During this round, the local draft owns the editor. Polls must never roll
  // back text typed or corrected after the request was sent.
  if (data.round?.status === 'running' && data.me && (oldRound !== data.round.id || oldRoundStatus !== 'running')) {
    nextTick(() => eventLineInput.value?.focus());
  }
}

async function refreshEventState() {
  if (!eventId.value || eventReading || eventBusy.value || !props.user) return;
  eventReading = (async () => {
    try {
      applyEvent(await eventApi());
    } catch (error) {
      eventMessage.value = error.message;
      if (error.status === 404) eventState.value = null;
    }
  })();
  await eventReading;
  eventReading = null;
  if (eventRunning.value && eventDraft.value.length > eventCommitted.value.length) queueEventFlush();
}

async function refreshEvents() {
  if (stopped || !props.user || eventReading) return;
  try {
    const response = await fetch('/api/competitions/available', { signal: AbortSignal.timeout(7000) });
    if (!response.ok) throw Object.assign(new Error('赛事列表暂时不可用'), { status: response.status });
    const rows = await response.json();
    eventList.value = Array.isArray(rows) ? rows : [];
    if (eventList.value.length) {
      const current = eventList.value.find((item) => item.id === eventId.value);
      if (!current) eventId.value = eventList.value[0].id;
      eventMode.value = true;
      await refreshEventState();
      return;
    }
    eventMode.value = true;
    // 列表空了：先按 eventId 拉一次真实状态。不能拿本地 status 判断——
    // 老师刚终止时本地还停在 registration，会把「已终止」的提示和返回按钮一起清掉。
    if (eventId.value) await refreshEventState();
    if (['finished', 'terminated'].includes(eventState.value?.status)) return;
    eventId.value = null;
    eventState.value = null;
  } catch (error) {
    if (!eventState.value) eventMessage.value = error.message;
  }
}

async function eventAction(path = '', body) {
  if (!props.user) {
    emit('login');
    return;
  }
  if (eventBusy.value || !eventId.value) return;
  eventBusy.value = true;
  eventMessage.value = '';
  try {
    const data = await eventApi(path, body);
    if (path === '/join') await refreshEventState();
    else applyEvent(data);
  } catch (error) {
    eventMessage.value = error.message;
  } finally {
    eventBusy.value = false;
  }
}

function queueEventFlush() {
  if (!eventRunning.value) return;
  // Keep normal typing in a fixed batch window, but submit the exact final
  // characters immediately so the end of the article is never left pending.
  if (eventDraft.value.length >= eventText.value.length) {
    clearTimeout(eventSendTimer);
    eventSendTimer = setTimeout(eventFlush, 0);
    return;
  }
  if (eventSendTimer) return;
  eventSendTimer = setTimeout(eventFlush, 800);
}

async function eventFlush() {
  clearTimeout(eventSendTimer);
  eventSendTimer = null;
  if (!eventRunning.value || !eventState.value?.me) return;
  if (eventDraft.value === eventCommitted.value) return;
  if (eventReading || eventBusy.value) {
    eventSendTimer = setTimeout(eventFlush, 100);
    return;
  }
  let retryDelay = 50;
  eventBusy.value = true;
  try {
    const maxBatch = Number(eventState.value.config?.maxBatch || 16);
    const text = eventIsSpeed.value
      ? eventDraft.value.slice(0, eventText.value.length)
      : eventDraft.value.slice(0, eventCommitted.value.length + maxBatch);
    eventSubmittedPrefix.value = text;
    const roundId = eventState.value.round.id;
    const competitionId = eventId.value;
    const data = await eventApi('/submit', { seat: eventState.value.me.seat, text });
    // Acknowledge progress without replacing the round or remounting its editor.
    if (eventId.value === competitionId && eventState.value?.round?.id === roundId) {
      // Older running servers may omit me; a successful response still acknowledges text.
      eventState.value.me = data.me || { ...eventState.value.me, typed: text };
      eventMessage.value = '';
    }
  } catch (error) {
    retryDelay = 1000;
    eventMessage.value = error.message;
  } finally {
    eventBusy.value = false;
  }
  if (eventDraft.value.length > eventCommitted.value.length && eventRunning.value) {
    eventSendTimer = setTimeout(eventFlush, retryDelay);
  }
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
  if (!await leaveServer()) return;
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
  if (!await leaveServer()) return;
  stopped = true;
  emit('back');
}

async function leaveServer() {
  if (busy.value) { message.value = '正在处理，请稍后再试。'; return false; }
  if (!state.value?.me) return true;
  busy.value = true;
  try {
    await api('/leave', { seat: state.value.me.seat });
    state.value = null;
    return true;
  } catch (error) {
    message.value = `退出失败：${error.message}`;
    return false;
  } finally {
    busy.value = false;
  }
}

function teamName(team) {
  return team === 'red' ? '红队' : '蓝队';
}

watch(() => props.user?.id, () => {
  eventList.value = [];
  eventState.value = null;
  eventSideId.value = null;
  eventId.value = null;
  eventMode.value = true;
  refreshEvents();
  refresh();
});
onMounted(() => {
  window.addEventListener('resize', updateViewportWidth);
  eventStageObserver = new ResizeObserver(updateViewportWidth);
  if (eventStage.value) eventStageObserver.observe(eventStage.value);
  updateViewportWidth();
  refresh();
  pollTimer = setInterval(refresh, 900);
  clockTimer = setInterval(() => {
    clock.value = Date.now();
    const round = eventState.value?.round;
    const left = round ? round.startsAt + round.durationMs - clock.value - serverOffset : Infinity;
    if (eventRunning.value && left > 0 && left <= 1500 && !eventBusy.value && !eventReading) eventFlush();
  }, 250);
  refreshEvents();
  eventPollTimer = setInterval(refreshEvents, 1800);
});
onBeforeUnmount(() => {
  stopped = true;
  window.removeEventListener('resize', updateViewportWidth);
  eventStageObserver?.disconnect();
  clearInterval(pollTimer);
  clearInterval(eventPollTimer);
  clearInterval(clockTimer);
  clearTimeout(sendTimer);
  clearTimeout(eventSendTimer);
  clearTimeout(eventBoundaryTimer);
});
</script>

<template>
  <div v-if="eventMode" class="competition-event-page">
    <AppHeader
      title="打字比赛"
      :subtitle="eventIsSpeed ? `个人赛 · ${eventLanguage}` : eventIsTeam ? '同题团队赛' : '个人赛'"
      :icon="Trophy"
      :back-label="props.locked ? '' : '返回比赛项目'"
      :user="props.user"
      @back="emit('back')"
      @account="emit('login')"
    >
      <template #status>
        <span>{{ eventPhaseLabel }}</span>
        <b>{{ eventTimeLabel }}</b>
      </template>
      <template #actions>
        <a v-if="eventId" class="ah-link" :href="`/board?competition=${eventId}`" target="_blank" rel="noopener">大屏模式 ↗</a>
      </template>
    </AppHeader>

    <main class="competition-event-main">
      <section class="competition-event-toolbar">
        <div>
          <span class="competition-event-kicker">当前赛事</span>
          <h1>{{ eventState?.name || '等待老师创建个人赛' }}</h1>
        </div>
        <label v-if="eventList.length" class="competition-event-select">
          <span>切换赛事</span>
          <select v-model="eventId" @change="refreshEventState">
            <option v-for="item in eventList" :key="item.id" :value="item.id">{{ item.name }}{{ item.mode === 'speed' ? ` · ${item.language === 'en' ? '英文' : '中文'}` : '' }}</option>
          </select>
        </label>
      </section>

      <section class="competition-event-grid">
        <article ref="eventStage" class="competition-event-card competition-event-stage">
          <header>
            <div><span>{{ !eventState ? '个人赛 · 中文 / 英文' : eventIsSpeed ? `个人赛 · ${eventLanguage}同题限时` : eventIsTeam ? '多 v 多 · 同题计时' : '1V1 · 同题计时' }}</span><h2>{{ eventPhaseLabel }}</h2></div>
            <strong>{{ eventTimeLabel }}</strong>
          </header>
          <div class="competition-event-progress"><i :style="{ width: `${eventProgress}%` }"></i></div>

          <div v-if="eventFinished" class="competition-event-result-frame">
            <div ref="resultScrollEl" class="competition-event-result" @scroll="updateResultThumb">
              <b>本场结果</b>
              <ol>
                <li v-for="row in eventRanking" :key="row.userId">
                  <span>{{ row.rank }}</span><strong>{{ row.name }}</strong>
                  <em>{{ eventIsSpeed ? `${row.correct} 字 · ${row.speed || 0} 字/分 · ${((row.timeMs ?? 0) / 1000).toFixed(1)} 秒` : row.finished ? `${(row.elapsedMs / 1000).toFixed(1)} 秒` : `${row.correct} 字` }}</em>
                </li>
              </ol>
            </div>
            <i v-if="resultThumb.visible" class="scroll-thumb" :style="{ height: `${resultThumb.height}px`, transform: `translateY(${resultThumb.top}px)` }" aria-hidden="true"></i>
          </div>
          <div v-else-if="eventCanType && eventState?.me" class="competition-event-practice" :class="{ english: eventState?.config?.language === 'en' }">
            <PinyinLineInput
              :key="eventState.round.id"
              ref="eventLineInput"
              v-model="eventDraft"
              :segments="eventLines"
              :visible-count="eventVisibleLines"
              :locked-prefix="eventIsSpeed ? '' : eventLockedPrefix"
              :prevent-paste="true"
              :english="eventState?.config?.language === 'en'"
              input-label="比赛逐行输入"
              @commit="queueEventFlush"
            />
          </div>
          <div v-else-if="eventRunning && eventPlayerFinished" class="competition-event-waiting">
            <strong>你已完成，等待比赛结束</strong>
            <small>成绩已记录，统一计时结束后会公布最终排名。</small>
          </div>
          <div v-else class="competition-event-waiting">
            <strong>{{ !props.user ? '请先登录学生账号' : !eventState ? '暂无开放的个人赛' : eventTerminated ? '比赛已终止' : eventState.round?.status === 'countdown' ? '倒计时结束后统一开始输入' : eventJoined ? '已自动报名，等待老师开始' : '本场已开赛' }}</strong>
            <small>{{ !props.user ? '登录后会自动显示老师开启检录的中文或英文个人赛。' : !eventState ? '老师在后台创建并开启检录后，这里会自动显示。' : eventTerminated ? '老师已终止本场比赛，可以返回其他页面继续练习。' : eventState.round?.status === 'countdown' ? '选手名单已锁定，统一计时即将开始。' : eventState.status === 'registration' ? '检录期间打开本页即自动报名，开赛后将锁定选手。' : '这场比赛已经开始，暂时不能加入。' }}</small>
          </div>

          <div v-if="eventState?.me && (eventRunning || eventFinished)" class="competition-event-metrics" aria-label="本场打字数据">
            <span>时间 <b>{{ String(Math.floor(eventUsedSeconds / 60)).padStart(2, '0') }}:{{ String(eventUsedSeconds % 60).padStart(2, '0') }}</b></span>
            <span>速度 <b>{{ eventTypedSpeed }} 字/分</b></span>
            <span>进度 <b>{{ eventTypedProgress }}%</b></span>
            <span>正确率 <b>{{ eventTypedAccuracy }}%</b></span>
          </div>

          <div class="competition-event-actions">
            <template v-if="eventTerminated">
              <span class="competition-event-note">比赛已被老师终止，可以返回其他页面了。</span>
              <button type="button" class="competition-event-primary" @click="emit('back')">返回比赛项目</button>
            </template>
            <button v-else-if="!props.user" type="button" class="competition-event-primary" @click="emit('login')">登录 / 注册</button>
            <span v-else-if="eventJoined" class="competition-event-note">已自动报名，等待主持台开赛</span>
            <span v-else-if="eventState" class="competition-event-note">本场已开赛，无法加入</span>
          </div>
          <p v-if="eventMessage" class="competition-event-message" role="status">{{ eventMessage }}</p>
        </article>

        <aside class="competition-event-card competition-event-ranking">
          <header><div><span>实时榜单</span><h2>{{ eventIsTeam ? '双方成绩' : '选手排名' }}</h2></div><b>{{ eventState?.players?.length || 0 }}/{{ eventState?.config?.capacity || 60 }}</b></header>
          <div v-if="eventIsTeam" class="competition-event-sides">
            <div v-for="side in (eventState.standings || eventState.sides)" :key="side.id" :class="{ winner: eventState.match?.winnerSideId === side.id }"><span><i :style="{ background: side.color }"></i>{{ side.name }}</span><strong>{{ side.completed }}/{{ side.members }}</strong><small>{{ side.score }} 分</small></div>
          </div>
          <div class="competition-event-rank-frame">
            <ol ref="rankScrollEl" @scroll="updateRankThumb">
              <li v-for="(row, index) in eventRanking" :key="row.userId" :class="{ mine: row.userId === props.user?.id }">
                <span>{{ row.rank || index + 1 }}</span>
                <div><strong>{{ row.name }}<small v-if="row.userId === props.user?.id">我</small></strong><em>{{ eventIsSpeed ? `${row.correct} 字 · ${row.speed || 0} 字/分 · ${eventFinished ? `${((row.timeMs ?? 0) / 1000).toFixed(1)} 秒 · ` : ''}${row.accuracy}%` : row.finished ? `${(row.elapsedMs / 1000).toFixed(1)} 秒` : `${row.correct} 字 · ${row.accuracy}%` }}</em></div>
              </li>
              <li v-if="!eventRanking.length" class="empty">等待选手加入</li>
            </ol>
            <i v-if="rankThumb.visible" class="scroll-thumb" :style="{ height: `${rankThumb.height}px`, transform: `translateY(${rankThumb.top}px)` }" aria-hidden="true"></i>
          </div>
        </aside>
      </section>
    </main>
  </div>

  <div v-else class="competition-page">
    <AppHeader
      title="打字比赛"
      subtitle="QUALIFIER · FINAL"
      :icon="Trophy"
      :back-label="props.locked ? '' : '返回比赛项目'"
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
            <button v-if="joined && phase !== 'finished' && !props.locked" type="button" class="competition-secondary" @click="leave">退出比赛</button>
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
.competition-event-page{height:100dvh;display:flex;flex-direction:column;overflow:hidden;background:linear-gradient(180deg,#eff7ff,#f8fbff 58%,#edf5fd);color:#203b59;font-family:"Microsoft YaHei UI",system-ui,sans-serif}
.competition-event-main{flex:1;min-height:0;display:flex;flex-direction:column;width:min(1920px,calc(100% - 64px));margin:0 auto;padding:24px 0 20px}
.competition-event-toolbar{flex:0 0 auto;display:flex;align-items:end;justify-content:space-between;gap:20px;margin-bottom:18px}
.competition-event-kicker,.competition-event-card header span{color:#7d97ae;font-size:11px;letter-spacing:.08em}
.competition-event-toolbar h1{margin:5px 0 0;color:#183b5f;font-size:28px}
.competition-event-select{display:grid;gap:5px;color:#7d97ae;font-size:11px}
.competition-event-select select{min-width:220px;padding:10px 12px;border:1px solid #cfe0ef;border-radius:9px;background:#fff;color:#244b70}
.competition-event-grid{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1fr) clamp(280px,21vw,340px);gap:20px}
.competition-event-card{min-height:0;border:1px solid #d5e4f0;border-radius:15px;background:#fff;box-shadow:0 12px 30px #2b65960d}
.competition-event-stage{display:flex;flex-direction:column;min-width:0;min-height:0;padding:24px}
.competition-event-stage>header,.competition-event-ranking>header{display:flex;align-items:flex-start;justify-content:space-between}
.competition-event-stage h2,.competition-event-ranking h2{margin:5px 0 0;color:#183b5f;font-size:18px}
.competition-event-stage>header>strong{color:#1f6bb0;font:700 34px Consolas,monospace}
.competition-event-progress{height:6px;margin:16px 0;border-radius:999px;background:#e7eff7;overflow:hidden}
.competition-event-progress i{display:block;height:100%;background:linear-gradient(90deg,#4fa0e8,#2d7bca);transition:width .25s linear}
.competition-event-practice{flex:1;min-height:0}
.competition-event-practice :deep(.native-pinyin-lines){width:100%;gap:8px}
.competition-event-practice :deep(.native-pinyin-line){min-height:81px;height:auto;border:1px solid #bdc9d3;border-radius:0;font:22px/1.5 SimSun,serif;overflow:hidden}
.competition-event-practice.english :deep(.native-pinyin-line){font:20px/1.5 "Courier New",monospace}
.competition-event-practice :deep(.pinyin-target-line){min-height:40px;height:auto;padding:3px 9px;color:#717e8a;background:#f8fafc;white-space:pre-wrap;overflow-wrap:anywhere}
.competition-event-practice :deep(.native-pinyin-editor){height:40px;padding:3px 9px;border-top:1px solid #d8e0e8;font:inherit}
.competition-event-practice :deep(.native-pinyin-editor:focus){outline:2px solid #4d9cec;outline-offset:-2px}
.competition-event-metrics{display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:0;min-height:40px;margin:14px auto 0;padding:5px 12px;border:1px solid #cbd9e5;border-radius:999px;background:linear-gradient(#fff,#f3f7fa);box-shadow:0 2px 5px #24496c12;color:#5f7d9a;font-size:11px}
.competition-event-metrics span{padding:2px 13px;white-space:nowrap}.competition-event-metrics span+span{border-left:1px solid #d7e2eb}.competition-event-metrics b{margin-left:5px;color:#e07518;font:700 12px Consolas,"Microsoft YaHei UI",sans-serif}
.competition-event-waiting,.competition-event-result{min-height:150px;padding:22px;border:1px dashed #cfe0ef;border-radius:12px;background:#f6faff}/* 人数多时列表内部滚动：页面锁在一屏内，只有这两个列表滚，滚动条必须看得见
   （scrollbar-width 只有 Firefox 认，Chrome 得写 ::-webkit-scrollbar）。 */
.competition-event-result{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:#c3d7e8 transparent}
.competition-event-result::-webkit-scrollbar{width:9px}
.competition-event-result::-webkit-scrollbar-track{background:transparent}
.competition-event-result::-webkit-scrollbar-thumb{border:2px solid #f6faff;border-radius:6px;background:#c3d7e8}
.competition-event-result::-webkit-scrollbar-thumb:hover{background:#a9c6df}
.competition-event-waiting{display:flex;flex-direction:column;justify-content:center;gap:8px}.competition-event-waiting strong,.competition-event-result>b{color:#1f5c92;font-size:17px}.competition-event-waiting small{color:#7d97ae}
.competition-event-result ol{display:grid;gap:8px;margin:14px 0 0;padding:0;list-style:none}.competition-event-result li{display:flex;align-items:center;gap:10px;padding:7px 4px;border-bottom:1px solid #eef4fa}
.competition-event-result li:last-child{border-bottom:0}.competition-event-result li>span{width:24px;color:#2d7bca;font-weight:800}.competition-event-result li>strong{flex:1}.competition-event-result li>em{color:#7d97ae;font-style:normal;font-family:Consolas,monospace}
.competition-event-input-label{display:block;margin:16px 0 6px;color:#7d97ae;font-size:11px}.competition-event-stage textarea{width:100%;min-height:78px;padding:12px 14px;border:1px solid #cfe0ef;border-radius:11px;background:#fff;color:#183b5f;font-size:17px;line-height:1.6;resize:vertical}.competition-event-stage textarea:focus{outline:none;border-color:#3988d5;box-shadow:0 0 0 3px #3988d51f}.competition-event-stage textarea:disabled{background:#f4f8fc;color:#9db3c6}
.competition-event-actions:empty{display:none}.competition-event-actions{display:flex;align-items:center;min-height:42px;margin-top:12px}.competition-event-primary{padding:10px 20px;border:0;border-radius:10px;background:#1f6bb0;color:#fff;cursor:pointer}.competition-event-primary:disabled{opacity:.5;cursor:not-allowed}.competition-event-note{color:#7d97ae;font-size:12px}.competition-event-message{margin:8px 0 0;color:#b4472f;font-size:12px}
.competition-event-side-picker{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-top:14px;color:#7d97ae;font-size:11px}.competition-event-side-picker>span{width:100%}.competition-event-side-picker button{display:inline-flex;align-items:center;gap:7px;padding:8px 11px;border:1px solid #d5e4f0;border-radius:9px;background:#fff;color:#315879;cursor:pointer}.competition-event-side-picker button.selected{border-color:#2d7bca;background:#eaf5ff;color:#2167a6}.competition-event-side-picker i,.competition-event-sides i{width:9px;height:9px;border-radius:50%}.competition-event-side-picker small{color:#8ba3b8;font:11px Consolas,monospace}
.competition-event-sides{display:grid;gap:8px;margin-top:14px}.competition-event-sides>div{display:grid;grid-template-columns:1fr auto auto;gap:10px;align-items:center;padding:10px 11px;border:1px solid #e6eef5;border-radius:9px;background:#f8fbfe}.competition-event-sides>div.winner{border-color:#e8b04b;background:#fff9eb}.competition-event-sides span{display:flex;align-items:center;gap:7px;color:#315879;font-weight:700}.competition-event-sides strong{font:700 15px Consolas,monospace;color:#2d7bca}.competition-event-sides small{color:#8ba3b8}
/* 自绘滚动条的框架：滑块挂在 frame 上，跟着滚动容器走。 */
.competition-event-result-frame,.competition-event-rank-frame{position:relative;display:flex;flex:1;min-height:0}
.competition-event-result-frame>.competition-event-result,.competition-event-rank-frame>ol{flex:1;min-width:0;min-height:0}
.scroll-thumb{position:absolute;top:0;right:2px;width:7px;border-radius:4px;background:#b7d0e4;pointer-events:none}
.competition-event-ranking{align-self:stretch;display:flex;flex-direction:column;min-height:0;overflow:hidden;padding:20px}
.competition-event-ranking>header,.competition-event-ranking .competition-event-sides{flex:0 0 auto}.competition-event-ranking header b{color:#7d97ae;font:600 12px Consolas,monospace}.competition-event-ranking ol{flex:1;min-height:0;display:grid;gap:2px;margin:12px 0 0;padding:0 6px 0 0;list-style:none;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:#c3d7e8 transparent}
.competition-event-ranking ol::-webkit-scrollbar{width:9px}
.competition-event-ranking ol::-webkit-scrollbar-track{background:transparent}
.competition-event-ranking ol::-webkit-scrollbar-thumb{border:2px solid #fff;border-radius:6px;background:#c3d7e8}
.competition-event-ranking ol::-webkit-scrollbar-thumb:hover{background:#a9c6df}.competition-event-ranking li{display:flex;align-items:center;gap:10px;padding:11px 7px;border-bottom:1px solid #eef4fa}.competition-event-ranking li.mine{border-radius:8px;background:#f2f9ff}.competition-event-ranking li>span{width:20px;color:#9db3c6;font:700 12px Consolas,monospace;text-align:right}.competition-event-ranking li>div{display:grid;gap:3px;min-width:0;flex:1}.competition-event-ranking li strong{overflow:hidden;color:#22496c;text-overflow:ellipsis;white-space:nowrap}.competition-event-ranking li strong small{margin-left:6px;padding:1px 5px;border-radius:4px;background:#2d7bca;color:#fff;font-size:10px}.competition-event-ranking li em{color:#8ba3b8;font:11px Consolas,"Microsoft YaHei",sans-serif;font-style:normal}.competition-event-ranking .empty{justify-content:center;color:#a7bccd;font-size:12px;border:0}
@media (max-width:900px){.competition-event-toolbar{align-items:stretch;flex-direction:column}.competition-event-grid{grid-template-columns:1fr;min-height:0}.competition-event-main{width:calc(100% - 32px)}.competition-event-ranking{max-height:420px}.competition-event-select select{width:100%}
  /* 窄屏改回整页滚动：手机上没有固定高度可言，锁死 100dvh 会把内容切掉。 */
  .competition-event-page{height:auto;min-height:100dvh;overflow:visible}
  .competition-event-main{flex:0 0 auto;padding-bottom:28px}
  .competition-event-grid{flex:0 0 auto}
  .competition-event-result-frame,.competition-event-rank-frame{flex:0 0 auto}
  .competition-event-result-frame>.competition-event-result{max-height:56vh}
  .competition-event-rank-frame>ol{max-height:340px}
  .competition-event-ranking{flex:0 0 auto;max-height:none;overflow:hidden}
}
@media (max-width:620px){.competition-event-page :deep(.app-header.compact){display:grid;grid-template-columns:1fr 1fr;gap:8px;height:auto;min-height:94px;padding:10px 14px}.competition-event-page :deep(.ah-brand){justify-self:end}.competition-event-page :deep(.ah-status){margin:0;gap:8px;font-size:11px}.competition-event-page :deep(.ah-actions){justify-self:end;margin:0;gap:6px}.competition-event-page :deep(.ah-link){font-size:11px;padding:0 8px}.competition-event-stage{padding:15px}.competition-event-practice :deep(.native-pinyin-line){font-size:17px}.competition-event-practice.english :deep(.native-pinyin-line){font-size:15px}.competition-event-metrics{border-radius:14px}.competition-event-metrics span{width:50%;padding:5px 8px;text-align:center}.competition-event-metrics span:nth-child(3){border-left:0}}
@media (max-width:900px){.competition-layout{grid-template-columns:1fr}.competition-stats{grid-template-columns:repeat(2,1fr)}}
</style>
