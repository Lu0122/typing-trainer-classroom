# Header 统一改造计划

> 状态：**待确认，未动代码**
> 目标：把全站 9 个各自重画的 header 收敛成 1 个组件，消除页面切换时的视觉跳变。

## 一、现状

### 1.1 一共 9 个 header

| # | 文件 | 类名 | 已知高度 | 内容 |
| --- | --- | --- | --- | --- |
| 1 | `App.vue` | `.topbar` | 104px（首页）/ 76px（其他） | 四色 logo + 字练场 2026 + ABC 装饰 + 用户胶囊 |
| 2 | `GameLobby.vue` | `.lobby-topbar` | 待测 | 音符 SVG logo + 4 项导航 + Bug 反馈 + 用户 + CTA |
| 3 | `ArenaGame.vue` | `.arena-header` | 待测 | 返回大厅 + Flag/Music2 + 标题 + 3 项 nav + 房间号/人数/计时 |
| 4 | `BattleGame.vue` | `.battle-header` | 待测 | Keyboard 图标 + 标题 + 公告条 |
| 5 | `BossGame.vue` | `.boss-header` | 待测 | 返回大厅 + Swords + 极速淘汰赛 + 会话状态 |
| 6 | `ChaseGame.vue` | `.chase-topbar` | 待测 | 返回大厅 + Shield + 生死时速 + 状态 |
| 7 | `RunnerGame.vue` | `.runner-header` | 待测 | 返回大厅 + Footprints + 遗迹逃亡 + 状态 |
| 8 | `BugFeedback.vue` | `.bug-topbar` | 70px / 60px | 返回大厅 + Bug + 问题反馈 + 状态 |
| 9 | `CompetitionGame.vue` | `.competition-header` | 68px | 返回游戏大厅 + 打字比赛 + 大屏链接 + 计时 |

### 1.2 跳变有三个来源

1. **换页面换组件**：`App.vue` 的 topbar 只在非游戏页渲染；进游戏页就换成组件自己的 header，结构完全重写。
2. **换组件换配色**：`App.vue` 是蓝色渐变通栏，游戏页是白色卡片/白条。
3. **同组件换高度**：`.topbar` 在 `style.css` 里有 76px 和 104px 两套，连渐变都写了两条
   （`#3788ef→#68b2ff` 与 `#3587ee→#5aa7fb→#4f99ef`）；`.bug-topbar` 也有 70/60 两档。

### 1.3 logo 也重画了多份

首页四色方块、大厅音符 SVG、音游 lucide `Flag`/`Music2`、占领战 `Keyboard`、淘汰赛 `Swords`、
追逐 `Shield`、逃亡 `Footprints`、反馈 `Bug`。同一个产品有 8 种「品牌图形」。

## 二、目标（已确认）

- **配色**：全站保留蓝色。首页维持蓝色通栏，游戏页也用**蓝色**矮版，不再出现白色 header。
- **范围**：一次全站改完。
- **游戏页导航**：精简为「返回大厅 + 排行榜」两项，四项完整导航只在游戏大厅显示。

## 三、设计规格

### 3.1 组件

新建 `frontend/src/AppHeader.vue`（`frontend/src/` 目前是平铺结构，暂不建子目录）。

**四个固定槽位**：品牌 / 导航 / 状态 / 操作。任何页面只决定填不填，不再重写结构。

```vue
<AppHeader
  variant="compact"            <!-- hero | compact -->
  title="打字比赛"
  subtitle="QUALIFIER · FINAL"
  :icon="Trophy"
  back-label="返回大厅"
  :user="user"
  @back="..."
>
  <template #status>房间 {{ roomNo }} · {{ players }}/{{ capacity }}</template>
  <template #actions>...</template>
</AppHeader>
```

| Prop | 类型 | 说明 |
| --- | --- | --- |
| `variant` | `'hero' \| 'compact'` | 只影响高度与装饰，**不影响配色** |
| `title` / `subtitle` | string | compact 档隐藏副标题 |
| `icon` | 组件 | 品牌图形统一从 lucide 取，各页传自己的图标 |
| `backLabel` | string | 传了才显示返回按钮 |
| `user` | object | 用户胶囊；未登录显示「登录 / 注册」 |
| `decor` | boolean | 仅 hero 档显示 ABC 装饰 |

| Slot | 位置 | 说明 |
| --- | --- | --- |
| `nav` | 中 | 导航项，可空 |
| `status` | 右中 | 房间号 / 人数 / 计时，可空 |
| `actions` | 最右 | 主 CTA，可空 |

### 3.2 视觉

| 项 | 规格 |
| --- | --- |
| 背景 | `linear-gradient(105deg,#3788ef,#68b2ff)` —— **只保留这一条**，删掉 104px 那条 |
| 文字 | `#fff`，副标题 `rgba(255,255,255,.72)` |
| hero 高度 | 104px |
| compact 高度 | 56px |
| 品牌图形 | 40×40 圆角方块，白底 20% 透明 + 白色图标（统一，不再用四色方块/自绘 SVG） |
| 导航胶囊 | `rgba(255,255,255,.16)` 底，选中态白底 + `#2d74d4` 字 |
| 用户胶囊 | 白底 + `#2d74d4` 字（沿用现有 `account-pill` 观感） |
| 圆角 | 品牌方块 11px，胶囊 999px |
| 响应式 | ≤1366px 隐藏副标题与导航文字、只留图标；≤1100px 隐藏导航 |

