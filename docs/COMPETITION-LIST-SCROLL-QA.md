# 比赛页成绩列表滚动 QA

改动目标：全班四五十人时，「本场结果」和「选手排名」两个列表要能滚动查看，
不能把成绩挤在一起、也不能被屏幕底部切掉。

## 问题定位

用 40 人跑了一场实测，量出来三件事：

| 现象 | 数据 |
|---|---|
| 页面整体在往下长 | `document.scrollHeight = 960`，视口只有 `768` → 列表底部被切在屏幕外 |
| 两个列表其实已经能滚 | 结果 `scrollHeight 1151 / clientHeight 536`；榜单 `2536 / 571` |
| 但滚动条完全看不见 | `offsetWidth - clientWidth = 2`（只有 1px 边框），滑块不占位 |

第三条是关键：**Chrome 121+ 在 Windows 上默认使用覆盖式滚动条**，
静止时不显示、也不占布局空间。实测把 `scrollbar-width` 设成 `auto`、
甚至写 `::-webkit-scrollbar{width:16px}` 都没用——这是浏览器级行为，CSS 改不了。
所以老师看到的是「一坨文字挤在框里」，根本不知道还能往下翻。

## 改法

### 1. 页面锁在一屏内，只有列表滚

```css
.competition-event-page{height:100dvh;display:flex;flex-direction:column;overflow:hidden}
.competition-event-main{flex:1;min-height:0;display:flex;flex-direction:column}
.competition-event-grid{flex:1;min-height:0}      /* 去掉原来的 min-height:calc(100dvh - 195px) */
.competition-event-card,.competition-event-stage{min-height:0}
.competition-event-result{flex:1;min-height:0;overflow-y:auto}   /* 去掉 max-height:70vh */
```

`.competition-event-stage` 原来是 `flex:1` 的结果框 + 上方一堆固定块，
内容比 `min-height` 大就把整行撑高；现在整条链路每层都 `min-height:0`，网格行被视口高度约束住。

### 2. 自绘常驻滚动条

因为原生滑块不可见，加了一个 `reactive` 的滑块元素挂在滚动容器外侧的 frame 上：

```html
<div class="competition-event-result-frame">
  <div ref="resultScrollEl" class="competition-event-result" @scroll="updateResultThumb">…</div>
  <i v-if="resultThumb.visible" class="scroll-thumb" :style="…"></i>
</div>
```

- 高度 = `clientHeight / scrollHeight × clientHeight`，最小 26px；位置按滚动比例换算。
- **只有内容真的溢出才显示**（`scrollHeight > clientHeight + 2`），一个人参赛时不会多出一条没用的杠。
- 触发重算的时机：`@scroll`、`applyEvent` 后 `nextTick`、窗口 resize（`updateViewportWidth` 开头，放在
  「作答中提前 return」之前，否则打字时 resize 滑块会错位）。
- 榜单的滑块挂在 `ol` 上，卡片头部保持固定不跟着滚。

### 3. 顺带的可读性

结果列表的每一行加了 `padding:7px 4px` 和 `border-bottom:1px solid #eef4fa`，
40 行堆在一起时不再是糊成一片。

### 4. 窄屏回退

`≤900px` 时 `height:auto; min-height:100dvh; overflow:visible`，页面恢复整页滚动，
两个列表用 `max-height`（结果 56vh / 榜单 340px）自己滚——手机上锁死 100dvh 会把内容切掉。

## 验收

40 人（`roundMs=5000`）跑完整场，1366×768：

| 检查 | 结果 |
|---|---|
| 页面高度 | `768 / 768`，不再有页面滚动条 |
| 本场结果 | `clientHeight 348 / scrollHeight 1750`，内部滚动 |
| 选手排名 | `clientHeight 492 / scrollHeight 2438`，内部滚动 |
| 滑块尺寸 | 结果 69px、榜单 99px，滚动后 top 从 265→424、223→405 |
| 横向溢出 | 0 |
| 手机 390×844 | 单列、无横向溢出、页面正常滚动 |
| `node --test` | 288 passed |

截图：`output/many-players.png`（1366×768）、`output/many-mobile-390x844.png`。

## 使用边界

- 滑块是**视觉提示**，不能拖拽（`pointer-events:none`）。滚动仍然靠滚轮 / 触控板 / 键盘 / 手机滑动。
  如果以后要支持拖拽，得在 `scroll-thumb` 上接 pointer 事件并反向设置 `scrollTop`。
- 40 人时结果列表一屏约 7 行、榜单约 8 行；要一次看全只能放大窗口或投影到大屏。
- 列表内容变化后如果滑块位置看起来没更新，检查是不是有新的渲染路径绕过了 `applyEvent`。
