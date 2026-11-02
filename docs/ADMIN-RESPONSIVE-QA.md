# 管理后台响应式适配 QA

改动目标：后台在 **PC（1366 / 1440 / 1920）** 与 **移动端（360 / 390 / 414）** 上都不出现横向溢出、
文字不被压成竖排、表格字段不被裁切。

## 涉及文件

| 文件 | 改动 |
|---|---|
| `public/admin.css` | 文件末尾新增「响应式收尾」段；班级分组两栏断点从 651 提到 1700；`.student-cell` 之外新增 `.admin-account-cell` |
| `public/admin.js` | 新增 `labelTableCells()`（表头文字写进 `td[data-label]`，供移动端卡片用）；新增 `setNavOpen()`（抽屉开关 + 遮罩 + `aria-expanded`）；`switchView` 切页时收起抽屉 |
| `public/admin.html` | 新增 `#admin-nav-scrim` 遮罩层；导航加 `id="admin-nav"`；菜单按钮加 `aria-controls` / `aria-expanded` |
| `scripts/audit-admin-responsive.mjs` | 审计脚本：8 视口 × 11 页面，输出横向溢出、越界元素、表格容器/内容宽度、导航文字裁切 |
| `scripts/shot-admin-responsive.mjs` | 定点截图：抽屉展开、移动端卡片、弹框、宽屏限宽、桌面两栏 |

## 断点分工

| 断点 | 形态 |
|---|---|
| ≥1700px | 班级分组恢复左右两栏；内容限宽 1440 居中（≥1600 生效） |
| 651–1699px | 班级分组上下堆叠，**改为页面滚动**（不再一屏两栏） |
| 961–1699px | 侧栏为 244px 完整侧栏（>960） |
| 651–960px | 侧栏收成 76px 图标条 |
| ≤650px | 左侧抽屉导航 + 列表卡片化 |

## 关键机制

### 1. 移动端列表卡片化（≤650px）

表格结构不动，用 CSS 把 `table/thead/tbody/tr/td` 全改成 `display:block`，每行一张卡片：

- 字段名来自 `td[data-label]`，由 `labelTableCells()` 从 `thead th` 复制；
- 由 `MutationObserver`（`childList + subtree`）驱动，重渲染后自动补标签；
- 写入前比对 `dataset.label`，属性变更不触发 childList 观察，**不会死循环**；
- 第一格当卡片标题（隐藏字段名、加粗、虚线分隔），`.table-actions` 单独一行右对齐；
- `td:empty` 隐藏（例如本人账号没有操作按钮时不会留空行）。

只有 `.admin-view` 里的表格会被卡片化；`<dialog>` 内的表格（成员弹框、导入预览）保持原样。

### 2. 抽屉导航（≤650px）

`.admin-sidebar` 改 `translateX(-102%)` + `.is-open` 滑入；`#admin-nav-scrim` 半透明遮罩（z-index 45，
侧栏 50，移动头部 40）。点遮罩、按 Esc、切页（`switchView` 内调 `setNavOpen(false)`）都会收起。

### 3. 班级分组为什么两栏要 1700px

班级表要 ~620px 才放得下「操作」4 个图标。两栏 = 620×2 + 24 间距 + 侧栏 244 + 内边距 144 ≈ 1650px，
所以 1366 / 1440 / 1600 一律单栏；1920 有 1440 限宽，每栏 708px 刚好。

单栏时**没有**沿用「各分一半高度」的 flex：那会让班级列表只剩 100 多像素的滚动区。
改为 `#view-classes { display:block; overflow-y:auto }`，两张表按内容自然展开（分页默认 10 行，单表 ≤600px）。

### 4. 侧栏高度不足：底部入口曾经点不到（2026-11-01）

侧栏是 `position:fixed; inset:0 auto 0 0`，**默认 `overflow:visible`**，所以内容比视口高时
底部区块会直接被顶到屏幕外，既不显示也滚不到。

原尺寸下：品牌区 106 + 13 个菜单 632 + 底部区块 159 ≈ **897px**，因此
**1366×768（教室机）和 1280×720（投影）都看不到「GitHub 开源仓库 / 打开练习前台 / 退出登录」**，
1440×900 只是刚好卡在 897 ≤ 900 才显示。

修法（两段配合，缺一不可）：

```css
.admin-sidebar { overflow: hidden; }                                  /* 不许溢出到视口外 */
.admin-nav { flex: 1 1 auto; min-height: 0; overflow-y: auto; }       /* 只有菜单区滚动 */
.sidebar-bottom { flex: 0 0 auto; margin-top: 0; }                    /* 底部区块常驻 */
@media (max-height: 960px) { /* 压缩行高，让 13 个菜单 + 底部区块同时放得下 */ }
```

- **断点必须写 960 而不是 820**：1440×900 用原尺寸时菜单区差 8px，最后一个「助手审计」会被切掉半行。
- 压缩后总高约 726px，1280×720 也不用滚动。
- 只加 `overflow-y:auto` 是不够的：整条侧栏一起滚，底部入口仍要手动滚才看得见。

验收：`node scripts/verify-github-entry.mjs`（前台 6 个页面 × 4 视口 + 后台 4 视口）。
脚本用 `elementFromPoint` 判断「真的能点」，只看 `getBoundingClientRect` 会把被遮住的按钮误判为可见。

### 5. 侧栏二级菜单（2026-11-01）

13 个菜单收进 4 个可折叠分组，概览置顶不分组：

