<script setup>
import { ArrowRight, BarChart3, Bug, CarFront, CircleCheck, Flag, Footprints, Gamepad2, Info, Keyboard, Music2, Play, Swords, Timer, Trophy, Users, UsersRound } from 'lucide-vue-next';

const props = defineProps({ user: { type: Object, default: null } });
const emit = defineEmits(['select', 'back', 'growth', 'leaderboard', 'account', 'bug-report']);

function joinAction() {
  // 已登录直接进第一个玩法，未登录先去登录/注册
  if (props.user) emit('select', 'race');
  else emit('account');
}

// 卡片跟随指针的高光位置：只写 CSS 变量，避免触发 Vue 重渲染。
function trackGlow(event) {
  const card = event?.currentTarget ?? event?.target?.closest?.('.game-choice');
  if (!card?.getBoundingClientRect) return;
  const rect = card.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  card.style.setProperty('--glow-x', `${((event.clientX - rect.left) / rect.width * 100).toFixed(1)}%`);
  card.style.setProperty('--glow-y', `${((event.clientY - rect.top) / rect.height * 100).toFixed(1)}%`);
}
</script>
<template>
  <section class="game-lobby">
    <header class="lobby-topbar">
      <div class="lobby-topbar-inner">
        <button class="lobby-brand" type="button" title="返回首页" @click="$emit('back')">
          <span class="lobby-logo" aria-hidden="true">
            <svg viewBox="0 0 40 40">
              <defs>
                <linearGradient id="lgLobbyLogo" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stop-color="#58a6f7"/><stop offset="1" stop-color="#2d74d4"/>
                </linearGradient>
              </defs>
              <rect width="40" height="40" rx="11" fill="url(#lgLobbyLogo)"/>
              <path d="M17.8 27.4V13.4l12.4-2.5v13.7" fill="none" stroke="#fff" stroke-width="2.7" stroke-linecap="round" stroke-linejoin="round"/>
              <circle cx="15" cy="27.6" r="3.5" fill="#fff"/><circle cx="27.4" cy="24.8" r="3.5" fill="#fff"/>
            </svg>
          </span>
          <span class="lobby-brand-copy"><b>字母音游</b><small>TYPE THE LETTERS</small></span>
        </button>
        <nav class="lobby-nav" aria-label="页面导航">
          <button class="is-active" type="button" aria-current="page"><Gamepad2 :size="16"/>游戏大厅</button>
          <button type="button" @click="$emit('growth')"><Trophy :size="16"/>我的战绩</button>
          <button type="button" @click="$emit('leaderboard')"><BarChart3 :size="16"/>排行榜</button>
          <button type="button" @click="$emit('growth')"><CircleCheck :size="16"/>成就任务</button>
        </nav>
        <div class="lobby-actions">
          <button class="lobby-bug-link" type="button" aria-label="Bug反馈" @click="$emit('bug-report')"><Bug :size="15"/><span>Bug反馈</span></button>
          <button class="lobby-account" type="button" @click="$emit('account')">
            <span class="lobby-avatar"><img v-if="user?.avatarUrl" :src="user.avatarUrl" :alt="`${user.displayName}的头像`"/><UsersRound v-else :size="14"/></span>
            <b>{{ user?.displayName || '登录 / 注册' }}</b>
          </button>
          <button class="lobby-cta" type="button" aria-label="一起打字，一起上场" @click="joinAction"><Play :size="14"/><span class="cta-txt">一起打字，一起上场</span></button>
        </div>
      </div>
    </header>

    <div class="lobby-scroll">
      <div class="lobby-inner">
        <header class="lobby-hero">
          <div class="lobby-hero-copy">
            <h1>今天，换一种挑战。</h1>
            <p>和同学较量速度，或者并肩作战。选择你的玩法，在键盘上遇见更好的自己！</p>
          </div>
          <span class="lobby-script" aria-hidden="true">Type<br/>A Better <i>~</i> You!</span>
        </header>

        <div class="game-choices">
          <button class="game-choice competition-choice" type="button" @click="$emit('select', 'competition')" @pointermove="trackGlow">
            <div class="choice-head"><div class="choice-titles"><div class="choice-name"><Trophy class="name-ico" :size="19"/>比赛模式 <span class="runner-new">MVP</span></div><small>个人赛 · 团队赛 · 同题竞技</small></div><span class="choice-art" aria-hidden="true"><svg viewBox="0 0 168 104"><circle cx="84" cy="48" r="34" fill="#e8f4ff" stroke="#5e9ddd" stroke-width="2"/><path d="M68 34h32v20c0 10-7 17-16 17s-16-7-16-17z" fill="#f6bb4f" stroke="#d38a20" stroke-width="2"/><path d="M68 39H56c0 10 5 16 14 16M100 39h12c0 10-5 16-14 16" fill="none" stroke="#d38a20" stroke-width="4" stroke-linecap="round"/><path d="M84 71v13M68 88h32" stroke="#5e9ddd" stroke-width="4" stroke-linecap="round"/><path d="M77 45h14M77 52h14" stroke="#fff" stroke-width="3" stroke-linecap="round"/></svg></span></div>
            <p>60 秒同题比赛，个人赛看个人排名，团队赛看红蓝两队总分。<br/>统一计时、实时榜单，先完成第一版比赛闭环。</p>
            <footer><span class="choice-meta"><i><Users :size="14"/>1—40 人</i><i><Timer :size="14"/>60 秒一局</i></span><strong>进入比赛<ArrowRight :size="16"/></strong></footer>
          </button>
          <button class="game-choice runner-choice" type="button" @click="$emit('select', 'runner')" @pointermove="trackGlow">
            <div class="choice-head"><div class="choice-titles"><div class="choice-name"><Footprints class="name-ico" :size="19"/>遗迹逃亡 <span class="runner-new">NEW</span></div><small>无限路线 · 打字冒险</small></div>
              <span class="choice-art" aria-hidden="true"><svg viewBox="0 0 168 104"><path d="M47 101L76 22h20l29 79" fill="#c5d1ae" stroke="#749967" stroke-width="2"/><path d="M56 91h59M62 74h47M69 54h33" stroke="#94a983" stroke-width="2"/><path d="M48 23V7h70v16M59 7v44M108 7v44" fill="none" stroke="#799877" stroke-width="9"/><path d="M70 6h26" stroke="#eec879" stroke-width="6"/><circle cx="83" cy="53" r="7" fill="#d99a5c"/><path d="M83 61l-3 17m2-13l-13 8m14-9l12 6m-15 7l-11 17m11-17l13 12" fill="none" stroke="#267f74" stroke-width="7" stroke-linecap="round"/><path d="M28 50l-13-4 10-7M136 34l14-4-9-9" stroke="#dab46b" stroke-width="3" fill="none" stroke-linecap="round"/><circle cx="127" cy="72" r="7" fill="#ffd98b" stroke="#dcb55c" stroke-width="2"/></svg></span>
            </div><p>打出文字，跳跃、滑铲、躲开障碍。<br/>路线无限生成，关卡越来越快，挑战最远逃亡纪录。</p>
            <footer><span class="choice-meta"><i><Users :size="14"/>单人冒险</i><i><Trophy :size="14"/>今日 / 总榜</i></span><strong>开始逃亡<ArrowRight :size="16"/></strong></footer>
          </button>
          <button class="game-choice race-choice" type="button" @click="$emit('select', 'race')" @pointermove="trackGlow">
            <div class="choice-head">
              <div class="choice-titles">
                <div class="choice-name"><Flag class="name-ico" :size="19"/>竞速模式</div>
                <small>速度争锋 · 极限挑战</small>
              </div>
              <span class="choice-art" aria-hidden="true">
                <svg viewBox="0 0 168 104">
                  <defs>
                    <linearGradient id="raBodyG" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stop-color="#ffd35e"/><stop offset="1" stop-color="#f59d1c"/>
                    </linearGradient>
                    <pattern id="raCheck" width="12" height="12" patternUnits="userSpaceOnUse">
                      <rect width="6" height="6" fill="#ead8b6"/><rect x="6" width="6" height="6" fill="#f7eeda"/>
                      <rect y="6" width="6" height="6" fill="#f7eeda"/><rect x="6" y="6" width="6" height="6" fill="#ead8b6"/>
                    </pattern>
                  </defs>
                  <rect x="112" y="4" width="52" height="34" fill="url(#raCheck)" opacity=".5" rx="2"/>
                  <text x="4" y="26" class="ra-speed">SPEED</text>
                  <g class="ra-lines"><path d="M8 58h26"/><path d="M2 70h18"/><path d="M12 82h14"/></g>
                  <ellipse cx="92" cy="97" rx="58" ry="5" fill="#ecb267" opacity=".28"/>
                  <g class="ra-car">
                    <path d="M27 57l22-4v5l-22 4z" fill="#d0831b"/>
                    <path d="M39 62v6" stroke="#d0831b" stroke-width="3"/>
                    <path d="M34 88c-6 0-9-3-9-8 0-7 4-11 11-13l4-1 13-15c4-5 11-8 18-8h15c11 0 19 4 25 11l8 10c12 2 19 6 19 12v4c0 5-3 8-8 8z" fill="url(#raBodyG)" stroke="#d0831b" stroke-width="2" stroke-linejoin="round"/>
                    <path d="M60 62l12-13c3-3 7-5 11-5h6c6 0 10 2 13 5l9 13z" fill="#d6ebfa" stroke="#d0831b" stroke-width="2" stroke-linejoin="round"/>
                    <path d="M88 62v24" stroke="#d0831b" stroke-width="2" opacity=".4"/>
                    <circle cx="60" cy="74" r="7" fill="#fff" stroke="#d0831b" stroke-width="2"/>
                    <text x="60" y="78" class="ra-num">7</text>
                    <circle cx="56" cy="86" r="12.5" fill="#39404a"/><circle cx="56" cy="86" r="5" fill="#f2f6fa"/>
                    <circle cx="127" cy="86" r="12.5" fill="#39404a"/><circle cx="127" cy="86" r="5" fill="#f2f6fa"/>
                  </g>
                </svg>
              </span>
            </div>
            <p>输入越快，赛车越快，<br/>保持准确率提速升档，<br/>抢先跑完 800 米，冲过终点。</p>
            <footer>
              <span class="choice-meta"><i><Users :size="14"/>1—4 人</i><i><Timer :size="14"/>最长 2 分钟</i></span>
              <strong>上车比赛<ArrowRight :size="16"/></strong>
            </footer>
          </button>

          <button class="game-choice chase-choice" type="button" @click="$emit('select', 'chase')" @pointermove="trackGlow">
            <div class="choice-head">
              <div class="choice-titles">
                <div class="choice-name"><CarFront class="name-ico" :size="19"/>生死时速</div>
                <small>警察追小偷 · 环城顺时针</small>
              </div>
              <span class="choice-art" aria-hidden="true">
                <svg viewBox="0 0 168 104">
                  <ellipse cx="84" cy="53" rx="68" ry="43" class="chase-orbit"/>
                  <ellipse cx="84" cy="53" rx="44" ry="27" class="chase-orbit inner"/>
                  <path d="M129 39l12 5-10 9" class="chase-arrow"/>
                  <circle cx="38" cy="60" r="8" class="chase-police-dot"/><circle cx="110" cy="16" r="8" class="chase-thief-dot"/>
                  <path d="M45 56c18-25 37-34 56-37" class="chase-gap"/>
                </svg>
              </span>
            </div>
            <p>两人联机或挑战电脑，警察追上小偷即可获胜。<br/>在倒计时结束前逃脱，小偷赢得比赛。</p>
            <footer>
              <span class="choice-meta"><i><Users :size="14"/>双人联机</i><i><Timer :size="14"/>限时追逐</i></span>
              <strong>开始追逐<ArrowRight :size="16"/></strong>
            </footer>
          </button>

          <button class="game-choice rhythm-choice" type="button" @click="$emit('select', 'rhythm')" @pointermove="trackGlow">
            <div class="choice-head">
              <div class="choice-titles">
                <div class="choice-name"><Music2 class="name-ico" :size="19"/>音游模式</div>
                <small>跟准节奏 · 接准每一个字母</small>
              </div>
              <span class="choice-art" aria-hidden="true">
                <svg viewBox="0 0 168 104">
                  <g class="rh-trail"><path d="M35 2v18"/><path d="M71 2v40"/><path d="M107 2v6"/><path d="M143 2v30"/></g>
                  <path d="M14 92h140" class="rh-line"/>
                  <g class="rh-tiles">
                    <g class="rh-tile"><rect x="20" y="26" width="30" height="30" rx="7"/><text x="35" y="47">A</text></g>
                    <g class="rh-tile"><rect x="56" y="48" width="30" height="30" rx="7"/><text x="71" y="69">S</text></g>
                    <g class="rh-tile"><rect x="92" y="14" width="30" height="30" rx="7"/><text x="107" y="35">D</text></g>
                    <g class="rh-tile"><rect x="128" y="38" width="30" height="30" rx="7"/><text x="143" y="59">F</text></g>
                  </g>
                </svg>
              </span>
            </div>
            <p>字母方块从上方落下，在判定线附近按下对应字母键。<br/>26 键全开放，练准键位与反应。90 秒冲击高分。</p>
            <footer>
              <span class="choice-meta"><i><Users :size="14"/>1—60 人</i><i><Timer :size="14"/>90 秒</i></span>
              <strong>开始挑战<ArrowRight :size="16"/></strong>
            </footer>
          </button>

          <button class="game-choice boss-choice" type="button" @click="$emit('select', 'boss')" @pointermove="trackGlow">
            <div class="choice-head">
              <div class="choice-titles">
                <div class="choice-name"><Users class="name-ico" :size="19"/>极速淘汰赛</div>
                <small>60 人同场 · 活到最后</small>
              </div>
              <span class="choice-art" aria-hidden="true">
                <svg viewBox="0 0 168 104">
                  <ellipse cx="84" cy="56" rx="62" ry="42" class="co-orbit"/>
                  <ellipse cx="84" cy="56" rx="43" ry="30" class="co-orbit inner"/>
                  <ellipse cx="84" cy="56" rx="25" ry="18" fill="#dffbf4" stroke="#2fa06b" stroke-width="2"/>
                  <text x="84" y="60" class="co-txt">TOP 1</text>
                  <circle cx="31" cy="43" r="5" fill="#54d8ad"/><circle cx="126" cy="32" r="5" fill="#8da8c5"/><circle cx="139" cy="71" r="5" fill="#ef7a80"/><circle cx="49" cy="82" r="5" fill="#8da8c5"/>
                </svg>
              </span>
            </div>
            <p>每 20 秒淘汰末位选手，正确输入累积积分，<br/>避开危险区，坚持到最后成为唯一幸存者。</p>
            <footer>
              <span class="choice-meta"><i><Users :size="14"/>1—60 人</i><i><Timer :size="14"/>20 秒一轮</i></span>
              <strong>进入赛场<ArrowRight :size="16"/></strong>
            </footer>
          </button>

          <button class="game-choice territory-choice" type="button" @click="$emit('select', 'battle')" @pointermove="trackGlow">
            <div class="choice-head">
              <div class="choice-titles">
                <div class="choice-name"><Swords class="name-ico" :size="19"/>阵营对抗</div>
                <small>速度而战 · 用输入占领领地</small>
              </div>
              <span class="choice-art" aria-hidden="true">
                <svg viewBox="0 0 168 104">
                  <defs>
                    <linearGradient id="bfRedG" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stop-color="#f07568"/><stop offset="1" stop-color="#d94b45"/>
                    </linearGradient>
                    <linearGradient id="bfBlueG" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stop-color="#5c96e8"/><stop offset="1" stop-color="#3568cf"/>
                    </linearGradient>
                  </defs>
                  <ellipse cx="52" cy="94" rx="20" ry="4" fill="#dd8f8f" opacity=".2"/>
                  <ellipse cx="116" cy="94" rx="20" ry="4" fill="#8fa8d8" opacity=".2"/>
                  <path d="M42 20v70" class="bf-pole"/><path d="M126 32v58" class="bf-pole"/>
                  <path d="M42 22c11-6 20 4 32-2v26c-12 6-21-4-32 2z" fill="url(#bfRedG)" class="bf-flag"/>
                  <path d="M126 34c-11-6-20 4-32-2v26c12 6 21-4 32 2z" fill="url(#bfBlueG)" class="bf-flag"/>
                  <text x="58" y="41" class="bf-char">红</text>
                  <text x="110" y="53" class="bf-char">蓝</text>
                  <text x="84" y="63" class="bf-vs">VS</text>
                </svg>
              </span>
            </div>
            <p>加入红方或蓝方，连击越高占领越快，<br/>用稳定的输入推进前线，和队友一起拿下更多领地。</p>
            <footer>
              <span class="choice-meta"><i><Users :size="14"/>2—60 人</i><i><Timer :size="14"/>领地对决</i></span>
              <strong>进入战场<ArrowRight :size="16"/></strong>
            </footer>
          </button>
        </div>

        <footer class="lobby-foot">
          <p><Info :size="14"/>同一服务器内实时比赛；打字赛车支持自动匹配或邀请码，生死时速支持双人房与人机。登录后训练表现会记录到个人成长中。</p>
          <span><Keyboard :size="14"/>支持中英文输入<i/>Enter 开始<i/>Esc 返回</span>
        </footer>
      </div>
    </div>
  </section>
