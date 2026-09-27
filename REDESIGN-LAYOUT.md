# 布局重设计决策记录（字母音游 · ArenaGame）

## Design Read

```yaml
artifact: 实时对战游戏页（字母音游 / 打字赛车共用）
audience: 课堂场景下的学生，1 米外看屏幕，边打字边看赛道
visual-language: 深色街机 / 节奏游戏（restrained arcade rhythm），青蓝双色分区
mode: Redesign · Preserve
visual-variance: 4      # 灰底只有 1 处非对称：4:1 主从两列，其余全部对齐
motion-intensity: 5    # 保留 three.js 下落与判定特效；新增仅限状态反馈
information-density: 5 # 大幅下调（原 7）：文字说明压缩，让位给赛道
asset-dependence: 2    # 无品牌资产依赖，赛道本身是主体
brand-fidelity: 9      # 保留全部配色 / 字体 / 圆角 / 阴影令牌
```

## 问题诊断（用户原话）

> 「游戏区域太小，文字描述太多。我觉得分左右两列 4:1，游戏页面区 4，排行榜开始按钮那些 1。」

实测旧布局是 **两行三区**：
- 第 1 行：`.arena-stage`（赛道，占 1fr）+ `.arena-board`（排行榜，固定 290px）
- 第 2 行：`.arena-input-panel` 横跨整宽

后果：
1. 赛道被压在「1 行」内，同时被右侧 290px 固定栏挤压宽度；
2. 输入面板占掉整行高度，赛道纵向只剩一半；
3. 页头 + 赛道头部 + `.arena-track-note` + `.arena-hit-feedback` 四层文字堆在赛道上方，
   视觉重心被文字抢走。

## Before / After

```text
Mode: Redesign · Preserve

Preserve:
  - 全部 CSS 变量与配色（--ar-bg / --ar-panel / --ar-accent …）
  - 组件 class 名（rn-* / arena-*）与 Vue 双向绑定
  - 右侧栏的「排行榜 + 加入/开始按钮 + 个人数据」信息架构与顺序
  - 所有 aria / role / dialog 语义、键盘焦点顺序
  - 赛车模式的输入面板（文字输入是赛车玩法的核心，不能藏）

Improve:
  - 主布局从「两行三区」改为「两列 4:1」：左列 = 赛道（跨两行，吃掉全部剩余高度），
    右列 = 排行榜（上）+ 开始按钮区（下）
  - 赛道宽度与高度同时放大：宽度从 ~1036px 增到 ~1330px（1440×900），
    高度从 261px 增到 ~640px
  - 文字层级压缩：赛道标题降为一行副标题 + 一行 h1；
    `.arena-track-note` 由段落改为单行脚注；
    `.arena-hit-feedback` 由固定高度条改为浮在赛道底部的轻量提示
  - 赛道容器宽高比从 4:1 变为约 2:1 —— 这直接改善了 three.js 相机配比，
    使轨道远端与判定线之间的纵深从 0.28 屏高提升到 0.62 屏高

Remove:
  - 赛道头部的 `.arena-eyebrow` 与 `.arena-tag` 合并为一行
  - 音游模式下右侧栏中重复的「键盘已接管」说明块（信息已由赛道内倒计时/回馈承担）
  - 旧 `.arena-input-panel` 在音游模式下占据的整行高度（改为右列底部的小块）

Protected contracts:
  - 路由与 API 调用（/api/arena/{mode}/…）不变
  - Vue props/emits 不变（user / mode / back / login）
  - 验收脚本依赖的 class 名：rn-stats / rn-field / rn-hit / rn-legend / rn-key /
    rn-countdown / rn-feedback / rn-progress —— 全部保留
  - dialog.arena-exit 的 id 与 aria-labelledby 不变

Design Read + dials: 见上（density 由 7 降到 5，是本轮最主要的调整）

Highest-risk change:
  - 音游模式下隐藏整行输入面板。若赛场需要看文字提示，
    右列底部保留一个紧凑的说明块作为兜底。

Rollback / fallback:
  - 改动集中在 arena.css 的布局规则与 ArenaGame.vue 的模板结构，
    两者都在版本控制内；回退只需恢复这两个文件。
```

## 布局规格

```text
.arena-layout
  display: grid
  grid-template-columns: minmax(0, 4fr) minmax(240px, 1fr)   ← 4:1
  grid-template-rows: minmax(0, 1fr)
  gap: 14px

  ├─ .arena-stage       （左列，跨满高度）  three.js 赛道 + 极简头部 + 底部提示
  └─ .arena-board       （右列，跨满高度）  排行榜（滚动） + 加入/开始 + 个人数据
```

赛车模式例外：`.arena-stage` 内部再分成「赛道」与「输入面板」两块（上下），
因为文字输入是赛车玩法的操作本体，不能挪到右列去。

## 文字压缩对照

| 位置 | 旧 | 新 |
|---|---|---|
| 赛道头部 | eyebrow + h1 + tag 三层 | 一行 h1（含内联 tag） |
| 赛道脚注 | 两行段落（56 字） | 单行（24 字以内） |
| 命中回馈 | 固定 20px 独立条 | 浮在赛道底部，无独立占位 |
| 右列说明 | 「键盘已接管」+ 两段说明 | 删；仅在非 running 时保留一句 |