## 四、改动清单

| 文件 | 改什么 | 风险 |
| --- | --- | --- |
| `frontend/src/AppHeader.vue` | **新建** | — |
| `App.vue` | `<header class="topbar">` → `<AppHeader variant="hero">`；首页用 hero，其余页 compact | `app-shell` 上的 `is-*-page` 类**可能还被别的布局规则用到**，只能摘掉与 topbar 相关的规则，不能整类删除 |
| `GameLobby.vue` | 替换 `lobby-topbar`，导航走 `#nav` 槽 | 大厅是白底卡片风，换成蓝色 header 后顶部对比度变化，需看截图 |
| `ArenaGame.vue` | 替换 `arena-header`，房间号/人数/计时走 `#status` | 赛车与音游共用该组件，两种状态都要测 |
| `BattleGame.vue` | 替换 `battle-header` | 原有「公告条」要塞进 `#status` 或下移到页面内 |
| `BossGame.vue` | 替换 `boss-header` | 会话状态进 `#status` |
| `ChaseGame.vue` | 替换 `chase-topbar` | 视角/画质按钮保留在页面内，不进 header |
| `RunnerGame.vue` | 替换 `runner-header` | 画质切换同理 |
| `BugFeedback.vue` | 替换 `bug-topbar`，顺手消掉 70/60 两档 | — |
| `CompetitionGame.vue` | 替换 `competition-header`，「大屏模式 ↗」进 `#actions` | 计时器已在 `#status` 位 |
| `frontend/src/style.css` | 删 `.topbar`、`.topbar-decoration` 及两套高度/渐变 | 删除前先全量 grep 确认无其他引用 |
| `frontend/src/Board.vue` | **不动** | 大屏是投影专用，不需要品牌与导航 |

## 五、执行步骤

| 步骤 | 内容 | 产出 |
| --- | --- | --- |
| **0 基线** | 起服务，用浏览器量出 9 个 header 的**实际渲染高度**与各游戏页中间区高度，记成表格 | `docs/HEADER-BASELINE.md` |
| 1 组件 | 写 `AppHeader.vue`，先在 `BugFeedback` 上试装（最独立、不影响游戏） | 单页可看 |
| 2 游戏页 | 依次替换 lobby / arena / battle / boss / chase / runner / competition | 7 页统一 |
| 3 首页 | `App.vue` 接入，hero 档 | 首页统一 |
| 4 清理 | 删 `style.css` 里的旧 topbar 规则与死样式 | 代码收敛 |
| 5 验收 | 见下节 | 验收记录 |

**每一步单独 commit**，任一步出问题可单独 `git revert`，不会牵动其他步骤。

## 六、验收标准

1. **一屏约束**：`scripts/measure-arena-height.mjs` 在 1920×1080 / 1440×900 / 1366×768 / 1280×720
   四个分辨率下，`scrollHeight === innerHeight`，且各游戏区子元素
   `getBoundingClientRect().bottom <= innerHeight`（不能只看 scrollHeight，会被 `overflow:hidden` 静默裁切）。
2. **无控制台错误**：扩展 `scripts/verify-competition.mjs` 的 `watch()` 到 8 个页面。
3. **回归**：`node --test` 全绿；`vite build` 成功。
4. **视觉**：每个页面改前改后各截一张图，放 `output/header/`，逐页对比确认没有挤压、没有文字截断。
5. **跳变消失**：首页 → 游戏大厅 → 音游 → 比赛 → 返回首页，全程 header 只有高度变化，配色与结构不变。

## 七、风险

| 风险 | 对策 |
| --- | --- |
| 游戏页中间区被压缩 | 统一 header 是**替换**不是新增，净变化 = 56px − 旧 header 高度；旧高度实测后再决定 compact 用 56 还是 52 |
| 1366 窄屏导航拥挤 | 断点 ≤1366 收成图标，≤1100 隐藏导航 |
| `is-*-page` 类牵连其他布局 | 先 grep 出这些类的全部用法，只删 topbar 相关规则 |
| 一次改完难定位问题 | 每页单独 commit + 单页截图验收，出问题按页回退 |
| 蓝色 header 下白底卡片对比过强 | 大厅/比赛页顶部间距加大 8px 做过渡，必要时加一条浅色分隔 |

## 八、待你确认

1. 主 CTA「一起打字，一起上场」目前只在大厅有 —— 统一后**只保留在首页与游戏大厅**，游戏页不放，是否同意？
2. `compact` 高度先用 **56px**（比现有 60/68/70 都矮，能腾出空间），如果实测中间区仍紧张再降到 52px。
