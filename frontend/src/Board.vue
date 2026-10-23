<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

// 大屏只读：免登录，方便老师随便开一台机器投影。
// 数据来自 /api/competition/:mode/board，服务端已剔除 seat 令牌。
const params = new URLSearchParams(window.location.search);
const mode = params.get('mode') === 'team' ? 'team' : 'personal';

const data = ref(null);
const clock = ref(Date.now());
const failed = ref(false);
let offset = 0;
let pollTimer;
let clockTimer;

async function refresh() {
  try {
    const response = await fetch(`/api/competition/${mode}/board`, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error('bad status');
    const payload = await response.json();
    data.value = payload;
    offset = payload.serverNow - Date.now();
    clock.value = Date.now();
    failed.value = false;
  } catch {
    failed.value = true;
  }
}

const phase = computed(() => data.value?.phase || 'waiting');
const phaseLabel = computed(() => data.value?.phaseLabel || '连接中');
const countdownTarget = computed(() => {
  const value = data.value;
  if (!value) return null;
  if (value.phase === 'waiting') return value.startsAt;
  if (value.phase === 'finished') return value.result?.endedAt ? value.result.endedAt + 30000 : null;
  return value.endsAt;
});
const remaining = computed(() => {
  const target = countdownTarget.value;
  return target ? Math.max(0, Math.ceil((target - clock.value - offset) / 1000)) : 0;
});
const timeLabel = computed(() => `${String(Math.floor(remaining.value / 60)).padStart(2, '0')}:${String(remaining.value % 60).padStart(2, '0')}`);
const hint = computed(() => {
  if (phase.value === 'waiting') return '距离初赛开始';
  if (phase.value === 'break') return '距离决赛开始';
  if (phase.value === 'final') return '决赛剩余';
  if (phase.value === 'finished') return '成绩展示';
  return '初赛剩余';
});
const top = computed(() => data.value?.top || []);
const leader = computed(() => Math.max(1, ...top.value.map((row) => row.correct)));
const teams = computed(() => data.value?.teams || []);
const total = computed(() => data.value?.total || 0);
const qualifiedCount = computed(() => data.value?.qualifiedCount || 0);
const finalists = computed(() => data.value?.finalists || 16);
const champion = computed(() => data.value?.result?.winner || null);
const events = computed(() => (data.value?.events || []).slice(-4).reverse());
const modeLabel = computed(() => (mode === 'team' ? '团队赛' : '个人晋级赛'));

function teamName(team) {
  return team === 'red' ? '红队' : '蓝队';
}

onMounted(() => {
  refresh();
  pollTimer = setInterval(refresh, 1000);
  clockTimer = setInterval(() => { clock.value = Date.now(); }, 200);
});
onBeforeUnmount(() => {
  clearInterval(pollTimer);
  clearInterval(clockTimer);
});
</script>

<template>
  <div class="board" :class="phase">
    <header class="board-head">
      <div class="board-title">
        <span>字练场</span>
        <strong>打字比赛 · {{ modeLabel }}</strong>
      </div>
      <div class="board-phase" :class="phase">{{ phaseLabel }}</div>
      <div class="board-clock">
        <small>{{ hint }}</small>
        <strong>{{ timeLabel }}</strong>
      </div>
    </header>

    <main class="board-body">
      <section class="board-ranks">
        <div class="board-ranks-head">
          <h2>{{ phase === 'break' ? '晋级名单' : '实时排名' }}</h2>
          <span>{{ total }} 人参赛</span>
        </div>
        <ol class="board-list">
          <li v-for="row in top" :key="row.id" :class="{ top3: row.rank <= 3, voided: row.disqualified }">
            <b class="rank">{{ row.rank }}</b>
            <span class="avatar">{{ row.name.slice(0, 1) }}</span>
            <div class="who">
              <strong>{{ row.name }}</strong>
              <div class="bar"><i :style="{ width: `${Math.max(2, (row.correct / leader) * 100)}%` }"></i></div>
            </div>
            <div class="score">
              <strong>{{ row.correct }}</strong>
              <small>{{ row.accuracy }}% · {{ row.speed }} 字/分</small>
            </div>
            <span v-if="row.disqualified" class="badge">作废</span>
            <span v-else-if="row.flagged" class="badge warn">异常</span>
            <span v-else-if="row.qualified" class="badge ok">晋级</span>
          </li>
          <li v-if="!top.length" class="empty">等待选手加入…</li>
        </ol>
      </section>

      <aside class="board-side">
        <div v-if="mode === 'team'" class="card teams">
          <div v-for="team in teams" :key="team.team" class="team-row" :class="team.team">
            <span>{{ teamName(team.team) }}</span>
            <strong>{{ team.correct }}</strong>
            <small>{{ team.members }} 人</small>
          </div>
        </div>

        <div v-if="phase === 'finished' && champion" class="card champion">
          <small>本场冠军</small>
          <strong>{{ mode === 'team' ? teamName(champion.team) : champion.name }}</strong>
          <span>{{ mode === 'team' ? `总正确字数 ${champion.correct}` : `决赛 ${champion.correct} 字 · ${champion.accuracy}%` }}</span>
        </div>

        <div class="card numbers">
          <div><small>晋级名额</small><strong>{{ finalists }}</strong></div>
          <div><small>已晋级</small><strong>{{ qualifiedCount }}</strong></div>
        </div>

        <div class="card feed">
          <h3>赛场动态</h3>
          <ul>
            <li v-for="item in events" :key="item.id" :class="item.kind">{{ item.text }}</li>
            <li v-if="!events.length" class="idle">暂无动态</li>
          </ul>
        </div>

        <p v-if="failed" class="board-offline">与服务端断开，正在重试…</p>
      </aside>
    </main>
  </div>
</template>

<style>
html, body { margin: 0; padding: 0; height: 100%; background: #f4f9ff; }
#board { height: 100%; }
</style>

<style scoped>
.board{height:100dvh;max-height:100dvh;overflow:hidden;display:flex;flex-direction:column;background:#f4f9ff;color:#12324f;font-family:"Microsoft YaHei UI",system-ui,sans-serif}
.board-head{display:flex;align-items:center;gap:24px;padding:clamp(10px,1.6vh,22px) clamp(18px,2.4vw,46px);background:#fff;border-bottom:2px solid #dbe8f5;flex:none}
.board-title{display:flex;flex-direction:column;gap:2px}
.board-title span{color:#7c9ab5;font-size:clamp(11px,1vw,15px);letter-spacing:2px}
.board-title strong{font-size:clamp(18px,1.9vw,32px);color:#12324f}
.board-phase{margin-left:auto;padding:clamp(4px,.6vh,10px) clamp(12px,1.4vw,26px);border-radius:999px;background:#eaf2fa;color:#3d6f97;font-size:clamp(13px,1.2vw,20px);font-weight:700}
.board-phase.qualifier,.board-phase.final{background:#e2f1ff;color:#1a63a8}
.board-phase.break{background:#fff2dc;color:#a2650c}
.board-phase.finished{background:#e4f7ec;color:#18764a}
.board-clock{display:flex;flex-direction:column;align-items:flex-end;gap:2px;min-width:clamp(120px,11vw,240px)}
.board-clock small{color:#8aa6bd;font-size:clamp(10px,.95vw,14px)}
.board-clock strong{color:#1a63a8;font-family:Consolas,monospace;font-size:clamp(30px,3.6vw,64px);line-height:1;font-weight:700}
.board-body{flex:1 1 auto;min-height:0;display:grid;grid-template-columns:minmax(0,2.15fr) minmax(220px,.85fr);gap:clamp(10px,1.2vw,22px);padding:clamp(10px,1.6vh,22px) clamp(18px,2.4vw,46px)}
.board-ranks{display:flex;flex-direction:column;min-height:0;background:#fff;border:2px solid #e0ecf7;border-radius:18px;padding:clamp(10px,1.4vh,20px) clamp(12px,1.6vw,26px)}
.board-ranks-head{display:flex;align-items:baseline;justify-content:space-between;flex:none}
.board-ranks-head h2{margin:0;font-size:clamp(15px,1.5vw,24px);color:#12324f}
.board-ranks-head span{color:#8aa6bd;font-size:clamp(11px,1vw,15px)}
.board-list{flex:1 1 auto;min-height:0;overflow:hidden;margin:clamp(6px,1vh,14px) 0 0;padding:0;list-style:none;display:flex;flex-direction:column;justify-content:flex-start;gap:clamp(4px,.8vh,10px)}
.board-list li{flex:1 1 0;min-height:0;max-height:clamp(42px,6.4vh,68px);display:flex;align-items:center;gap:clamp(8px,1vw,18px);padding:0 clamp(8px,1vw,18px);border-radius:12px;background:#f7fbff}
.board-list li.top3{background:#eef7ff}
.board-list li.voided{opacity:.45}
.board-list .rank{width:clamp(20px,2vw,42px);text-align:right;color:#9db8cd;font-family:Consolas,monospace;font-size:clamp(14px,1.5vw,26px);font-weight:700;flex:none}
.board-list li.top3 .rank{color:#1a63a8}
.avatar{width:clamp(24px,2.2vw,44px);height:clamp(24px,2.2vw,44px);border-radius:50%;background:#dceaf8;color:#1a63a8;display:grid;place-items:center;font-size:clamp(12px,1.1vw,20px);flex:none}
.who{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:clamp(3px,.5vh,7px)}
.who strong{font-size:clamp(14px,1.35vw,26px);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bar{height:clamp(4px,.7vh,9px);border-radius:999px;background:#e4eef8;overflow:hidden}
.bar i{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,#5aa8e8,#2b78c4);transition:width .45s ease}
.score{display:flex;flex-direction:column;align-items:flex-end;gap:1px;flex:none;min-width:clamp(74px,7vw,150px)}
.score strong{font-family:Consolas,monospace;font-size:clamp(18px,1.9vw,34px);color:#1a63a8;line-height:1}
.score small{color:#8aa6bd;font-size:clamp(9px,.85vw,13px);white-space:nowrap}
.badge{flex:none;padding:clamp(1px,.3vh,4px) clamp(5px,.6vw,10px);border-radius:6px;font-size:clamp(9px,.85vw,13px);background:#e8eef4;color:#6b8296}
.badge.ok{background:#e2f5ea;color:#18764a}
.badge.warn{background:#fff2dc;color:#a2650c}
.board-list .empty{flex:none;justify-content:center;color:#9db8cd;background:transparent;font-size:clamp(12px,1.1vw,18px)}
.board-side{display:flex;flex-direction:column;gap:clamp(8px,1.1vh,16px);min-height:0}
.card{background:#fff;border:2px solid #e0ecf7;border-radius:16px;padding:clamp(8px,1.2vh,16px) clamp(10px,1.2vw,20px)}
.card h3{margin:0 0 6px;font-size:clamp(12px,1.1vw,17px);color:#12324f}
.teams{display:flex;flex-direction:column;gap:8px}
.team-row{display:flex;align-items:baseline;gap:8px;padding:clamp(6px,.9vh,12px) clamp(8px,1vw,14px);border-radius:12px}
.team-row.red{background:#fdeeee;color:#a92f33}
.team-row.blue{background:#eef2fd;color:#2f47a5}
.team-row span{font-size:clamp(12px,1.1vw,18px)}
.team-row strong{margin-left:auto;font-family:Consolas,monospace;font-size:clamp(20px,2.2vw,40px);line-height:1}
.team-row small{font-size:clamp(9px,.85vw,13px);opacity:.7}
.champion{display:flex;flex-direction:column;gap:4px;background:linear-gradient(180deg,#f2f9ff,#e6f3ff);border-color:#bcdcf7}
.champion small{color:#7c9ab5;font-size:clamp(10px,.9vw,14px)}
.champion strong{font-size:clamp(18px,2vw,34px);color:#134d85}
.champion span{color:#5b7d9c;font-size:clamp(10px,.9vw,14px)}
.numbers{display:flex;gap:10px}
.numbers>div{flex:1;display:flex;flex-direction:column;gap:2px}
.numbers small{color:#8aa6bd;font-size:clamp(9px,.85vw,13px)}
.numbers strong{font-family:Consolas,monospace;font-size:clamp(16px,1.7vw,30px);color:#1a63a8}
.feed{flex:1 1 auto;min-height:0;display:flex;flex-direction:column}
.feed ul{flex:1 1 auto;min-height:0;overflow:hidden;margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:4px}
.feed li{color:#5b7d9c;font-size:clamp(10px,.9vw,14px);line-height:1.5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.feed li.start,.feed li.finish{color:#1a63a8;font-weight:700}
.feed li.warn{color:#b4472f}
.feed li.idle{color:#a9bfd1}
.board-offline{margin:0;color:#b4472f;font-size:clamp(10px,.9vw,14px)}
</style>
