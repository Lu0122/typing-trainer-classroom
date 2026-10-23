# 游戏页「整页一屏」适配 QA

改动目标：所有联机游戏页在 **100vh 内完整显示**，不出现页面滚动条。

## 涉及文件

| 文件 | 改动 |
|---|---|
| `frontend/src/arena.css` | 页框改固定 `100dvh` + 隐藏溢出；中间层改弹性 grid；右栏排行榜改弹性列表 |
| `frontend/src/RhythmBoard.vue` | `.rn`/`.rn-field` 改 flex 弹性高度；收紧键位提示高度；清掉写死高度的媒体查询 |
| `scripts/measure-arena-height.mjs` | 验收脚本：按分辨率量溢出与各区块高度 |
| `scripts/shot-rhythm-fit.mjs` | 验收脚本：多分辨率截图 + 裁切检查 |

## 布局机制

采用**弹性分配**而非算死高度：

```
.arena-game        height:100dvh; overflow:hidden; display:flex; flex-direction:column
  .arena-layout    flex:1 1 auto; min-height:0; grid-template-rows:minmax(0,1fr) auto
    .arena-stage   display:flex; flex-direction:column; min-height:0
      .rn          flex:1 1 auto; min-height:0; display:flex; flex-direction:column
        .rn-stats  0 0 auto（统计，固定）
        .rn-field  1 1 auto; min-height:140px（轨道，吃掉剩余空间）
        .rn-foot   0 0 auto（进度 + 键位 + 图例，固定）
    .arena-board   display:flex; flex-direction:column; min-height:0
```

### 两条硬性要求

1. **链路里每个 flex 子项都要显式写 `min-height:0`**。
   默认值是 `auto`，会被内容撑住、拒绝收缩，弹性分配就形同虚设。
2. **可伸缩子块的下限必须 ≤ 最矮目标视口能给出的空间**。
   设太大时 flex 拒绝收缩，超出部分会被 `overflow:hidden` **静默裁切**——
   页面不滚了，但内容少了一截，截图上很难发现。

## 验收结果

### 溢出（`scripts/measure-arena-height.mjs`）

| 分辨率 | rhythm | race |
|---|---|---|
| 1920×1080 | 超出 0px | 超出 0px |
| 1440×900 | 超出 0px | 超出 0px |
| 1366×768 | 超出 0px | 超出 0px |
| 1280×720 | 超出 0px | 超出 0px |

**8/8 组合全部无滚动**，最低元素底部均在视口内。

### 音游轨道可用高度（弹性分配结果）

| 分辨率 | 轨道高度 |
|---|---|
| 1920×1080 | 442px |
| 1440×900 | 263px |
| 1366×768 | 171px |
| 1280×720 | 140px（下限） |
| 900×700（窄屏） | 150px（键盘提示隐藏） |

1366×768 的内部账：stats 84 + 轨道 171 + foot 91 + 间隙 24 = **370 ≈ 可用 369px**，
严丝合缝、无裁切。

### 功能回归

- `npm test`：**87/87 通过**。
- 整局精确按键（`scripts/verify-rhythm-timeline.mjs`）：
  **241 PERFECT / 1 GREAT / 0 MISS，242 连击，188,150 分，100% 完成度**，控制台无报错。
- `scripts/verify-race-intact.mjs`：race 仍是赛道 + textarea、无音游面板；rhythm 反之。
- 小屏裁切检查：`getBoundingClientRect().bottom <= innerHeight`，键位提示 **ok**（未裁切）。
- 截图：`output/rhythm-verify/70-fit-{1366x768,1920x1080,900x700窄屏}.png`、
  进行中 `40-midgame.png`、倒计时 `61-countdown-*.png`。

## 使用边界

- 窄屏（≤980px）隐藏键盘提示条，把空间让给轨道；这是有意的取舍，
  因为小屏上「看清下落方块」比「看键位图」更重要。
- 低于 700px 宽会切到手机竖排布局（`.arena-layout` 变 `flex-direction:column`），
  此时页面是按内容排布、**不保证一屏**——目标场景是教室机/投影，不是手机。
- 右栏排行榜高度随屏幕伸缩，条目多时**内部滚动**（`overflow:auto`），不影响整页。
- 倒计时读数、判定回馈、下落方块都定位在轨道内部，轨道高度变化不影响其行为。

## 维护提示

改动任何游戏页布局后，先跑：

```bash
BASE=http://127.0.0.1:<端口> "D:\SoftwareTools\nvm\nodejs\node.exe" scripts/measure-arena-height.mjs
```

注意端口是通过 **`BASE` 环境变量**传入的（脚本内默认 3123），不是命令行参数。
新增游戏页时，请沿用上面的 flex + `min-height:0` 结构，不要写死 px/vh 高度。
