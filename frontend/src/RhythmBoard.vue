<script setup>
// 四道下落式字母音游的舞台。
//
// 谱面不下发整份：服务端只给出「还落在下落窗口内、且本人尚未判定」的音符，
// 本组件按下落时长 fallMs 把每个音符插值到判定线位置。
//
// 时间轴的关键处理（这是画面顺滑的来源）：
//   服务端以 1Hz 轮询下发 elapsed 与可见音符。若直接拿这两个值渲染，
//   方块会每秒跳一格，新音符也会在半空中凭空出现。所以这里做三件事：
//     1) 在服务端 elapsed 的基础上叠加本地时钟推进量，方块每帧连续下移；
//     2) 音符一旦进入视野就缓存到本地，判定/过期后才移除 —— 服务端剔除旧音符时，
//        空中的方块不会突然消失；
//     3) 本地外推与服务端值之间允许小幅漂移，每次服务端值到达时把漂移收敛一部分，
//        既保证连续，也不会长期跑偏。
//
// 26 个字母全开放，横向分四条道：道位由服务端按键盘手区/行区映射（同字母恒定同一条道），
// 用于视觉分区与「该用哪只手」的提示；判定由服务端按「按键时刻与音符时刻的差值」完成，与道位无关。
//
// 字母直接印在下落方块上（由 rhythm-stage.js 的图集着色器绘制），
// 不再另设底部虚拟键盘 —— 玩家看方块的字母即可，键盘只会占掉赛道的纵向空间。
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { CircleGauge, Flame, Music2, Star, Target, Zap } from 'lucide-vue-next';
import { createStage, LANE_COUNT } from './rhythm-stage.js';

const props = defineProps({
  chart: Object,          // { beatMs, bpm, fallMs, laneCount, lanes, notes:[{id,letter,at,lane}], totalNotes }
  judgement: Object,      // { perfectMs, greatMs, goodMs, missMs }
  me: Object,
  running: Boolean,
  judgeRatio: { type: Number, default: 0.86 },
  elapsed: { type: Number, default: 0 },
});

const notes = computed(() => props.chart?.notes || []);
const fallMs = computed(() => props.chart?.fallMs || 2600);
const laneDefs = computed(() => props.chart?.lanes || []);
const laneCount = LANE_COUNT;

// ── 本地音符缓存 ────────────────────────────────────────────────
// 服务端每秒只下发「还在窗口内」的音符，直接用它会渲染出中途消失/闪现的方块。
// 这里把见过的音符留在本地，只在「已被本人判定」或「越过判定线太久」时移除。
const liveNotes = ref([]);
const seen = new Map();          // id → note，按插入顺序即按 at 递增
const resolved = new Set();      // 已在服务端判定掉的音符 id
// 未命中的音符要穿过判定线并从屏幕底部离场；保留约 0.35 个下落周期，
// 而不是在线上方立刻删掉，运动逻辑才符合常见下落音游的手感。
const PAST_KEEP_MS = 950;

function refreshLive() {
  const elapsed = props.elapsed;
  const cutoff = elapsed - PAST_KEEP_MS;
  for (const [id, note] of seen) {
    if (resolved.has(id) || note.at + fallMs.value < cutoff) seen.delete(id);
  }
  liveNotes.value = [...seen.values()].sort((a, b) => a.at - b.at);
}
// 服务端下发的音符只增不减地并进本地缓存；移除交给 refreshLive 的两条判据。
watch(notes, list => {
  for (const note of list) if (!seen.has(note.id)) seen.set(note.id, note);
  refreshLive();
}, { immediate: true });
watch(() => props.elapsed, refreshLive);

// 判定回馈到达时（gradeId 变化），把它翻译成舞台上的命中特效。
const grade = computed(() => props.me?.grade || '');
const gradeId = computed(() => props.me?.gradeId || 0);
const hitFlash = ref(null);
watch(gradeId, () => {
  if (!gradeId.value || !grade.value) return;
  // 服务端用 noteId = -1 表示「按了键但没有对应音符」，这种没有方块可以吃掉。
  const noteId = props.me?.keys?.[0]?.noteId ?? -1;
  const note = seen.get(noteId);
  if (note) {
    resolved.add(noteId);
    const progress = (visualElapsed.value - (note.at - fallMs.value)) / Math.max(1, fallMs.value);
    const p = Math.max(0, Math.min(1.35, progress));
    const trackWidth = 42 + Math.min(1, p) * 44 + Math.max(0, p - 1) * 60;
    hitFlash.value = {
      id: gradeId.value, grade: grade.value,
      left: 50 - trackWidth / 2 + trackWidth * ((note.lane + 0.5) / laneCount),
      top: 7 + p * 69,
      width: Math.max(6.5, trackWidth / laneCount * 0.42),
    };
  } else hitFlash.value = null;
  stageRef.value?.markJudged(noteId, grade.value, note?.lane ?? -1);
  refreshLive();
});

