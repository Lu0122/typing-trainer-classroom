<script setup>
import { ArrowRight, Flag, Trophy } from 'lucide-vue-next';
import AppHeader from './AppHeader.vue';

defineProps({ user: { type: Object, default: null } });
const emit = defineEmits(['back', 'select', 'login']);
</script>

<template>
  <div class="competition-hub">
    <AppHeader title="打字比赛" subtitle="个人赛 · 团队赛" :icon="Trophy" back-label="返回首页" :user="user" @back="emit('back')" @account="emit('login')" />
    <main class="competition-hub-main">
      <div class="competition-hub-intro">
        <span>现场比赛</span>
        <h1>选择比赛项目</h1>
        <p>老师在后台准备比赛并统一开赛，学生登录后进入对应赛场。</p>
      </div>
      <div class="competition-hub-options">
        <button type="button" class="competition-hub-option personal" @click="emit('select', 'competition')">
          <span class="competition-hub-icon"><Trophy :size="32" /></span>
          <strong>个人打字比赛</strong>
          <small>中文或英文 · 同题限时 · 比打字速度</small>
          <span class="competition-hub-action">进入个人赛 <ArrowRight :size="18" /></span>
        </button>
        <button type="button" class="competition-hub-option team" @click="emit('select', 'battle-competition')">
          <span class="competition-hub-icon"><Flag :size="32" /></span>
          <strong>团队阵营比赛</strong>
          <small>红蓝占领 · 裁判开赛 · 到时比领地</small>
          <span class="competition-hub-action">进入团队赛 <ArrowRight :size="18" /></span>
        </button>
      </div>
    </main>
  </div>
</template>

<style scoped>
.competition-hub{min-height:100dvh;background:linear-gradient(180deg,#eaf4ff,#f7fbff 65%,#edf5fd);color:#203b59;font-family:"Microsoft YaHei UI",system-ui,sans-serif}
.competition-hub-main{width:min(980px,calc(100% - 32px));margin:0 auto;padding:clamp(30px,7vh,74px) 0 48px}
.competition-hub-intro{text-align:center}.competition-hub-intro>span{color:#7a90aa;font-size:12px;letter-spacing:.22em}.competition-hub-intro h1{margin:10px 0;color:#193f67;font:700 clamp(28px,3vw,38px) SimSun,serif}.competition-hub-intro p{margin:0;color:#66819b;font-size:14px;line-height:1.7}
.competition-hub-options{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:22px;margin-top:38px}
.competition-hub-option{display:grid;justify-items:start;gap:13px;min-height:245px;padding:28px;text-align:left;border:1px solid #cbdced;border-radius:16px;background:#fff;color:#244b72;box-shadow:0 16px 38px #376e9c16;cursor:pointer;transition:transform .18s,border-color .18s,box-shadow .18s}
.competition-hub-option:hover{transform:translateY(-4px);border-color:#6da6db;box-shadow:0 22px 44px #376e9c24}.competition-hub-option:focus-visible{outline:3px solid #438ac9;outline-offset:3px}
.competition-hub-icon{display:grid;place-items:center;width:62px;height:62px;border-radius:14px;background:#fff0d4;color:#b77418}.competition-hub-option.team .competition-hub-icon{background:#e9f3ff;color:#3179bc}
.competition-hub-option strong{font:700 25px SimSun,serif}.competition-hub-option small{color:#6c86a0;font-size:13px;line-height:1.6}.competition-hub-action{display:inline-flex;align-items:center;gap:8px;margin-top:auto;color:#246fac;font-weight:800;font-size:13px}.competition-hub-option.personal .competition-hub-action{color:#a66a14}
@media(max-width:650px){.competition-hub-options{grid-template-columns:1fr;gap:14px;margin-top:26px}.competition-hub-option{min-height:196px;padding:22px}}
</style>