| 分组 | 二级菜单 |
|---|---|
| （置顶，不折叠） | 概览 |
| 教学管理 `teach` | 练习文章 / 教学任务 / 学习进步 |
| 赛事成绩 `match` | 比赛赛事 / 竞速成绩 |
| 账号管理 `account` | 学生账号 / 班级分组 / 后台账号 |
| AI 与系统 `system` | 管理助手 / 助手审计 / AI服务设置 / 意见反馈 |

**各组独立展开，互不影响**（老师常同时开着「教学管理 + 账号管理」）。展开状态存
`localStorage.typing-admin-nav-groups`，刷新后保持原样。切页时 `syncNavGroupForView`
只负责**把当前页所在组打开**，不会收起别的组；概览不在任何分组里，切到概览不动任何组。

实现要点：

- 折叠用 `grid-template-rows: 1fr → 0fr`，因为内容高度未知，`max-height` 只能拍一个够用的死值。
  `visibility` 要延迟 180ms 再隐藏，否则动画根本看不见；同时保证收起的分组不进 Tab 焦点。
- `admin-nav-group-body` 里必须再套一层 `.admin-nav-group-inner` 承接 `overflow:hidden`，
  否则 4 个按钮各自成为 grid 行，`0fr` 只会把第一行压扁。
- **`.admin-nav` 必须写 `align-content: start`**：它是 `flex:1` 撑满侧栏的 grid，
  默认 `stretch` 会把「概览 + 4 个组头」这 5 个自动行均摊掉剩余高度，每行被拉成大方块
  （只剩 5 行时特别明显，13 项平铺时几乎占满反而看不出来）。
- **组头高度要和二级菜单项一致**（43px / `padding:10px 12px`，紧凑档 36px / 6px）。
  组头矮一截会显得小气；字号也统一 13px，靠颜色（`#97a49d` 比项文字 `#abb5af` 暗）区分层级。
- 多组同时展开时导航区会滚动（底部入口固定不动），`.admin-nav` 常驻细滚动条（6px），
  不要只写在高度断点里。
- `≤960px` 图标条：组头 `display:none`、分组强制展开、用分隔线区分，退回扁平图标列表。
  组名放不下，硬塞只会变成省略号。

验收：`node scripts/verify-admin-nav-groups.mjs`，覆盖默认全收起、点第二组时第一组仍展开、
「班级分组」归在账号管理下且可见可点、点子项切页后两组保持展开、回概览不收组、
刷新后展开状态保持、深链 `#scores` 自动展开「赛事成绩」、以及 900×800 图标条下 13 项全可见。
四个视口两组同时展开时导航区都不需要滚动（551/551 @1366×768）。

### 6. 「学习进步」指标卡被表格挤成一条缝（2026-11-02）

现象：`#view-progress` 顶部四张指标卡（`.admin-metrics.progress-metrics`）只剩顶上一条边，
下面的筛选栏和表格把它们盖住了。

原因不是 z-index，也不是被 `overflow:hidden` 的父元素裁掉，而是 **flex 布局把它压缩了**：

- `#view-progress` 是 `display:flex; flex-direction:column; overflow:hidden` 的整页一屏容器；
- `> .table-section` 有 `flex:1 1 auto`，会吃掉全部剩余空间；
- `.admin-metrics` 是普通 flex 项，默认 `flex:0 1 auto`，**可以被压缩**；
- 关键点：`.admin-metrics` 带 `overflow:hidden`。按规范，非 `visible` 的 flex 项
  其 `min-height:auto` 会退化成 **0**，于是它能被压到只剩几像素，`article` 的 175px 被裁掉。

修法：

```css
.progress-metrics { flex: 0 0 auto; margin-bottom: 18px; }
```

概览页的 `.admin-metrics`（`#view-overview`）不在 flex 容器里，一直正常，所以只修 progress 这一处。

验收：1366×768 / 1440×900 / 1280×720 / 1024×768 / 1920×1080 五档下
指标卡都是 177px（`article` 175px）、页面 `scrollHeight - innerHeight = 0`，
表格区拿到剩余高度并内部滚动（768 高时 417px、720 高时 369px）。

## 验收方法与结论

```bash
BASE=http://127.0.0.1:3000 ADMIN_PASSWORD=xxx node scripts/audit-admin-responsive.mjs
BASE=http://127.0.0.1:3000 ADMIN_PASSWORD=xxx node scripts/shot-admin-responsive.mjs
```

- 脚本依赖 `playwright-core` + 本机 Chrome（`channel: 'chrome'`，机器上没装 headless shell）。
- 切页必须 **click 导航按钮**：后台没有 `hashchange` 监听，改 `location.hash` 不会触发 `switchView`，
  审计会全部量到 overview 页（踩过）。
- 审计结论：8 视口 × 11 页面 `document.scrollWidth - innerWidth === 0`；
  唯一「越界」元素是收起状态的抽屉（`right` 为负，属预期）。
- 移动端表格容器宽度 = 内容宽度（如 330/330），不再需要横向拖动。

## 使用边界

- 卡片模式下每屏可见行数变少（约 1.5 张卡片/屏），适合手机应急查看；批量核对仍建议用 PC。
- 抽屉导航依赖 JS：`admin.js` 未加载时（脚本报错）手机上无法切页，只剩遮罩。属可接受降级。
- 651–700px 这一小段，班级表仍会横向滚动 ~60px（侧栏 76 + 内容 540 < 620）。
- 后台列表页在 ≥651px 仍是「整页一屏、只让数据区滚动」；只有班级分组在 651–1699 例外。
