<script setup>
// 全站统一 header。
//
// 以前每个页面各画一套（App 的 .topbar + lobby-topbar / arena-header / battle-header /
// boss-header / chase-topbar / runner-header / bug-topbar / competition-header），
// 高度从 52px 到 104px 有 8 种，配色还有蓝通栏和白条两种，页面之间切换就会「跳」。
//
// 现在只有两个高度档，**配色与结构完全一致**：
//   hero    104px  首页用，显示副标题与 ABC 装饰
//   compact  56px  功能页与游戏页用，隐藏副标题与装饰
//
// 四个槽位固定：品牌（props 生成） / 导航（nav 数组） / 状态（status 插槽） / 操作（actions 插槽）。
import { computed, inject, ref } from 'vue';
import { ArrowLeft, Bug, UserRound } from 'lucide-vue-next';

const props = defineProps({
  variant: { type: String, default: 'compact' }, // 'hero' | 'compact'
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
  icon: { type: [Object, Function], default: null },
  backLabel: { type: String, default: '' },
  user: { type: Object, default: null },
  showUser: { type: Boolean, default: true },
  showFeedback: { type: Boolean, default: true },
  decor: { type: Boolean, default: false },
  clickableBrand: { type: Boolean, default: false },
  nav: { type: Array, default: () => [] } // [{ key, label, icon, active }]
});

const emit = defineEmits(['back', 'account', 'nav', 'brand']);

const hero = computed(() => props.variant === 'hero');
const openFeedback = inject('openStudentFeedback', null);

// 弹窗关闭后把焦点还给返回按钮，沿用各游戏页原有的无障碍行为
const backEl = ref(null);
defineExpose({ focus: () => backEl.value?.focus() });
</script>

<template>
  <header class="app-header" :class="variant">
    <div v-if="decor && hero" class="ah-decor" aria-hidden="true"><span>A</span><span>B</span><span>C</span></div>

    <button v-if="backLabel" ref="backEl" class="ah-back" type="button" @click="emit('back')">
      <ArrowLeft :size="17" />{{ backLabel }}
    </button>

    <component
      :is="clickableBrand ? 'button' : 'div'"
      class="ah-brand"
      :class="{ 'is-clickable': clickableBrand }"
      :type="clickableBrand ? 'button' : undefined"
      :title="clickableBrand ? '返回首页' : undefined"
      @click="clickableBrand && emit('brand')"
    >
      <span class="ah-mark"><component :is="icon" v-if="icon" :size="hero ? 24 : 20" /></span>
      <span class="ah-copy">
        <b>{{ title }}</b>
        <small v-if="subtitle">{{ subtitle }}</small>
      </span>
    </component>

    <nav v-if="nav.length" class="ah-nav" aria-label="页面导航">
      <button
        v-for="item in nav"
        :key="item.key"
        type="button"
        class="ah-nav-item"
        :class="{ 'is-active': item.active }"
        @click="emit('nav', item.key)"
      >
        <component :is="item.icon" v-if="item.icon" :size="16" />{{ item.label }}
      </button>
    </nav>

    <div v-if="$slots.status" class="ah-status"><slot name="status" /></div>

    <div class="ah-actions">
      <slot name="actions" />
      <button v-if="showFeedback && openFeedback" class="ah-feedback" type="button" @click="openFeedback"><Bug :size="15" /><span>问题反馈</span></button>
      <button v-if="showUser" class="ah-user" type="button" @click="emit('account')">
        <span class="ah-avatar">
          <img v-if="user?.avatarUrl" :src="user.avatarUrl" :alt="`${user.displayName}的头像`" />
          <UserRound v-else :size="16" />
        </span>
        <span class="ah-user-copy">
          <strong>{{ user?.displayName || '登录 / 注册' }}</strong>
          <small>{{ user ? '个人中心' : '进入账号' }}</small>
        </span>
      </button>
    </div>
  </header>
</template>

