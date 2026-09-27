<script setup>
import { computed } from 'vue';

// 四道赛道：一辆车一条道，车道行按名次排序（领先的在上），
// 每个人的车色由加入时的道位号固定 —— 颜色跟人走，超车时认的是车不是道。
const props = defineProps({
  players: { type: Array, default: () => [] },   // 已按名次排序的参赛者
  target: { type: Number, default: 160 },        // 全程格数
  running: Boolean,
  waiting: Boolean,
  capacity: { type: Number, default: 4 },
  userId: [String, Number],
});

// 车色与截图一致：红 / 蓝 / 橙 / 绿。dark 用于车窗与轮毂等暗部。
const PALETTE = [
  { body: '#e0392f', dark: '#8f1f18', glow: '#e0392f66' },
  { body: '#2f6fe4', dark: '#1c4696', glow: '#2f6fe466' },
  { body: '#f5a623', dark: '#b06e05', glow: '#f5a62366' },
  { body: '#37b24d', dark: '#1f7a30', glow: '#37b24d66' },
];
const colorOf = p => PALETTE[(p.lane ?? 0) % PALETTE.length];

const lanes = computed(() => props.players.slice(0, 4));
// 始终把空位画成「虚位以待」：哪怕只有一个人发车，也保留完整四车道，
// 既让赛道结构清晰，也不会把单人赛车挤到画面正中央。
const placeholders = computed(() =>
  Math.max(0, Math.min(props.capacity, 4) - lanes.value.length));

const pctOf = p => Math.min(100, (p.distance || 0) / props.target * 100);
// 车头位置：进度点即车尾（拖尾末端），起步时车完整落在行车区内、不会压到昵称；
// 冲线时最右只贴到终点墙前，不再往前顶。58 ≈ 车宽 56 + 余量。
const posOf = p => `min(${pctOf(p)}%, calc(100% - 58px))`;
const isDone = p => (p.distance || 0) >= props.target;
// 名次徽章色：金银铜 + 其余灰。
function badgeBg(rank) {
  if (rank === 1) return '#f5a623';
  if (rank === 2) return '#9aa4af';
  if (rank === 3) return '#c07b3a';
  return '#c9ced4';
}
</script>

<template>
  <div class="rk" :class="{ 'is-running': running }">
    <div class="rk-road">
      <i class="rk-grass rk-grass-top" aria-hidden="true"></i>
      <i class="rk-grass rk-grass-bottom" aria-hidden="true"></i>
      <!-- 沥青上的竖排 FINISH 大字 + 右缘方格旗终点墙，与参考图一致 -->
      <span class="rk-finish-word" aria-hidden="true">FINISH</span>
      <div class="rk-wall" aria-hidden="true"></div>

      <div v-for="p in lanes" :key="p.seat" class="rk-lane"
        :class="{ 'is-me': p.id === userId, 'is-done': isDone(p) }">
        <span class="rk-badge" :style="{ background: badgeBg(p.rank) }">{{ p.rank }}</span>
        <span class="rk-avatar">
          <img v-if="p.avatarUrl" :src="p.avatarUrl" alt="" />
          <i v-else :style="{ background: colorOf(p).body }">{{ p.name.slice(0, 1) }}</i>
        </span>
        <span class="rk-name">{{ p.name }}<small v-if="p.id === userId">（我）</small></span>
        <span class="rk-pit">
          <!-- 速度拖尾：从车尾拉出与车同色的光带，越长越快 -->
          <i class="rk-trail" :style="{ width: posOf(p), '--trail': colorOf(p).glow, '--trail-solid': colorOf(p).body }"></i>
          <span class="rk-car" :style="{ left: posOf(p), '--body': colorOf(p).body, '--dark': colorOf(p).dark }">
            <svg viewBox="0 0 64 34" aria-hidden="true">
              <!-- 俯视赛车：车身、座舱、尾翼、四轮，车头朝右（终点方向） -->
              <rect x="6" y="6" width="10" height="6" rx="2" fill="#20262b"/>
              <rect x="6" y="22" width="10" height="6" rx="2" fill="#20262b"/>
              <rect x="44" y="5" width="11" height="7" rx="2.5" fill="#20262b"/>
              <rect x="44" y="22" width="11" height="7" rx="2.5" fill="#20262b"/>
              <path d="M4 12 L14 7 h30 l12 10 -12 10 H14 L4 22 Z" fill="var(--body)"/>
              <path d="M26 8.5 h14 l7 8.5 -7 8.5 H26 l-4 -8.5 Z" fill="var(--dark)" opacity=".92"/>
              <rect x="2" y="10" width="5" height="14" rx="2" fill="var(--dark)"/>
              <rect x="52" y="12.5" width="7" height="9" rx="2" fill="#e9f2f8" opacity=".85"/>
            </svg>
            <b v-if="running && p.id === userId" class="rk-kmh">{{ p.speedKmh }}<small> km/h</small></b>
            <b v-else-if="isDone(p)" class="rk-done" aria-label="已冲线">
              <svg viewBox="0 0 16 16"><rect width="16" height="16" rx="3" fill="#171c21"/><rect x="2" y="2" width="4" height="4" fill="#fff"/><rect x="10" y="2" width="4" height="4" fill="#fff"/><rect x="6" y="6" width="4" height="4" fill="#fff"/><rect x="2" y="10" width="4" height="4" fill="#fff"/><rect x="10" y="10" width="4" height="4" fill="#fff"/></svg>
            </b>
          </span>
        </span>
      </div>

      <div v-for="n in placeholders" :key=" 'empty' + n" class="rk-lane is-empty">
        <span class="rk-badge">{{ lanes.length + n }}</span>
        <span class="rk-avatar"><i>?</i></span>
        <span class="rk-name">虚位以待</span>
        <span class="rk-pit"></span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.rk{flex:1 1 auto;min-height:0;display:flex}
