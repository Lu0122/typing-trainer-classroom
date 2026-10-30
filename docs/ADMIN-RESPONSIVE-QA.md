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