<style scoped>
.app-header{
  position:relative;
  flex:none;
  display:flex;
  align-items:center;
  gap:12px;
  padding:0 clamp(14px,2.6vw,34px);
  color:#fff;
  background:linear-gradient(105deg,#3788ef,#68b2ff);
  box-shadow:inset 0 -1px #2a76cc;
}
.app-header.compact{height:56px}
.app-header.hero{height:104px;gap:18px}

.ah-decor{position:absolute;left:50%;display:flex;gap:16px;transform:translateX(-50%);opacity:.16;pointer-events:none}
.ah-decor span{display:grid;place-items:center;width:56px;height:56px;border:3px solid #fff;border-radius:9px;font-size:34px;font-weight:700}
.ah-decor span:nth-child(1){transform:rotate(-13deg)}
.ah-decor span:nth-child(2){transform:rotate(5deg)}
.ah-decor span:nth-child(3){transform:rotate(17deg)}

.ah-back{
  flex:none;display:inline-flex;align-items:center;gap:6px;
  height:32px;padding:0 12px;
  border:1px solid rgba(255,255,255,.42);border-radius:999px;
  background:rgba(255,255,255,.14);color:#fff;
  font:inherit;font-size:13px;cursor:pointer;
  transition:background .18s ease;
}
.ah-back:hover{background:rgba(255,255,255,.26)}

.ah-brand{flex:none;display:flex;align-items:center;gap:10px;min-width:0}
.ah-brand.is-clickable{
  padding:0;border:0;background:transparent;color:inherit;font:inherit;
  text-align:left;cursor:pointer;
}
.ah-brand.is-clickable:hover .ah-mark{background:rgba(255,255,255,.32)}
.ah-mark{
  flex:none;display:grid;place-items:center;
  width:38px;height:38px;border-radius:11px;
  background:rgba(255,255,255,.22);
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.28);
}
.hero .ah-mark{width:52px;height:52px;border-radius:14px}
.ah-copy{display:flex;flex-direction:column;line-height:1.22;min-width:0}
.ah-copy b{font-size:17px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ah-copy small{font-size:11px;color:rgba(255,255,255,.78);letter-spacing:.6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hero .ah-copy b{font-size:26px}
.hero .ah-copy small{font-size:12px}

.ah-nav{display:flex;align-items:center;gap:6px;margin-left:6px;min-width:0}
.ah-nav-item{
  display:inline-flex;align-items:center;gap:6px;
  height:32px;padding:0 12px;
  border:0;border-radius:999px;
  background:rgba(255,255,255,.15);color:#fff;
  font:inherit;font-size:13px;cursor:pointer;white-space:nowrap;
  transition:background .18s ease,color .18s ease;
}
.ah-nav-item:hover{background:rgba(255,255,255,.28)}
.ah-nav-item.is-active{background:#fff;color:#2d74d4;font-weight:700}

.ah-status{
  margin-left:auto;
  display:flex;align-items:center;gap:14px;
  color:rgba(255,255,255,.92);font-size:13px;white-space:nowrap;
}
.ah-status :deep(b){color:#fff;font-family:Consolas,monospace;font-size:15px}

.ah-actions{margin-left:auto;display:flex;align-items:center;gap:10px;flex:none}
.ah-status + .ah-actions{margin-left:0}

.ah-feedback{display:inline-flex;align-items:center;justify-content:center;gap:5px;height:34px;padding:0 11px;border:1px solid rgba(255,255,255,.48);border-radius:999px;background:rgba(255,255,255,.14);color:#fff;font:inherit;font-size:12px;white-space:nowrap;cursor:pointer}
.ah-feedback:hover{background:rgba(255,255,255,.26)}
.ah-feedback:focus-visible{outline:2px solid #fff;outline-offset:2px}
.ah-user{
  display:flex;align-items:center;gap:8px;
  height:38px;padding:0 12px 0 6px;
  border:0;border-radius:999px;background:#fff;color:#2d74d4;
  font:inherit;cursor:pointer;
}
.ah-avatar{display:grid;place-items:center;width:26px;height:26px;border-radius:50%;background:#e8f1fc;overflow:hidden}
.ah-avatar img{width:100%;height:100%;object-fit:cover}
.ah-user-copy{display:flex;flex-direction:column;align-items:flex-start;line-height:1.2}
.ah-user-copy strong{font-size:13px;font-weight:700;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ah-user-copy small{font-size:10px;color:#7fa5c8}

/* 插槽内容由父组件编译，scoped 样式够不到，用 :slotted 提供统一外观 */
:slotted(.ah-cta){
  display:inline-flex;align-items:center;gap:6px;
  height:38px;padding:0 18px;
  border:0;border-radius:999px;background:#fff;color:#2d74d4;
  font:inherit;font-size:13px;font-weight:700;cursor:pointer;text-decoration:none;white-space:nowrap;
}
:slotted(.ah-link){
  display:inline-flex;align-items:center;gap:5px;
  height:32px;padding:0 12px;
  border:1px solid rgba(255,255,255,.42);border-radius:999px;
  background:rgba(255,255,255,.14);color:#fff;
  font:inherit;font-size:12px;cursor:pointer;text-decoration:none;white-space:nowrap;
}
:slotted(.ah-note){
  display:inline-block;max-width:34ch;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
  color:rgba(255,255,255,.86);font-size:12px;
}

@media (max-width:1440px){
  .ah-copy small{display:none}
  .ah-user-copy small{display:none}
  .ah-user{height:34px}
}
@media (max-width:1180px){
  .ah-nav{display:none}
  .ah-status{font-size:12px;gap:10px}
}
@media (max-width:600px){.ah-feedback{padding:0 8px}.ah-feedback span{font-size:0}.ah-feedback span::after{content:"反馈";font-size:12px}}
@media (max-width:900px){
  .ah-copy b{font-size:15px}
  .hero .ah-copy b{font-size:20px}
  .ah-mark{width:32px;height:32px}
  .hero .ah-mark{width:42px;height:42px}
  .ah-user-copy{display:none}
  .ah-user{padding:0 6px}
}
</style>
