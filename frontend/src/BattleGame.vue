<script setup>
import { computed, nextTick, onMounted, onBeforeUnmount, ref, watch } from 'vue';
import { ArrowDown, BarChart3, ChevronRight, FileText, Flag, Flame, Gauge, Keyboard, Send, Target, Users, Timer, Trophy, Volume2, Zap } from 'lucide-vue-next';
import BattleMap from './BattleMap.vue';
import AppHeader from './AppHeader.vue';
import './battle.css';
const props=defineProps({ user:Object });
const emit=defineEmits(['back','login','leaderboard']);
const gameNav = computed(() => [{ key: 'leaderboard', label: '排行榜', icon: Trophy }]);
const state=ref(null), task=ref(null), input=ref(''), error=ref(''), busy=ref(false), characterSending=ref(false), connected=ref(true), result=ref(null), dismissed=ref(''), attackPulse=ref(''), globalAnnouncement=ref(null), leaveConfirmOpen=ref(false), leaving=ref(false), leftCleanly=ref(false), activityPinned=ref(true), activityNewCount=ref(0), activityExpanded=ref(false), activityListEl=ref(null);
const inputEl=ref(null);
let poll, pending=false, stopped=false, attackPulseTimer, characterSendTimer, broadcastTimer, queuedTicket='';
let advanceRequested = false;
const seenBroadcastIds = new Set(); let broadcastHydrated = false; let lastActivityId = 0; let activityHydrated = false;
async function api(path,options={}) { const r=await fetch('/api/battle'+path,{...options,signal:AbortSignal.timeout(5000),headers:{'Content-Type':'application/json'}}); const data=await r.json(); if(!r.ok) throw new Error(data.message||'连接失败'); return data; }
async function refresh() {
  if(pending||!props.user||characterSending.value) return; pending=true;
  try {
    const data=await api(''); if(stopped)return;
    if(busy.value)return;
    if(data.round!==state.value?.round||data.me?.team!==state.value?.me?.team){task.value=null;input.value='';queuedTicket='';clearTimeout(characterSendTimer);seenBroadcastIds.clear();broadcastHydrated=false;globalAnnouncement.value=null;lastActivityId=0;activityHydrated=false;activityPinned.value=true;activityNewCount.value=0;activityExpanded.value=false;}
    state.value=data; if(!connected.value)error.value=''; connected.value=true;
    const broadcasts = Array.isArray(data.broadcasts) ? data.broadcasts : [];
    if (!broadcastHydrated) { broadcasts.forEach((item) => seenBroadcastIds.add(item.id)); broadcastHydrated = true; }
    else { const latest = broadcasts.at(-1); if (latest && !seenBroadcastIds.has(latest.id)) { seenBroadcastIds.add(latest.id); globalAnnouncement.value = latest; clearTimeout(broadcastTimer); broadcastTimer = setTimeout(() => { globalAnnouncement.value = null; }, 5200); } }
    if(data.result&&data.result.id!==dismissed.value)result.value=data.result;
    if(data.phase==='running'&&data.me&&!task.value){task.value=await api('/task');queuedTicket=task.value.id;nextTick(()=>inputEl.value?.focus());}
  } catch(e) { connected.value=false; error.value=e.message; } finally { pending=false; }
}
async function join(team) {
  if(!props.user){emit('login');return;}
  busy.value=true; error.value='';
  try { state.value=await api('/join',{method:'POST',body:JSON.stringify({team})}); } catch(e){error.value=e.message;} finally{busy.value=false;await refresh();}
}
async function attack() {
  if(busy.value||!task.value||input.value!==task.value.text||state.value?.phase!=='running')return;
  busy.value=true;error.value='';
  try { state.value=await api('/attack',{method:'POST',body:JSON.stringify({ticket:task.value.id,text:input.value})}); attackPulse.value=state.value?.me?.team||'red'; clearTimeout(attackPulseTimer); attackPulseTimer=setTimeout(()=>{attackPulse.value='';},800); task.value=null;input.value='';if(state.value.result)result.value=state.value.result; }
  catch(e){error.value=e.message; if(e.message.includes('失效'))task.value=null;}
  finally{busy.value=false;await refresh();nextTick(()=>inputEl.value?.focus());}
}
const taskProgress=computed(()=>Number(task.value?.progress)||0);
const canAttackCharacter=computed(()=>Boolean(task.value&&state.value?.phase==='running'&&input.value.length>taskProgress.value&&input.value===task.value.text.slice(0,input.value.length)));
function handleBattleInput() {
  if (!task.value) return;
  if (queuedTicket!==task.value.id) { queuedTicket=task.value.id; clearTimeout(characterSendTimer); }
  const committed=taskProgress.value;
  if (input.value.length < committed) { input.value=task.value.text.slice(0,committed); return; }
  if (input.value.length > task.value.text.length) input.value=input.value.slice(0,task.value.text.length);
  if (!canAttackCharacter.value) return;
  clearTimeout(characterSendTimer);
  characterSendTimer=setTimeout(sendCharacterBatch,220);
}
function attackCharacter() { clearTimeout(characterSendTimer); sendCharacterBatch(); }
async function advanceTask() {
  if (busy.value || !task.value || state.value?.phase !== 'running') return;
  if (input.value.length !== task.value.text.length) { error.value = '请先完成整段输入，再按回车进入下一段'; return; }
  if (characterSending.value) { advanceRequested = true; return; }
  advanceRequested = false;
  const currentTask = task.value; busy.value = true; error.value = '';
  try {
    state.value = await api('/advance', { method: 'POST', body: JSON.stringify({ ticket: currentTask.id, text: input.value }) });
    task.value = null; input.value = ''; queuedTicket = '';
  } catch (e) { error.value = e.message; if (e.message.includes('失效')) { task.value = null; input.value = ''; queuedTicket = ''; } }
  finally { busy.value = false; await refresh(); nextTick(() => inputEl.value?.focus()); }
}
function handleBattleEnter(event) {
  if (event.isComposing) return;
  event.preventDefault();
  if (!task.value || state.value?.phase !== 'running') return;
  if (input.value.length !== task.value.text.length) { error.value = '请先完成整段输入，再按回车进入下一段'; return; }
  clearTimeout(characterSendTimer);
  if (characterSending.value || canAttackCharacter.value) {
    advanceRequested = true;
    if (!characterSending.value) sendCharacterBatch();
  } else advanceTask();
}
async function sendCharacterBatch() {
  if (characterSending.value || !task.value || !canAttackCharacter.value) return;
  const currentTask = task.value;
  const prefix = input.value.slice(0, taskProgress.value + 12);
  characterSending.value=true; error.value='';
  try {
    state.value=await api('/characters',{method:'POST',body:JSON.stringify({ticket:currentTask.id,text:prefix})});
    const completed=prefix.length>=currentTask.text.length;
    if(completed) { advanceRequested=false; task.value=null; input.value=''; queuedTicket=''; }
    else task.value={...currentTask,progress:prefix.length};
    attackPulse.value=state.value?.me?.team||'red'; clearTimeout(attackPulseTimer); attackPulseTimer=setTimeout(()=>{attackPulse.value='';},280);
    if(state.value.result) result.value=state.value.result;
  } catch(e) { error.value=e.message; if(e.message.includes('失效')) { task.value=null; input.value=''; queuedTicket=''; } }
  finally {
    characterSending.value=false;
    if(!task.value) await refresh();
    else if(input.value.length>taskProgress.value && input.value===task.value.text.slice(0,input.value.length)) { clearTimeout(characterSendTimer); characterSendTimer=setTimeout(sendCharacterBatch,0); }
    else if(advanceRequested) await advanceTask();
    nextTick(()=>inputEl.value?.focus());
  }
}
const teams=computed(()=>state.value?.teams||{red:{count:0,speed:0,accuracy:100,attacks:0,area:50},blue:{count:0,speed:0,accuracy:100,attacks:0,area:50}});
// 连击威力档位：由服务端下发定义，前端只负责展示，避免两边数值漂移。
const comboConfig=computed(()=>state.value?.comboPower||{base:0.15,tiers:[{combo:30,multiplier:4,label:'压倒性攻势'},{combo:15,multiplier:2.5,label:'持续压制'},{combo:5,multiplier:1.5,label:'连击加成'}]});
const myCombo=computed(()=>state.value?.me?.combo||0);
const myMultiplier=computed(()=>state.value?.me?.multiplier||1);
const myComboLabel=computed(()=>state.value?.me?.comboLabel||'基础攻势');
const nextTier=computed(()=>[...comboConfig.value.tiers].reverse().find(tier=>myCombo.value<tier.combo)||null);
const comboGauge=computed(()=>{
  const tiers=comboConfig.value.tiers; if(!tiers.length) return 0;
  const reached=[...tiers].reverse().find(tier=>myCombo.value>=tier.combo);
  const floor=reached?reached.combo:0;
  const ceiling=(nextTier.value?.combo)||tiers[0].combo;
  return Math.min(100,Math.round((myCombo.value-floor)/Math.max(1,ceiling-floor)*100));
});
const chars=computed(()=>Array.from(task.value?.text||''));
const taskProgressPercent=computed(()=>task.value?Math.min(100,Math.round(Number(task.value.progress||0)/Math.max(1,task.value.text.length)*100)):0);
function characterState(char,index){const value=input.value[index];const committed=index<taskProgress.value;const typed=index<input.value.length;return {correct:committed||(typed&&value===char),wrong:typed&&!committed&&value!==char,current:index===input.value.length,pending:index>input.value.length};}
const recentEvents=computed(()=>[...(state.value?.events||[])].slice(-3).reverse());
const allActivityEvents=computed(()=>[...(state.value?.events||[])].slice().reverse());
function teamPlayers(team){return (state.value?.players||[]).filter((player)=>player.team===team).sort((a,b)=>b.correct-a.correct||b.speed-a.speed||a.id-b.id).slice(0,4);}
const selfPlayer=computed(()=>state.value?.players?.find((player)=>player.id===state.value?.me?.id)||null);
const playerRank=computed(()=>{const team=state.value?.me?.team;if(!team)return '-';const all=(state.value?.players||[]).filter((player)=>player.team===team).sort((a,b)=>b.correct-a.correct||b.speed-a.speed||a.id-b.id);const index=all.findIndex((player)=>player.id===state.value?.me?.id);return index<0?'-':index+1;});
function eventTime(value){return value?new Intl.DateTimeFormat('zh-CN',{minute:'2-digit',second:'2-digit'}).format(new Date(value)):'--:--';}
function handleActivityScroll(){const element=activityListEl.value;if(!element)return;const atLatest=element.scrollLeft<12;activityPinned.value=atLatest;if(atLatest)activityNewCount.value=0;}
function scrollActivityToLatest(){const element=activityListEl.value;if(!element)return;element.scrollTo({left:0,behavior:'smooth'});activityPinned.value=true;activityNewCount.value=0;}
function handleActivityAction(){if(activityExpanded.value){activityExpanded.value=false;return;}if(!activityPinned.value||activityNewCount.value){scrollActivityToLatest();return;}activityExpanded.value=true;}
watch(()=>state.value?.events?.at(-1)?.id,async(id)=>{if(!id||id===lastActivityId)return;lastActivityId=id;await nextTick();if(!activityHydrated){activityHydrated=true;scrollActivityToLatest();return;}if(activityPinned.value)scrollActivityToLatest();else activityNewCount.value+=1;});
const accuracy=computed(()=>input.value.length?Math.round(Array.from(input.value).filter((c,i)=>c===chars.value[i]).length/input.value.length*100):100);
const elapsed=computed(()=>{const s=state.value?.elapsed||0;return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;});
function dismiss(){dismissed.value=result.value.id;result.value=null;}
function requestLeave() {
  leaveConfirmOpen.value = true;
}
function cancelLeave() { leaveConfirmOpen.value = false; }
async function confirmLeave() {
  if (leaving.value) return;
  leaving.value = true; leaveConfirmOpen.value = false; stopped = true;
  clearTimeout(characterSendTimer); clearTimeout(broadcastTimer); clearInterval(poll); clearTimeout(attackPulseTimer);
  try { if (props.user) await api('/leave', { method: 'POST' }); leftCleanly.value = true; }
  finally { leaving.value = false; emit('back'); }
}
onMounted(()=>{refresh();poll=setInterval(refresh,1000);});
onBeforeUnmount(()=>{stopped=true;clearTimeout(characterSendTimer);clearTimeout(broadcastTimer);clearInterval(poll);clearTimeout(attackPulseTimer);if(props.user&&!leftCleanly.value)fetch('/api/battle/leave',{method:'POST',keepalive:true,headers:{'Content-Type':'application/json'},body:'{}'}).catch(()=>{});});
</script>
<template>
<div class="battle-game" :class="{'attack-pulse-red':attackPulse==='red','attack-pulse-blue':attackPulse==='blue'}">
  <transition name="battle-broadcast"><div v-if="globalAnnouncement" class="battle-broadcast-overlay" :class="globalAnnouncement.team" role="status" aria-live="polite"><div class="battle-broadcast-card"><span>全场播报</span><strong>{{ globalAnnouncement.title }}</strong><small>{{ globalAnnouncement.detail }}</small></div></div></transition>
      <AppHeader
      title="打字占领战"
      subtitle="红蓝对抗"
      :icon="Keyboard"
      back-label="返回大厅"
      :nav="gameNav"
      :user="props.user"
      @back="requestLeave"
      @nav="emit('leaderboard')"
      @account="emit('login')"
    >
      <template #status>
        <span class="ah-note">{{ connected ? (state?.notice || '选择阵营，两人加入后自动开始。') : '连接中断，正在重连…' }}</span>
        <span>在线 <b>{{ state?.online || 0 }}/60</b></span>
        <b>{{ elapsed }}</b>
      </template>
    </AppHeader>
  <div class="battle-layout">
    <aside v-for="team in ['red','blue']" :key="team" class="battle-team" :class="team"><header><Flag :size="38"/><div><h2>{{team==='red'?'红方':'蓝方'}}</h2><p>{{team==='red'?'团结打字 · 扩大领地':'全力以赴 · 守护领地'}}</p></div></header><dl><div><dt>队伍人数</dt><dd>{{teams[team].count}} <small>人</small></dd></div><div><dt>平均速度</dt><dd>{{teams[team].speed}} <small>字/分</small></dd></div><div><dt>提交准确率</dt><dd>{{teams[team].accuracy}}%</dd></div><div><dt>攻击次数</dt><dd>{{teams[team].attacks}}</dd></div><div class="area"><dt>当前占领</dt><dd>{{teams[team].area}}%</dd></div></dl><progress :value="teams[team].area" max="100"/><section class="battle-roster"><header><strong>实时排名</strong><small>{{teamPlayers(team).length}} 人在线</small></header><div v-if="teamPlayers(team).length" v-for="(player,index) in teamPlayers(team)" :key="player.id" class="battle-roster-row"><span class="roster-rank">{{index+1}}</span><span class="roster-avatar"><img v-if="player.avatarUrl" :src="player.avatarUrl" :alt="`${player.name}的头像`"/><b v-else>{{player.name?.slice(0,1)}}</b></span><span class="roster-copy"><strong>{{player.name}}<em v-if="(player.multiplier||1)>1" class="roster-power">×{{player.multiplier}}</em></strong><small>{{player.speed}} 字/分 · 第 {{player.sequence || 1}} 段{{(player.combo||0)>0?` · ${player.combo} 连击`:''}}</small></span></div><div v-else class="battle-roster-empty">等待队员加入</div></section><button :disabled="busy||state?.phase==='running'&&!!state?.me" @click="join(team)">{{state?.me?.team===team?'你在'+(team==='red'?'红方':'蓝方'):'加入'+(team==='red'?'红方':'蓝方')}}</button></aside>
    <main class="battle-center">
      <section class="battle-map" :class="{'is-attacking':!!attackPulse}" aria-label="红蓝领地地图"><BattleMap :teams="teams" :territory="state?.territory" :players="state?.players||[]" :events="state?.events||[]" :attack-pulse="attackPulse"/><span class="map-label red-label">红方 <small>{{teams.red.area}}%</small></span><span class="map-label blue-label">蓝方 <small>{{teams.blue.area}}%</small></span></section>
      <section class="battle-typing" :class="[state?.me?.team||'red',{ 'has-task':!!task, 'is-finished':state?.phase==='finished' }]" ><div class="battle-personal battle-personal-header"><span class="personal-player"><span class="personal-avatar"><img v-if="user?.avatarUrl" :src="user.avatarUrl" :alt="`${user.displayName}的头像`"/><b v-else>{{user?.displayName?.slice(0,1)||'我'}}</b></span><strong>{{user?.displayName||'未登录'}}</strong></span><span class="personal-team-badge">{{state?.me?.team==='blue'?'蓝方':'红方'}}</span><span class="battle-combo" :class="`tier-${myMultiplier>=4?'top':myMultiplier>=2.5?'high':myMultiplier>=1.5?'mid':'base'}`"><Flame :size="16"/>连击 <b>{{myCombo}}</b><em v-if="myMultiplier>1">×{{myMultiplier}} {{myComboLabel}}</em></span><span><Gauge :size="16"/>速度 <b>{{selfPlayer?.speed||0}}</b> 字/分</span><span><Target :size="16"/>准确率 <b>{{selfPlayer?.accuracy ?? accuracy}}%</b></span><span><BarChart3 :size="16"/>当前排名 <b>第 {{playerRank}}</b></span></div>
        <div v-if="state?.me&&state?.phase==='running'" class="battle-power" :class="{ 'is-boosted': myMultiplier>1 }">
          <div class="battle-power-head"><span><Zap :size="14"/>占领威力 <strong>×{{myMultiplier}}</strong> <em>{{myComboLabel}}</em></span><small>{{ nextTier ? `再连对 ${nextTier.combo - myCombo} 字升到 ×${nextTier.multiplier}` : '已达最高档位' }}</small></div>
          <div class="battle-power-gauge"><i :style="{width:comboGauge+'%'}"></i></div>
        </div>
        <div v-if="task&&state?.phase==='running'" class="battle-prompt" :class="{'is-code':task?.kind==='代码练习','is-english':task?.kind==='英文语句'}"><div class="battle-prompt-meta"><span class="battle-prompt-stage"><FileText :size="21"/><strong>第 {{ task.sequence }} 段</strong><small>{{task.kind||'打字练习'}}</small></span><span class="battle-task-progress"><span>本段进度</span><div><i :style="{width:`${taskProgressPercent}%`}"></i></div><strong>{{taskProgressPercent}}%</strong></span></div><div class="battle-prompt-text"><span v-for="(char,i) in chars" :key="i" :class="characterState(char,i)" :aria-current="i===input.length?'character':undefined">{{char}}</span></div></div><div v-else class="battle-prompt battle-prompt-empty">{{state?.phase==='finished'?'对局结束！20 秒后自动开始下一局。':'等待队友加入，一起赢下这场占领战。'}}</div>
        <div class="battle-input-row"><label class="battle-input-label"><span class="sr-only">正确字符会自动发动攻击；完成整段后按回车进入下一段（回车不额外攻击）</span><textarea ref="inputEl" v-model="input" :disabled="!task||state?.phase!=='running'||!connected" :maxlength="chars.length" aria-label="输入上方目标文字" placeholder="在这里输入上方文字…" @input="handleBattleInput" @keydown.enter="handleBattleEnter" @paste.prevent @drop.prevent spellcheck="false" autocomplete="off"/></label><button class="battle-attack-button" :disabled="busy||!canAttackCharacter||!connected" @click="attackCharacter()"><Send :size="21"/><strong>{{characterSending?'攻击中…':'发动攻击'}}</strong><small>完成输入后自动攻击</small></button></div><div class="battle-input-legend"><span class="is-correct"><i></i>输入正确</span><span class="is-wrong"><i></i>输入错误</span><span class="is-current"><i></i>当前字符</span><span class="is-pending"><i></i>未输入</span></div>
        <p v-if="error" class="battle-error" role="alert">{{error}}</p>
      </section>
    </main>
  </div>
  <section class="battle-activity" aria-label="战况播报"><header><div class="activity-brand"><Volume2 :size="20"/><strong>战况播报</strong><span>实时战况</span></div><div class="activity-header-actions"><small>{{state?.event||0}} 次事件</small><button type="button" class="activity-latest-button" @click="handleActivityAction" :aria-expanded="activityExpanded" :aria-label="activityNewCount?`${activityNewCount} 条新动态，回到最新`:activityExpanded?'收起战况详情':'查看完整战况'"><ArrowDown v-if="!activityPinned||activityNewCount" :size="13"/><span>{{activityNewCount?`${activityNewCount} 条新动态`:activityPinned?(activityExpanded?'收起':'更多'):'回到最新'}}</span><ChevronRight v-if="!activityExpanded" :size="15"/></button></div></header><div v-if="recentEvents.length" ref="activityListEl" class="battle-activity-list" @scroll="handleActivityScroll"><div v-for="event in recentEvents" :key="event.id" class="battle-activity-row" :class="event.team"><span class="activity-event-icon"><Zap v-if="event.characters" :size="15"/><Trophy v-else :size="15"/></span><span class="activity-time">{{eventTime(event.at)}}</span><strong>{{event.playerName}}</strong><span>{{event.characters ? `连续输入 ${event.characters} 字，${event.team==='red'?'红':'蓝'}方攻占` : `${event.team==='red'?'红':'蓝'}方完成一段`}}</span><em v-if="(event.multiplier||1)>1" class="activity-power">×{{event.multiplier}}</em><small>+{{event.captured?.length||0}} 格</small></div></div><div v-else class="battle-activity-empty">对局开始后，玩家完成输入会显示在这里。</div><div v-if="activityExpanded" class="battle-activity-history" role="dialog" aria-label="完整战况"><header><strong>完整战况</strong><button type="button" aria-label="收起战况详情" @click="activityExpanded=false">收起</button></header><div class="battle-activity-history-list"><div v-for="event in allActivityEvents" :key="`history-${event.id}`" class="battle-activity-history-row" :class="event.team"><span class="activity-event-icon"><Zap v-if="event.characters" :size="15"/><Trophy v-else :size="15"/></span><span class="activity-time">{{eventTime(event.at)}}</span><strong>{{event.playerName}}</strong><span>{{event.characters ? `连续输入 ${event.characters} 字，${event.team==='red'?'红':'蓝'}方攻占` : `${event.team==='red'?'红':'蓝'}方完成一段`}}</span><em v-if="(event.multiplier||1)>1" class="activity-power">×{{event.multiplier}}</em><small>+{{event.captured?.length||0}} 格</small></div><div v-if="!allActivityEvents.length" class="battle-activity-history-empty">暂无战况记录</div></div></div></section>
  <div v-if="result" class="battle-result-overlay"><section class="battle-result" role="dialog" aria-modal="true" aria-label="对局详情"><button class="battle-result-close" @click="dismiss">关闭</button><Trophy :size="42"/><h2>{{result.winner==='red'?'红方':'蓝方'}}获胜！</h2><p>占领全部领地 · 对局 {{result.duration}} 秒 · 20 秒后自动开始下一局</p><div class="battle-result-columns"><section v-for="team in ['red','blue']" :key="team" :class="team"><h3>{{team==='red'?'红方':'蓝方'}}前五名</h3><table><thead><tr><th>玩家</th><th>正确字数</th><th>速度</th><th>准确率</th><th>攻击</th></tr></thead><tbody><tr v-for="(p,i) in result.teams[team].slice(0,5)" :key="p.id"><td>{{i===0?'MVP':'#'+(i+1)}} {{p.name}}</td><td>{{p.correct}}</td><td>{{p.speed}}</td><td>{{p.accuracy}}%</td><td>{{p.attacks}}</td></tr></tbody></table></section></div></section></div>
  <div v-if="leaveConfirmOpen" class="battle-confirm-overlay" @mousedown.self="cancelLeave"><section class="battle-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="battle-confirm-title"><div class="battle-confirm-icon">!</div><h2 id="battle-confirm-title">要退出当前对局吗？</h2><p>返回游戏大厅后会断开当前游戏，未完成的输入不会保留。</p><div class="battle-confirm-actions"><button type="button" class="battle-confirm-cancel" :disabled="leaving" @click="cancelLeave">继续游戏</button><button type="button" class="battle-confirm-leave" :disabled="leaving" @click="confirmLeave">{{ leaving ? '退出中…' : '退出对局' }}</button></div></section></div>
</div>
</template>