// ── three.js 舞台 ───────────────────────────────────────────────
const host = ref(null);
const stageRef = shallowRef(null);
// 轨道在画布里的实际横向占比（%）。由 three.js 探针每次渲染回填，
// 用来把 CSS 那层的道位表头与判定线收窄到与赛道同宽 —— 三者对齐玩家才对得上道位。
const trackPct = ref(100);
const trackStyle = computed(() => ({
  width: `${trackPct.value}%`,
  marginLeft: `${(100 - trackPct.value) / 2}%`,
}));
let frame = 0, lastTime = 0;
// 渲染循环开关。验收脚本要拿到「固定谱面的对照表」截图，必须先停掉这个循环 ——
// 否则它每帧都会用真实谱面覆盖脚本写入的画面。
// 注意：不能只 cancelAnimationFrame(frame)。tick 在函数**开头**就重排了下一帧，
// 所以 frame 里存的是「下一次」的 id，取消它并不能阻止紧接着的那一帧继续递归。
// 必须用一个显式标志让 tick 自己不再重排。
let running = true;
// 外部注入的固定谱面（验收用）。为 null 时画对局里的真实谱面。
// 必须在模块作用域声明：tick() 也要读它。
let frozen = null;
// 时间轴锚点：每次服务端 elapsed 到达时记下「服务端值」与「本地时刻」，
// 两帧之间用本地时间推进；drift 记录本地外推相对服务端的累计偏差。
let anchorElapsed = 0, anchorAt = 0, drift = 0;
const DRIFT_CLAMP_MS = 120;

function tick(now) {
  if (!running) { frame = 0; return; }
  frame = requestAnimationFrame(tick);
  const delta = Math.min(0.05, (now - lastTime) / 1000 || 0);
  lastTime = now;
  if (!stageRef.value) return;
  // 关键：用本地时钟外推，方块每帧都在动，而不是跟着 1Hz 轮询每秒跳一格。
  const elapsed = anchorElapsed + (performance.now() - anchorAt) + drift;
  // frozen 非空时画脚本指定的固定谱面（验收用），否则画对局里的真实谱面。
  const frozenView = frozen;
  if (frozenView) {
    visualElapsed.value = frozenView.elapsed;
    stageRef.value.render({ notes: frozenView.notes, elapsed: frozenView.elapsed + frozenView.fallMs, fallMs: frozenView.fallMs }, delta);
  } else {
    visualElapsed.value = elapsed;
    stageRef.value.render({ notes: liveNotes.value, elapsed: elapsed + fallMs.value, fallMs: fallMs.value }, delta);
  }
  // 画布渲染后 DOM 里已经没有方块元素，验收脚本无从断言「场上有几个方块」。
  // 这里把渲染统计挂到 canvas 的 dataset 上，脚本读它就等价于读 .rn-note 的数量；
  // 同时暴露相机探针（判定线/远端的实际投影位置），让脚本能验证三维与 CSS 的判定线对齐。
  const canvas = host.value?.firstElementChild;
  if (canvas instanceof HTMLElement) {
    canvas.dataset.notes = String(liveNotes.value.length);
    canvas.dataset.lanes = String(laneCount);
    const probe = stageRef.value.probe?.();
    if (probe) {
      canvas.dataset.judgeRatio = probe.judgeRatio.toFixed(4);
      canvas.dataset.farRatio = probe.farRatio.toFixed(4);
      // 轨道的实际横向占比：CSS 那层的道位表头与判定线要按它收窄，
      // 否则表头铺满整个面板、赛道只占中间一截，玩家对不上「哪条道在哪」。
      trackPct.value = Math.max(10, Math.min(100, probe.trackFraction * 100));
    }
  }
}
watch(() => props.elapsed, value => {
  // 新值到达时，先算出「按本地时钟本应走到哪」，把差额的一半折进 drift。
  // 折一半而不是全量对齐：全量对齐会把漂移一次性抹平，方块的位移会出现肉眼可见的一顿；
  // 折半则让画面在几次轮询内平滑贴合服务端时间轴，长时间也不会跑偏。
  const predicted = anchorElapsed + (performance.now() - anchorAt) + drift;
  drift = Math.max(-DRIFT_CLAMP_MS, Math.min(DRIFT_CLAMP_MS, (predicted - value) * 0.5));
  anchorElapsed = value;
  anchorAt = performance.now();
}, { immediate: true });