/* 赛道由四层叠出：细颗粒沥青、横向磨痕、明暗路肩和顶部光带。
   它保持为纯 CSS，因此缩放到教室大屏或学生笔记本时不会变糊。 */
.rk-road{position:relative;isolation:isolate;flex:1;border-radius:16px;overflow:hidden;
  background:
    radial-gradient(ellipse at 30% 28%,#52606b2b 0 1px,transparent 1.7px) 0 0/7px 6px,
    radial-gradient(ellipse at 70% 70%,#02070b6b 0 1px,transparent 1.8px) 0 0/9px 8px,
    repeating-linear-gradient(0deg,transparent 0 30px,#ffffff07 30px 31px,transparent 31px 61px),
    linear-gradient(90deg,#20282f 0%,#303a42 13%,#252e35 47%,#1d252c 100%);
  box-shadow:inset 0 2px 12px #0000006e,inset 0 -2px 12px #00000066,0 8px 18px #28313a26;
  display:flex;flex-direction:column;justify-content:space-evenly;padding:30px 0;min-height:236px}
/* 两条护栏在草地边缘压出一条高速公路的透视感。 */
.rk-road::before,.rk-road::after{content:'';position:absolute;left:0;right:0;height:16px;z-index:3;pointer-events:none;
  background:
    linear-gradient(180deg,#dbe6e9 0 12%,#66747b 14% 29%,#f5fafb 31% 42%,#6a777c 44% 61%,#eff4f5 63% 74%,#3d484f 76% 100%),
    repeating-linear-gradient(90deg,#f8fbfc 0 46px,#536068 46px 54px);
  background-blend-mode:multiply;opacity:.94;filter:drop-shadow(0 2px 2px #0d12157d)}
.rk-road::before{top:21px}.rk-road::after{bottom:21px;transform:scaleY(-1)}
/* 草坪故意加入纵向深浅条和柔光，避免变成扁平的绿色色块。 */
.rk-grass{position:absolute;left:0;right:0;height:31px;z-index:2;
  background:
    repeating-linear-gradient(90deg,#5f934b 0 13px,#76aa5f 13px 28px,#467a3d 28px 40px),
    linear-gradient(180deg,#98c879,#557f45);
  box-shadow:inset 0 7px 12px #c4edaa40,inset 0 -7px 11px #163b255e}
.rk-grass-top{top:0;box-shadow:inset 0 7px 12px #c4edaa40,inset 0 -7px 11px #163b255e,0 3px 8px #0000006b}
.rk-grass-bottom{bottom:0;transform:scaleY(-1);box-shadow:inset 0 7px 12px #c4edaa40,inset 0 -7px 11px #163b255e,0 -3px 8px #0000006b}
/* 车道行：左列（名次/头像/昵称）固定宽，右侧是行车区 */
.rk-lane{position:relative;display:flex;align-items:center;gap:9px;padding:6px 0 6px 14px;z-index:4;min-height:56px}
.rk-lane + .rk-lane::before{content:'';position:absolute;left:0;right:0;top:-2px;height:3px;
  background:repeating-linear-gradient(90deg,#e8eff1df 0 31px,transparent 31px 82px);opacity:.92}
.rk-lane.is-me{background:linear-gradient(90deg,#e46b3d2e 0%,#e46b3d12 27%,transparent 57%)}
.rk-badge{flex:0 0 23px;width:23px;height:23px;border-radius:7px;display:grid;place-items:center;
  color:#fff;font:700 13px/1 Consolas,monospace;box-shadow:0 1px 3px #00000042}
.rk-avatar{flex:0 0 32px;width:32px;height:32px;border-radius:50%;overflow:hidden;background:#e8eaee;
  border:2px solid #fff;box-shadow:0 1px 5px #00000038;display:grid;place-items:center}
.rk-avatar img{width:100%;height:100%;object-fit:cover}
.rk-avatar i{font:700 15px/1 'Microsoft YaHei',sans-serif;color:#fff;font-style:normal;text-shadow:0 1px 2px #00000040}
.rk-lane.is-me .rk-avatar{border-color:#ffd9a8;box-shadow:0 0 0 2px #b9532466,0 1px 5px #00000038}
.rk-name{flex:0 0 108px;font-size:13px;font-weight:700;color:#f6f9fa;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:0 2px 3px #10171c}
.rk-name small{color:#ffd9a8;font-size:11px;text-shadow:0 1px 2px #000000d9}
.is-empty .rk-name{color:#aeb9bf;font-weight:400;text-shadow:0 1px 2px #10171c}
.is-empty .rk-badge{background:#d6dade!important;color:#8b939b}
.is-empty .rk-avatar i{background:#cfd4d9;color:#fff;text-shadow:none}
/* 行车区：车与拖尾都以「距起点百分比」定位，transition 让车滑行 */
.rk-pit{position:relative;flex:1 1 auto;align-self:stretch;min-width:0;margin-right:48px}
.rk-trail{position:absolute;top:50%;left:0;height:13px;transform:translateY(-50%);border-radius:7px;
  background:linear-gradient(90deg,transparent 0%,color-mix(in srgb,var(--trail) 36%,transparent) 40%,var(--trail) 75%,var(--trail-solid) 100%);
  box-shadow:0 0 10px var(--trail),0 0 25px color-mix(in srgb,var(--trail) 45%,transparent);
  transition:width 1s linear}
.rk-car{position:absolute;top:50%;width:60px;transform:translateY(-50%);transition:left 1s linear;filter:drop-shadow(0 4px 5px #0000009b) drop-shadow(0 0 5px var(--body))}
.rk-car svg{display:block;width:100%;height:auto}
.rk-kmh{position:absolute;left:2px;top:-19px;white-space:nowrap;
  font:700 11.5px/1 Consolas,monospace;color:#3d4a55;background:#ffffffe0;border:1px solid #d8dce1;
  padding:2px 7px;border-radius:999px}
.rk-kmh small{font-size:9px;color:#8b97a1}
.rk-done{position:absolute;left:4px;top:-18px;width:16px;height:16px}
.rk-done svg{display:block;width:100%;height:100%}
/* 竖排 FINISH：压在沥青上、终点墙左侧，参考图同款 */
.rk-finish-word{position:absolute;right:38px;top:15px;bottom:15px;z-index:3;display:flex;align-items:center;
  writing-mode:vertical-rl;letter-spacing:9px;font:800 16px/1 'Arial Black',Arial,sans-serif;
  color:#dbe2e4;opacity:.58;pointer-events:none;text-shadow:0 2px 3px #000}
/* 终点墙：方格旗纹理贴满右缘 */
.rk-wall{position:absolute;top:0;bottom:0;right:0;width:30px;z-index:5;
  background:repeating-conic-gradient(#151c22 0% 25%,#f1f4f2 0% 50%) 0/15px 15px;
  box-shadow:-3px 0 10px #00000091}
@media (max-width:700px){
  .rk-name{flex-basis:84px;font-size:12px}
  .rk-road{padding:27px 0;min-height:196px}
  .rk-lane{min-height:48px}
  .rk-finish-word{display:none}
}
@media (prefers-reduced-motion:reduce){.rk-car,.rk-trail{transition:none!important}}
</style>