</template>
<style scoped>
/* 大厅自成一屏：隐藏全局蓝色顶栏，锁定 100dvh，内容在内部滚动 */
:global(.app-shell:has(.game-lobby)){height:100dvh;overflow:hidden}
:global(.app-shell:has(.game-lobby)>.topbar){display:none}

.game-lobby{height:100dvh;display:flex;flex-direction:column;overflow:hidden;background:linear-gradient(180deg,#f8fbff,#f0f6fc 70%,#f2f8fe);color:#1c3c5e;font-family:'Microsoft YaHei',sans-serif}

/* ---- 顶栏：白色品牌区 + 导航胶囊 + 账号/CTA，固定不随内容滚动 ---- */
.lobby-topbar{flex:none;position:relative;z-index:20;background:#fff;border-bottom:1px solid #e8eef7;box-shadow:0 4px 16px #2b5b8f0a}
.lobby-topbar-inner{display:flex;align-items:center;gap:34px;width:min(1280px,calc(100% - 48px));margin:auto;height:62px}
.lobby-brand{display:flex;align-items:center;gap:11px;border:0;background:transparent;padding:0;cursor:pointer;text-align:left}
.lobby-logo{width:36px;height:36px;display:block;filter:drop-shadow(0 3px 8px #2d74d44d)}
.lobby-logo svg{width:100%;height:100%;display:block}
.lobby-brand-copy b{display:block;font-size:17px;font-weight:800;color:#1c2b3a;letter-spacing:.02em}
.lobby-brand-copy small{display:block;margin-top:1px;font-size:9px;font-weight:700;letter-spacing:2.4px;color:#97a9bf;white-space:nowrap}
.lobby-nav{display:flex;align-items:center;gap:6px}
.lobby-bug-link{display:flex;align-items:center;gap:6px;padding:8px 10px;border:1px solid #dce8f5;border-radius:999px;background:#fff;color:#587895;font-size:11px;cursor:pointer}
.lobby-bug-link:hover{border-color:#9ec3f0;background:#f4f9ff;color:#347bd0}
.lobby-nav button{display:flex;align-items:center;gap:7px;padding:8px 15px;border:0;border-radius:999px;background:transparent;color:#5c7691;font-size:13px;font-weight:600;cursor:pointer;transition:background .18s,color .18s}
.lobby-nav button:hover{background:#f0f6fd;color:#2f6bb5}
.lobby-nav button.is-active{background:#e8f1fe;color:#2f7bd9}
.lobby-actions{margin-left:auto;display:flex;align-items:center;gap:10px}
.lobby-account{display:flex;align-items:center;gap:8px;padding:6px 13px 6px 7px;border:1px solid #e2ebf6;border-radius:999px;background:#fff;color:#274a6e;font-size:13px;font-weight:600;cursor:pointer;transition:border-color .18s,box-shadow .18s}
.lobby-account:hover{border-color:#bcd4ef;box-shadow:0 3px 10px #2b5b8f14}
.lobby-avatar{display:grid;place-items:center;width:24px;height:24px;border-radius:50%;background:#eaf2fd;color:#4a86d8;overflow:hidden}
.lobby-avatar img{width:100%;height:100%;object-fit:cover}
.lobby-cta{display:flex;align-items:center;gap:8px;padding:9px 17px;border:0;border-radius:999px;background:linear-gradient(120deg,#3f8ae4,#2c6fd0);color:#fff;font-size:13px;font-weight:700;cursor:pointer;box-shadow:0 6px 14px #2c6fd038;transition:transform .18s,box-shadow .18s,filter .18s}
.lobby-cta:hover{filter:brightness(1.06);transform:translateY(-1px);box-shadow:0 9px 20px #2c6fd04d}
.lobby-cta:active{transform:translateY(0) scale(.98)}

/* ---- 内容区：卡片列表超出可视区域时在此滚动 ---- */
.lobby-scroll{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:#c8d9ee transparent}
.lobby-scroll::-webkit-scrollbar{width:9px}
.lobby-scroll::-webkit-scrollbar-thumb{background:#c8d9ee;border-radius:99px;border:2px solid transparent;background-clip:content-box}
.lobby-scroll::-webkit-scrollbar-thumb:hover{background:#aec8e6;background-clip:content-box}
.lobby-inner{width:min(1180px,calc(100% - 48px));margin:auto;padding:34px 0 30px}

/* ---- Hero 标题区 ---- */
.lobby-hero{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;margin-bottom:26px}
.lobby-hero h1{margin:0;font-size:36px;font-weight:800;letter-spacing:.02em;color:#1b2b3e}
.lobby-hero p{margin:10px 0 0;font-size:14px;color:#5b7288}
.lobby-script{flex:none;margin:8px 20px 0 0;font-family:'Segoe Script','Comic Sans MS',cursive;font-style:italic;font-size:21px;line-height:1.4;color:#9fc3ec;transform:rotate(-7deg);text-align:left;user-select:none}
.lobby-script i{color:#bcd7f4}

/* ---- 模式卡片 ---- */
.game-choices{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}
.game-choice.runner-choice{--accent:#41846b;--accent-soft:#e6f0db;--accent-ink:#54745b;--body-ink:#576f57;--meta-ink:#769078;--card-line:#cdddc4;--btn-from:#518663;--btn-to:#2a6656;--btn-glow:#41846b50;background:linear-gradient(160deg,#f6f5e8,#e7f2e4)}
.runner-new{padding:3px 6px;border-radius:5px;color:#725324;background:#f8dda1;font:700 9px Consolas,monospace;letter-spacing:.06em}
.game-choice{--accent:#2f7bd9;--accent-soft:#e9f2fe;--accent-ink:#5b7ba3;--body-ink:#5e7693;--meta-ink:#7d94ad;--card-line:#d5e4fa;--btn-from:#3f8ae0;--btn-to:#2a6cc8;--btn-glow:#3f8ae059;position:relative;display:flex;flex-direction:column;text-align:left;padding:24px 26px 22px;border:1px solid var(--card-line);border-radius:16px;cursor:pointer;overflow:hidden;font-family:inherit;transition:transform .22s cubic-bezier(.2,.75,.25,1),box-shadow .22s,border-color .22s}
.game-choice::before{content:'';position:absolute;inset:0;z-index:0;pointer-events:none;background-image:radial-gradient(240px 180px at var(--glow-x,50%) var(--glow-y,50%),var(--accent),transparent 70%);opacity:0;transition:opacity .25s}
.game-choice:hover{transform:translateY(-4px);border-color:var(--accent);box-shadow:0 16px 30px -12px var(--btn-glow)}
.game-choice:hover::before{opacity:.08}
.game-choice:active{transform:translateY(-1px)}
.game-choice:focus-visible{outline:3px solid var(--accent);outline-offset:3px}
.game-choice>*{position:relative;z-index:1}
.choice-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}
.choice-name{display:flex;align-items:center;gap:9px;font-size:18px;font-weight:800;color:#263449}
.name-ico{color:var(--accent);flex:none}
.choice-titles small{display:block;margin-top:7px;font-size:12px;color:var(--accent-ink)}
.choice-art{flex:none;width:158px;height:98px;margin:-6px -8px 0 0}
.choice-art svg{width:100%;height:100%;display:block;overflow:visible}
.game-choice>p{margin:12px 0 14px;font-size:13px;line-height:1.85;color:var(--body-ink)}
.game-choice footer{margin-top:auto;display:flex;align-items:center;justify-content:space-between;gap:12px}
.choice-meta{display:flex;align-items:center;gap:14px;font-size:12px;color:var(--meta-ink)}
.choice-meta i{display:flex;align-items:center;gap:5px;font-style:normal}
.game-choice footer strong{display:flex;align-items:center;gap:6px;padding:9px 16px;border-radius:10px;background:linear-gradient(120deg,var(--btn-from),var(--btn-to));color:#fff;font-size:13px;font-weight:700;box-shadow:0 5px 12px var(--btn-glow);transition:transform .18s,filter .18s}
.game-choice:hover footer strong{filter:brightness(1.06)}
.game-choice:active footer strong{transform:scale(.96)}

/* ---- 各模式配色 ---- */
.race-choice{--accent:#ee8c19;--accent-soft:#fdeeda;--accent-ink:#a06a24;--body-ink:#83704f;--meta-ink:#a08a63;--card-line:#f0dfc0;--btn-from:#f7a11f;--btn-to:#ef8614;--btn-glow:#f7a11f59;background:linear-gradient(180deg,#fffaf0,#fff3e0)}
.rhythm-choice{background:linear-gradient(180deg,#f2f7ff,#e9f1fd)}
.boss-choice{--accent:#2fa06b;--accent-soft:#e2f5ea;--accent-ink:#4f8168;--body-ink:#5c7f6e;--meta-ink:#7fa190;--card-line:#cfe9db;--btn-from:#35ab74;--btn-to:#27905e;--btn-glow:#2fa06b59;background:linear-gradient(180deg,#f2fbf6,#eaf7f0)}
.chase-choice{--accent:#477fe0;--accent-soft:#e5edff;--accent-ink:#607fac;--body-ink:#617891;--meta-ink:#8195ac;--card-line:#d5e0f7;--btn-from:#477fe0;--btn-to:#285dbb;--btn-glow:#477fe059;background:linear-gradient(180deg,#f3f7ff,#eaf0ff)}
.chase-choice{--accent:#267bc7;--accent-soft:#dff2ff;--accent-ink:#47789c;--body-ink:#506f8a;--meta-ink:#758da4;--card-line:#bddcf0;--btn-from:#168cd6;--btn-to:#1763b5;--btn-glow:#328fe659;background:linear-gradient(180deg,#f0f9ff,#e1f2fb)}
.territory-choice{--accent:#e05252;--accent-soft:#fdeaea;--accent-ink:#a05560;--body-ink:#8a6068;--meta-ink:#a87e88;--card-line:#f2d7da;--btn-from:#e75f52;--btn-to:#d64545;--btn-glow:#e0525259;background:linear-gradient(180deg,#fdf3f3,#fcecec)}
.competition-choice{--accent:#7b62d8;--accent-soft:#eeeaff;--accent-ink:#75699e;--body-ink:#6b6687;--meta-ink:#8c83aa;--card-line:#ddd6f5;--btn-from:#856de0;--btn-to:#6249bf;--btn-glow:#8067d459;background:linear-gradient(180deg,#faf8ff,#f0ecff)}

/* ---- 卡片插画 ---- */
.ra-speed{font:italic 800 17px/1 Georgia,serif;letter-spacing:3px;fill:#f3c98b}
.ra-lines path{stroke:#f0bf7d;stroke-width:4;stroke-linecap:round;opacity:.55}
.ra-num{font:700 9px 'Microsoft YaHei',sans-serif;fill:#d0831b;text-anchor:middle}
.rh-line{stroke:#2f7bd9;stroke-width:3;stroke-linecap:round;opacity:.9}
.rh-trail path{stroke:#a9c9f0;stroke-width:2;stroke-linecap:round;opacity:.85}
.rh-tiles rect{fill:#fff;stroke:#b9d4f8;stroke-width:1.5}
.rh-tiles text{font:700 15px Consolas,monospace;fill:#2f7bd9;text-anchor:middle}
.co-orbit{fill:none;stroke:#5cb98a;stroke-width:1.6;stroke-dasharray:5 7;opacity:.55}
.chase-orbit{fill:none;stroke:#5687e2;stroke-width:2;stroke-dasharray:4 6;opacity:.65}.chase-orbit.inner{stroke:#95b5f3;stroke-width:1.4;opacity:.55}.chase-arrow{fill:none;stroke:#487cdf;stroke-width:3;stroke-linecap:round;stroke-linejoin:round}.chase-gap{fill:none;stroke:#bf86ee;stroke-width:2;stroke-dasharray:3 4;opacity:.85}.chase-police-dot{fill:#3086ef;stroke:#e7f2ff;stroke-width:3;filter:drop-shadow(0 2px 4px #3178df66)}.chase-thief-dot{fill:#ef814b;stroke:#fff0d9;stroke-width:3;filter:drop-shadow(0 2px 4px #d9594266)}
.chase-choice .chase-orbit{stroke:#448fca}.chase-choice .chase-orbit.inner{stroke:#82b6d7}.chase-choice .chase-arrow{stroke:#2478bb}.chase-choice .chase-gap{stroke:#edaa5e}.chase-choice .chase-police-dot{fill:#2b88dc}.chase-choice .chase-thief-dot{fill:#ed694b}
.co-txt{font:800 15px 'Microsoft YaHei',sans-serif;fill:#2f9e63;text-anchor:middle;letter-spacing:1px}
.bf-pole{stroke:#8b6a55;stroke-width:4;stroke-linecap:round}
.bf-char{font:700 14px 'Microsoft YaHei',sans-serif;fill:#fff;text-anchor:middle}
.bf-vs{font:italic 900 20px Georgia,serif;fill:#f2643c;text-anchor:middle}

/* ---- 悬浮微动效 ---- */
.race-choice:hover .ra-car{animation:lobbyCarBob 1.1s ease-in-out infinite}
.race-choice:hover .ra-lines{animation:lobbyLineRun .55s linear infinite}
.rhythm-choice:hover .rh-tile{animation:lobbyTileDrop 1.4s ease-in-out infinite}
.rhythm-choice:hover .rh-tile:nth-child(2){animation-delay:-.35s}
.rhythm-choice:hover .rh-tile:nth-child(3){animation-delay:-.7s}
.rhythm-choice:hover .rh-tile:nth-child(4){animation-delay:-1.05s}
.boss-choice:hover .co-orbit{animation:lobbyOrbit 9s linear infinite;transform-origin:84px 56px}
.boss-choice:hover .co-shield{animation:lobbyShieldBreath 1.8s ease-in-out infinite;transform-origin:84px 56px}
.chase-choice:hover .chase-orbit{animation:lobbyOrbit 8s linear infinite;transform-origin:84px 53px}.chase-choice:hover .chase-thief-dot{animation:lobbyTileDrop 1s ease-in-out infinite}.chase-choice:hover .chase-police-dot{animation:lobbyTileDrop 1s ease-in-out infinite reverse;animation-delay:-.5s}
.territory-choice:hover .bf-vs{animation:lobbyVsPop 1.3s ease-in-out infinite;transform-origin:84px 60px}
.territory-choice:hover .bf-flag{animation:lobbyFlagWave 1.6s ease-in-out infinite;transform-origin:42px 35px}
.territory-choice:hover .bf-flag:last-of-type{transform-origin:126px 47px;animation-delay:-.8s}
@keyframes lobbyCarBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}
@keyframes lobbyLineRun{from{transform:translateX(0);opacity:.55}to{transform:translateX(-7px);opacity:.2}}
@keyframes lobbyTileDrop{0%,100%{transform:translateY(0)}50%{transform:translateY(7px)}}
@keyframes lobbyOrbit{from{transform:rotate(0)}to{transform:rotate(360deg)}}
@keyframes lobbyShieldBreath{0%,100%{transform:scale(1)}50%{transform:scale(1.05)}}
@keyframes lobbyVsPop{0%,100%{transform:scale(1)}50%{transform:scale(1.14)}}
@keyframes lobbyFlagWave{0%,100%{transform:rotate(0)}50%{transform:rotate(-3deg)}}

/* ---- 底部提示行 ---- */
.lobby-foot{display:flex;align-items:center;justify-content:space-between;gap:18px;margin-top:24px;padding-top:16px;font-size:12px;color:#8298b0}
.lobby-foot p{margin:0;display:flex;align-items:center;gap:7px}
.lobby-foot p svg,.lobby-foot>span>svg{flex:none;color:#a9bdd3}
.lobby-foot>span{flex:none;display:flex;align-items:center;gap:10px}
.lobby-foot>span i{width:1px;height:11px;background:#d4e0ef}

/* ---- 响应式 ---- */
@media(max-width:1200px){.cta-txt{display:none}.lobby-topbar-inner{gap:16px}.lobby-nav button{white-space:nowrap;padding:8px 10px}}
@media(max-width:960px){.lobby-nav{display:none}.lobby-hero h1{font-size:32px}}
@media(max-width:680px){
  .game-choices{grid-template-columns:1fr}
  .lobby-hero h1{font-size:28px}
  .lobby-script{display:none}
  .choice-art{width:128px;height:82px}
  .game-choice>p br{display:none}
  .game-choice footer{flex-wrap:wrap;gap:12px}
  .choice-meta{flex-wrap:wrap}
  .choice-meta i,.game-choice footer strong{white-space:nowrap}
  .lobby-topbar-inner{gap:12px;width:calc(100% - 32px)}
  .lobby-foot{flex-direction:column;align-items:flex-start;gap:8px}
}
@media(max-width:560px){.lobby-brand-copy small,.lobby-bug-link span{display:none}.lobby-actions{gap:6px}.lobby-account b{max-width:72px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.lobby-cta{padding:9px 12px}}
@media(prefers-reduced-motion:reduce){
  .game-choice,.game-choice footer strong,.lobby-cta,.lobby-account{transition:none}
  .game-choice:hover{transform:none}
  .game-choice:hover .ra-car,.game-choice:hover .ra-lines,.game-choice:hover .rh-tile,.game-choice:hover .co-orbit,.game-choice:hover .co-shield,.game-choice:hover .chase-orbit,.game-choice:hover .chase-thief-dot,.game-choice:hover .chase-police-dot,.game-choice:hover .bf-vs,.game-choice:hover .bf-flag{animation:none}
}
</style>