onMounted(() => {
  if (!host.value) return;
  // judgeRatio 传进舞台：三维场景里的判定线发光带要与 CSS 那条判定线落在同一高度，
  // 否则玩家会同时看到两条位置不同的线，不知道该以哪条为准。
  stageRef.value = createStage(host.value, { judgeRatio: props.judgeRatio });
  // 验收脚本的调试出口：固定谱面、逐个字母核对方块上的字形方向。
  // 生产路径不读它，导出成本只有一次赋值。
  //
  // freeze(notes) 会让渲染循环改画这份外部谱面；不传则恢复组件自己的真实谱面。
  // 为什么不是「停掉循环」：WebGL 画布默认没有 preserveDrawingBuffer，
  // 一旦停止重绘，截图时合成出来的就是空白（或上一帧残影）。
  // 所以正确做法是让循环继续跑，但每帧都画脚本指定的那份固定谱面 ——
  // 这样画面既稳定又一直在重绘。
  window.__rnStage__ = {
    stage: stageRef.value,
    freeze: (view) => { frozen = view || null; },
  };
  lastTime = performance.now();
  frame = requestAnimationFrame(tick);
});
onBeforeUnmount(() => {
  running = false;
  cancelAnimationFrame(frame);
  delete window.__rnStage__;
  stageRef.value?.dispose();
  stageRef.value = null;
});

// 已判定音符数。放在倒计时之前定义：showCountdown 依赖它判断「是否还在开局」。
const judged = computed(() => props.me?.judged || 0);
// 谱面里的 at 就是服务端的判定时刻；视觉上方块抵达判定线时也正好使用这个时间点。
// 首个音符的时刻在开局时锚定，避免服务端剔除旧音符后倒计时被后续音符重置。
const firstJudgeAt = ref(null);
watch(notes, list => {
  if (firstJudgeAt.value !== null || !list.length) return;
  firstJudgeAt.value = list[0].at;
}, { immediate: true });

// 开场倒计时：读数稳定地 3→2→1，末段切「按」，与第一个方块落到判定线的瞬间严格对齐。
const COUNTDOWN_WINDOW_MS = 3200;
const openingLeftMs = computed(() => {
  if (!props.running || firstJudgeAt.value === null) return null;
  return firstJudgeAt.value - props.elapsed;
});
const showCountdown = computed(() => {
  const left = openingLeftMs.value;
  if (left === null) return false;
  // 一旦有过判定（开局已打出第一下），倒计时就不再出现，避免整局中途弹窗打扰。
  if (judged.value > 0) return false;
  // 只在开局的有限窗口内显示，且不要拖到负数（否则会一直停在「按」）。
  return left <= COUNTDOWN_WINDOW_MS && left > -280;
});
// 整秒读数；进入最后 0.3 秒时切换为 '按'，提示「就是现在」。
const countdownText = computed(() => {
  const ms = openingLeftMs.value ?? 0;
  if (ms <= 300) return '按';
  return String(Math.ceil(ms / 1000));
});
// 倒计时数字用 key 触发缩放动画，每次换数字都重新弹一下，抓住注意力。
const countdownKey = computed(() => countdownText.value);

const gradeText = computed(() => ({ perfect: 'PERFECT', great: 'GREAT', good: 'GOOD', miss: 'MISS' }[grade.value] || ''));
const offsetText = computed(() => {
  const ms = props.me?.lastOffsetMs;
  if (ms === undefined || ms === null || !grade.value) return '';
  if (grade.value === 'miss') {
    if (props.me?.keys?.[0]?.noteId === -1) return '无效按键';
    return props.me?.keys?.[0]?.expired ? '错过音符' : '未命中';
  }
  return ms > 0 ? `+${ms}ms 偏晚` : ms < 0 ? `${ms}ms 偏早` : '精准';
});

const hits = computed(() => props.me?.counts || { perfect: 0, great: 0, good: 0, miss: 0 });
const totalNotes = computed(() => props.chart?.totalNotes || props.me?.totalNotes || 0);
const progressPct = computed(() => totalNotes.value ? Math.min(100, Math.round(judged.value / totalNotes.value * 100)) : 0);
const comboMultiplier = computed(() => props.me?.multiplier || 1);

// 完美/优秀/良好/漏键各档用不同颜色，便于一眼分辨。
const GRADE_TONE = { perfect: '#7be5d5', great: '#8fd0f0', good: '#e9c877', miss: '#ff8a9b' };
const strokeTone = computed(() => GRADE_TONE[grade.value] || '#7be5d5');

// 四条道的表头：方位标签与该道的字母池，全部来自服务端下发的同一份分区，
// 避免前端再硬编码一份字母表、与服务端漂移。
const laneHeaders = computed(() => {
  if (laneDefs.value.length) return laneDefs.value;
  return Array.from({ length: laneCount }, (_, index) => ({ index, label: '', keys: '' }));
});

// 舞台上的可读音符层。three.js 仍负责时间轴、命中特效和旧轨道探针；
// 这里用 DOM 重绘玩家真正需要辨识的「键帽」，避免远端的透视把字母压成细线。
// 横向宽度、纵向位置和缩放都按当前下落进度计算，因此它与服务端的同一条节拍时间轴同步。
const visualElapsed = ref(0);
const shownNotes = computed(() => {
  const source = frozen?.notes || liveNotes.value;
  const fall = frozen?.fallMs || fallMs.value;
  const now = visualElapsed.value;
  const positioned = source.map(note => {
    // note.at 是服务端评分时刻；方块在此前 fallMs 从顶部走到判定线。
    const progress = (now - (note.at - fall)) / Math.max(1, fall);
    if (progress < -0.08 || progress > 1.35) return null;
    const p = Math.max(0, Math.min(1.35, progress));
    const onTrack = Math.min(1, p);
    // 赛道从远端 42% 宽逐步张开到近端 86% 宽；越线后再向外扩，直至离开屏幕。
    const trackWidth = 42 + onTrack * 44 + Math.max(0, p - 1) * 60;
    const left = 50 - trackWidth / 2 + trackWidth * ((note.lane + 0.5) / laneCount);
    return { ...note, p, trackWidth, left };
  }).filter(Boolean);

  // 同一道的半拍音符在简单难度下会因为下落较慢而挤得更近。
  // 只缩小视觉尺寸，不移动中心点，确保判定线与服务端时间仍严格一致。
  return positioned.map(note => {
    let nearest = Infinity;
    for (const other of positioned) {
      if (other.id === note.id || other.lane !== note.lane) continue;
      nearest = Math.min(nearest, Math.abs(other.p - note.p));
    }
    const crowdScale = nearest < 0.065 ? 0.58 : nearest < 0.085 ? 0.70 : nearest < 0.11 ? 0.84 : 1;
    // 由远及近平滑放大，抵达判定线（p=1）时达到峰值；越线后逐渐缩小离场，
    // 不允许 p>1 继续放大，避免卡片过线时突然变大并与后续音符粘连。
    const approachScale = note.p <= 1 ? 0.54 + note.p * 0.52 : Math.max(0.62, 1.06 - (note.p - 1) * 1.05);
    return {
      ...note,
      style: {
        left: `${note.left}%`, top: `${7 + note.p * 69}%`, width: `${Math.max(6.5, note.trackWidth / laneCount * 0.42)}%`,
        '--note-scale': (approachScale * crowdScale).toFixed(3),
        zIndex: String(10 + Math.round(note.p * 100)),
      },
    };
  });
});
</script>

<template>
  <div class="rn" :class="{ 'is-live': running }" :style="{ '--rn-stroke': strokeTone }">
    <!-- 上半：本局数据与判定统计 -->
    <div class="rn-stats">
      <div class="rn-stat is-combo">
        <span class="rn-metric-icon"><Flame :size="31"/></span>
        <div><span>当前连击</span><strong>{{ me?.combo || 0 }}<small>COMBO</small></strong></div>
      </div>
      <div class="rn-stat is-score">
        <span class="rn-metric-icon"><Star :size="28"/></span>
        <div><span>总得分</span><strong>{{ me?.score || 0 }}</strong></div>
      </div>
      <div class="rn-stat is-progress">
        <span class="rn-progress-ring" :style="{ '--pct': progressPct + '%' }"><CircleGauge :size="22"/></span>
        <div><span>完成进度</span><strong>{{ progressPct }}%</strong><i><b :style="{ width: progressPct + '%' }"></b></i></div>
      </div>
      <div class="rn-hit-grid">
        <div v-for="k in ['perfect','great','good','miss']" :key="k" class="rn-hit" :class="`is-${k}`">
          <span>{{ { perfect:'PERFECT', great:'GREAT', good:'GOOD', miss:'MISS' }[k] }}</span>
          <strong>{{ hits[k] || 0 }}</strong>
        </div>
      </div>
    </div>

    <!-- 中央：四条下落轨道（three.js 渲染）+ 覆盖其上的道位表头、判定线与判定回馈 -->
    <div class="rn-field" :aria-label="`四道下落轨道，共 ${liveNotes.length} 个方块在视野内`">
      <!-- canvas 挂载点。aria-hidden：它只是侧栏与统计数据的可视表达 -->
      <div ref="host" class="rn-stage" aria-hidden="true"></div>
      <!-- 玩家视线真正聚焦的赛道与大键帽：用 DOM 层保证字母始终清楚可读。 -->
      <div class="rn-track-art" aria-hidden="true">
        <!-- 轨道边界和车道线由同一组梯形坐标绘制，保证音符不会看起来跑出轨面。 -->
        <svg class="rn-track-guides" viewBox="0 0 1000 1000" preserveAspectRatio="none">
          <path class="rn-track-outer" d="M290 70L60 1000M710 70L940 1000"/>
          <path class="rn-track-inner" d="M395 70L280 1000M500 70L500 1000M605 70L720 1000"/>
        </svg>
        <span v-for="note in shownNotes" :key="`visual-${note.id}`" class="rn-dom-note" :class="`is-lane-${note.lane}`" :style="note.style">{{ note.letter }}</span>
      </div>
      <span v-if="hitFlash" :key="`hit-${hitFlash.id}`" class="rn-hit-burst" :class="`is-${hitFlash.grade}`" :style="{ left: `${hitFlash.left}%`, top: `${hitFlash.top}%`, width: `${hitFlash.width}%` }" aria-hidden="true"></span>
      <div class="rn-stage-slogan is-left" aria-hidden="true">TYPE<br/>TO THE<br/>BEAT</div>
      <div class="rn-stage-slogan is-right" aria-hidden="true"><span>♫</span>让打字<br/>也成为一种快乐！</div>
      <!-- 四条道的表头：方位与字母池，帮助建立「哪只手、哪条道」的印象。
           宽度跟着三维场景里赛道的实际占比走，否则表头会铺满整个面板、
           而赛道只占中间一截，玩家对不上道位。 -->
      <div class="rn-lane-head" :style="trackStyle" aria-hidden="true">
        <span v-for="lane in laneHeaders" :key="lane.index" :class="`is-lane-${lane.index}`">
          <b>{{ lane.label || `第 ${lane.index + 1} 道` }}</b>
          <small>{{ lane.keys }}</small>
        </span>
      </div>
      <!-- 判定线：横贯四道，与三维场景里那条发光带对应（宽度同样对齐赛道） -->
      <div class="rn-judge-line" :style="{ top: (judgeRatio * 100) + '%', ...trackStyle }">
        <span class="rn-judge-label"><Target :size="13"/>判定线</span>
      </div>
      <!-- 判定回馈：按 gradeId 作为 key，每次判定重新播放动画 -->
      <div v-if="gradeText" :key="gradeId" class="rn-feedback" :class="`is-${grade}`">
        <strong>{{ gradeText }}</strong>
        <small v-if="offsetText">{{ offsetText }}</small>
      </div>
      <!-- 开场倒计时：盖在轨道正中的大号读数，开局第一眼就看得到 -->
      <div v-if="showCountdown" class="rn-countdown" aria-live="polite">
        <strong :key="countdownKey" :class="{ 'is-go': countdownText === '按' }">{{ countdownText }}</strong>
        <small>{{ countdownText === '按' ? '就是现在' : '秒后开始' }}</small>
      </div>
      <p v-else-if="!liveNotes.length && running" class="rn-idle">方块即将出现，准备跟上节奏…</p>
    </div>

    <!-- 下半：进度与数据说明。
         原本这里还有一块虚拟键盘（按真实 QWERTY 排布、高亮场上字母），
         现已移除 —— 字母直接印在下落方块上，玩家看方块就够了；
         再摆一块键盘只会占掉本可以给赛道的纵向空间。 -->
    <div class="rn-foot">
      <div class="rn-progress"><i :style="{ width: progressPct + '%' }"></i></div>
      <div class="rn-legend">
        <span><Music2 :size="13"/>{{ chart?.bpm || 112 }} BPM · 下落 {{ ((fallMs || 0) / 1000).toFixed(1) }}s</span>
        <span class="is-perfect">PERFECT ±{{ judgement?.perfectMs || 70 }}ms</span>
        <span class="is-great">GREAT ±{{ judgement?.greatMs || 130 }}ms</span>
        <span class="is-good">GOOD ±{{ judgement?.goodMs || 210 }}ms</span>
        <span><Zap :size="13"/>{{ judged }} / {{ totalNotes }} 已判定</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.rn{--rn-line:#225485;--rn-ink:#f1f7ff;--rn-muted:#91aed3;display:flex;flex-direction:column;gap:10px;flex:1 1 auto;min-height:0}
.rn-stats{display:grid;grid-template-columns:1.08fr 1.08fr 1.35fr 2.85fr;gap:10px;align-items:stretch;flex:0 0 auto}
.rn-stat,.rn-hit{border:1px solid #1d5388;border-radius:14px;background:linear-gradient(135deg,#0c2748eF,#102948d8);box-shadow:inset 0 1px #6bb8e322,0 10px 24px #00152b22}
.rn-stat{display:flex;align-items:center;gap:11px;min-height:74px;padding:10px 13px}.rn-stat>div{min-width:0}.rn-stat span:not(.rn-metric-icon):not(.rn-progress-ring){display:block;font-size:11px;color:var(--rn-muted);letter-spacing:.04em}.rn-stat strong{display:block;margin-top:2px;font:800 29px/1 Consolas,monospace;color:var(--rn-ink);white-space:nowrap}.rn-stat strong small{margin-left:5px;font:700 8px/1 Consolas,monospace;color:#f8a82d}.rn-metric-icon{display:grid;place-items:center;flex:none;width:38px;height:38px;color:#20f2ed;filter:drop-shadow(0 0 9px #0ef7ee88)}.is-combo .rn-metric-icon{color:#ff9028;filter:drop-shadow(0 0 10px #ff812888)}.is-combo strong{color:#ffb13d}.is-score strong{color:#35e7eb}.is-score .rn-metric-icon{color:#32e8ef}.is-progress strong{font-size:23px;color:#e7f5ff}.rn-progress-ring{position:relative;display:grid;place-items:center;flex:none;width:43px;height:43px;border-radius:50%;background:conic-gradient(#55f5ee var(--pct),#314879 0);color:#bdfcf8;box-shadow:0 0 14px #3be7e055}.rn-progress-ring::before{content:'';position:absolute;inset:5px;border-radius:50%;background:#102847}.rn-progress-ring svg{position:relative;z-index:1}.is-progress i{display:block;overflow:hidden;width:100%;height:5px;margin-top:6px;border-radius:99px;background:#28426d}.is-progress i b{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#3263d8,#3af0ed)}
.rn-hit-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:7px}.rn-hit{display:grid;place-content:center;min-height:74px;text-align:center}.rn-hit>span{font:800 10px/1 Consolas,monospace;letter-spacing:1px}.rn-hit>strong{margin-top:7px;font:800 28px/1 Consolas,monospace;color:var(--rn-ink)}.rn-hit.is-perfect{border-color:#1f8b8a}.rn-hit.is-perfect>span,.rn-hit.is-perfect>strong{color:#42f3e9}.rn-hit.is-great{border-color:#256ca8}.rn-hit.is-great>span,.rn-hit.is-great>strong{color:#55c6ff}.rn-hit.is-good{border-color:#8e6720}.rn-hit.is-good>span,.rn-hit.is-good>strong{color:#ffd148}.rn-hit.is-miss{border-color:#913b64}.rn-hit.is-miss>span,.rn-hit.is-miss>strong{color:#ff5d9f}
.rn-field{position:relative;flex:1 1 auto;min-height:150px;border:1px solid #168bc4;border-radius:15px;overflow:hidden;background:radial-gradient(ellipse at 50% 86%,#123d68 0%,#071b38 43%,#06142b 100%);box-shadow:inset 0 0 70px #06255599,0 0 22px #009bff18}.rn-field::before,.rn-field::after{content:'';position:absolute;inset:0;pointer-events:none;z-index:2}.rn-field::before{background:radial-gradient(circle at 9% 48%,#2e48c922 0 1px,transparent 2px),radial-gradient(circle at 89% 18%,#00e8f326 0 1px,transparent 2px);background-size:51px 37px,69px 53px;opacity:.7}.rn-field::after{background:linear-gradient(110deg,transparent 0 17%,#26d9ff0a 25%,transparent 33% 69%,#743cff0d 79%,transparent 87%)}
.rn-stage{position:absolute;inset:0;z-index:1}.rn-lane-head{position:absolute;left:0;right:0;top:0;z-index:4;display:grid;grid-template-columns:repeat(4,1fr);padding:11px 14px;pointer-events:none}.rn-lane-head>span{display:grid;gap:2px;text-align:center;justify-items:center}.rn-lane-head b{font:800 10px/1.2 system-ui;letter-spacing:1px;color:#d8f7ff;text-shadow:0 2px 9px #020a15}.rn-lane-head small{font:9px/1 Consolas,monospace;letter-spacing:1.4px;color:#6eabce;text-shadow:0 2px 8px #020a15}.rn-lane-head .is-lane-0 b,.rn-lane-head .is-lane-1 b{color:#63eced}.rn-lane-head .is-lane-2 b,.rn-lane-head .is-lane-3 b{color:#78bbff}
.rn-judge-line{position:absolute;left:0;right:0;height:3px;background:linear-gradient(90deg,transparent,#39f7f4 14%,#c7ffff 50%,#39f7f4 86%,transparent);box-shadow:0 0 7px #43ffff,0 0 26px #0cf9f5aa;z-index:3}.rn-judge-label{position:absolute;right:10px;top:-25px;display:flex;align-items:center;gap:4px;font-size:10px;letter-spacing:1px;color:#80fbf5}
.rn-countdown{position:absolute;left:50%;top:0;bottom:14%;transform:translateX(-50%);z-index:7;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;pointer-events:none;text-align:center;padding:0 clamp(30px,7vw,80px);background:radial-gradient(ellipse at center,#06152ccc 0%,#06152c8e 52%,#06152c00 74%)}.rn-countdown>strong{font:800 clamp(72px,11vw,132px)/1 Consolas,monospace;letter-spacing:4px;color:#e2fffa;text-shadow:0 0 40px #7be5d599,0 0 90px #7be5d54d,0 4px 18px #050a12;animation:rnCount .42s cubic-bezier(.2,.9,.3,1.25) both}.rn-countdown>strong.is-go{color:#ffe9a8;text-shadow:0 0 46px #f6d99c99,0 0 100px #f6d99c55,0 4px 18px #050a12;animation:rnGo .3s cubic-bezier(.2,.9,.3,1.4) both}.rn-countdown>small{font-size:13px;letter-spacing:5px;color:#7be5d5dd;text-shadow:0 2px 10px #050a12}@keyframes rnCount{from{opacity:0;transform:scale(.5)}to{opacity:1;transform:scale(1)}}@keyframes rnGo{from{opacity:0;transform:scale(.75)}to{opacity:1;transform:scale(1.12)}}
.rn-feedback{position:absolute;left:50%;top:34%;transform:translate(-50%,-50%);z-index:5;display:grid;gap:3px;text-align:center;pointer-events:none;animation:rnPop .55s cubic-bezier(.2,.9,.3,1.2) both}.rn-feedback>strong{font:800 clamp(26px,3.4vw,40px)/1 Consolas,monospace;letter-spacing:3px;color:var(--rn-stroke);text-shadow:0 0 26px var(--rn-stroke)}.rn-feedback>small{font-size:12px;letter-spacing:1px;color:var(--rn-muted)}.rn-feedback.is-miss>strong{animation:rnShake .3s ease both}.rn-idle{position:absolute;left:0;right:0;top:46%;text-align:center;margin:0;color:#a6c7df;font-size:13px;letter-spacing:1px;z-index:5}@keyframes rnPop{from{opacity:0;transform:translate(-50%,-50%) scale(.65)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}}@keyframes rnShake{0%,100%{transform:translateX(0)}25%{transform:translateX(-7px)}75%{transform:translateX(7px)}}
.rn-foot{display:flex;align-items:center;gap:13px;flex:0 0 auto}.rn-progress{display:none}.rn-legend{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;width:100%;gap:5px 12px;font-size:11px;color:#90b1cf}.rn-legend>span{display:flex;align-items:center;gap:5px}.rn-legend .is-perfect{color:#53f5e7}.rn-legend .is-great{color:#73c7ff}.rn-legend .is-good{color:#ffd04a}
.rn-stage{opacity:.13}.rn-track-art{position:absolute;inset:0;z-index:3;overflow:hidden;pointer-events:none;clip-path:polygon(29% 7%,71% 7%,94% 100%,6% 100%);background:linear-gradient(90deg,#0c2748e8 0 24%,#133b5be8 24.5% 48%,#0e2d51e8 48.5% 73%,#153b5ce8 73.5% 100%);box-shadow:inset 0 0 42px #011022}.rn-track-art::before{content:'';position:absolute;inset:0;background:linear-gradient(180deg,#2b579211,transparent 36%,#00d9f014 93%,#0feef82b 100%)}.rn-track-guides{position:absolute;inset:0;width:100%;height:100%;overflow:visible}.rn-track-guides path{fill:none;vector-effect:non-scaling-stroke}.rn-track-outer{stroke:#3cf2f0;stroke-width:3;filter:drop-shadow(0 0 5px #2be9ed)}.rn-track-inner{stroke:#103b63;stroke-width:2;filter:drop-shadow(0 0 2px #020b14)}.rn-dom-note{position:absolute;z-index:2;display:grid;place-items:center;height:clamp(34px,3.8vw,62px);border:2px solid #3bf5ef;border-radius:9px;background:linear-gradient(145deg,#196d91,#084c6d 60%,#073552);color:#edfffe;font:900 clamp(20px,2.1vw,38px)/1 'Arial Black',Consolas,sans-serif;letter-spacing:.03em;text-shadow:0 2px 1px #00233c,0 0 12px #eaffff88;box-shadow:inset 0 2px #c5ffff66,inset 0 -8px 12px #001d3566,0 0 12px #24f2eea8,0 10px 14px #001223aa;transform:translate(-50%,-50%) perspective(620px) rotateX(42deg) scale(var(--note-scale));transform-origin:center;will-change:transform,top,left}.rn-dom-note.is-lane-1{border-color:#42afff;background:linear-gradient(145deg,#2055a9,#102e74 60%,#0b2058);box-shadow:inset 0 2px #c4eaff66,inset 0 -8px 12px #00183e66,0 0 13px #329effb8,0 10px 14px #001223aa}.rn-dom-note.is-lane-2{border-color:#aa6cff;background:linear-gradient(145deg,#7043bd,#3b287f 60%,#24195b);box-shadow:inset 0 2px #e2cdff66,inset 0 -8px 12px #17003666,0 0 13px #9e58ffb8,0 10px 14px #001223aa}.rn-dom-note.is-lane-3{border-color:#39eef3;background:linear-gradient(145deg,#1d8aa0,#075263 60%,#073241);box-shadow:inset 0 2px #caffff66,inset 0 -8px 12px #001d3566,0 0 13px #24f2eea8,0 10px 14px #001223aa}.rn-stage-slogan{position:absolute;z-index:2;pointer-events:none;user-select:none}.rn-stage-slogan.is-left{left:4%;top:21%;font:900 clamp(22px,3vw,55px)/.97 Impact,'Arial Black',sans-serif;letter-spacing:.03em;color:#1c4b9d55;transform:rotate(-10deg)}.rn-stage-slogan.is-right{right:5%;top:46%;font:italic 18px/1.65 'Segoe Print','KaiTi',cursive;color:#46a9ff9c;transform:rotate(-9deg);text-align:center}.rn-stage-slogan.is-right span{display:block;font-size:56px;line-height:.8;color:#20e6f180;text-shadow:0 0 19px #1debf155}.rn-lane-head{z-index:6}.rn-judge-line{z-index:5!important;width:70%!important;left:15%!important;margin-left:0!important}.rn-judge-label{font-size:11px;color:#b9fffc}.rn-feedback{z-index:7}.rn-countdown{z-index:8}
@media(max-width:1100px){.rn-stats{grid-template-columns:1fr 1fr 1.25fr}.rn-hit-grid{grid-column:1/-1}.rn-field{min-height:170px}}@media(max-width:620px){.rn-stats{grid-template-columns:1fr 1fr}.is-progress{grid-column:1/-1}.rn-legend{justify-content:flex-start}.rn-hit>strong{font-size:21px}}
.rn-dom-note{height:clamp(30px,3.4vw,56px)}
.rn-hit-burst{--burst:#72f8e7;position:absolute;z-index:9;height:clamp(30px,3.4vw,56px);transform:translate(-50%,-50%);border:2px solid #f2fffe;border-radius:10px;background:radial-gradient(ellipse,#ffffffa8 0,#a1fff45c 38%,transparent 76%);box-shadow:0 0 26px var(--burst),inset 0 0 20px #ffffff8c;pointer-events:none;animation:rnCardFlash .46s cubic-bezier(.17,.75,.3,1) both}
.rn-hit-burst::before{content:'';position:absolute;inset:-5px;border:2px solid var(--burst);border-radius:inherit;box-shadow:0 0 18px var(--burst);animation:rnCardRipple .46s ease-out both}
.rn-hit-burst.is-great{--burst:#72caff}.rn-hit-burst.is-good{--burst:#ffd46e}.rn-hit-burst.is-miss{--burst:#ff728e}
@keyframes rnCardFlash{0%{opacity:0;filter:brightness(1);transform:translate(-50%,-50%) scale(.68)}22%{opacity:1;filter:brightness(1.8);transform:translate(-50%,-50%) scale(1.12)}100%{opacity:0;filter:brightness(1.15);transform:translate(-50%,-50%) scale(1.02)}}
@keyframes rnCardRipple{0%{opacity:.95;transform:scale(.82)}100%{opacity:0;transform:scale(1.65)}}
</style>
