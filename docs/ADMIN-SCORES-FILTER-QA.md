# 竞速成绩「按班级筛选 + 班级列 + 筛选 label」QA

改动目标：
1. 竞速成绩页可以按班级筛选（列表和导出都生效）；
2. 成绩列表多一列「班级」；
3. 列表页的搜索框/下拉都带上 label 说明，搜索框不再拉满整行。

## 涉及文件

| 文件 | 改动 |
|---|---|
| `backend/app.js` | `/api/admin/scores` 与 `/api/admin/scores/export` 新增 `classId` 筛选 |
| `public/admin.html` | 26 处筛选控件包进 `.filter-field` + `.filter-label`；成绩页新增 `#score-class-filter`；成绩表头新增「班级」列；导出按钮 title 同步 |
| `public/admin.css` | `.filter-field` / `.filter-label` 样式；搜索框桌面端限宽 260px；工具栏不再被 flex 压缩 |
| `public/admin.js` | `loadScoreClasses()`、`loadScores`/`exportScores` 带 `classId`、表格渲染班级单元格、切页加载班级下拉、change 事件 |
| `scripts/verify-scores-class.mjs` | 端到端验收：下拉选项、请求参数、行内班级值、xlsx 内容、label 覆盖、移动端卡片 |

## 接口契约

```
GET /api/admin/scores?page=&pageSize=&q=&range=&category=&classId=
GET /api/admin/scores/export?q=&range=&category=&classId=
```

`classId` 三种取值：

| 值 | 含义 | SQL 条件 |
|---|---|---|
| 纯数字 | 该班级当前成员 | `EXISTS (SELECT 1 FROM class_members cm WHERE cm.user_id = scores.user_id AND cm.class_id = ? AND cm.left_at IS NULL)` |
| `unassigned` | 当前没有任何**有效**班级的已注册用户 | `users.id IS NOT NULL AND NOT EXISTS (… JOIN classes … classes.is_active = 1)` |
| 空 / 非法 | 不筛选 | — |

两个接口共用同一段拼条件逻辑，`params` 的 push 顺序与 `filters` 追加顺序严格一致（否则会错位）。

**`unassigned` 必须带 `classes.is_active = 1`**：列表里显示的 `className` 用的是同一口径（无有效班级才叫「未分班」）。
如果不带这个条件，一个班被停用后，学生会被「未分班」筛选排除、却在表格里显示「未分班」，自相矛盾。

**访客成绩（`user_id IS NULL`）不算未分班**，会被 `unassigned` 排除。

导出接口原本就返回 `className`，前端 xlsx 里「班级」列一直在，本次只是让它跟随筛选。

## 前端要点

- 班级下拉的选项来自 `GET /api/admin/classes?all=true`，与「学生账号」页同一个接口，选项文案 `班级名 · 学期`，另有「待分班」=`unassigned`。
- 表格行顺序：学生账号 → **班级** → 正确字数 → 正确率 → 错字 → 挑战文章 → 提交时间 → 操作。
- 移动端卡片模式的字段名取自 `<th>`，新增的「班级」列自动带上 `data-label`，无需手工维护。

## 一个集成时抓到的布局 bug（值得记）

给筛选控件加 label 后，`.table-toolbar` 的内容高度从 44px 变成 56px，但**页面仍是 68px**，输入框压到了工具栏下边框上。

原因：桌面端 `.table-section` 是 `display:flex; flex-direction:column` 的固定高度容器，`.table-toolbar` 作为子项默认 `flex-shrink: 1`，被压回 `min-height: 68px`，超出部分不撑开、直接溢出。

修法：

```css
.table-toolbar, .table-filters, .pagination, .table-empty { flex: 0 0 auto; }
.table-toolbar.is-filtered { align-items: flex-end; }
```

- 前一条保证只有 `.table-scroll` 吸收挤压；
- 后一条让按钮与输入框底边对齐（`is-filtered` 只加在「工具栏里直接放筛选字段」的 3 个页面：练习文章 / 学生账号 / 学习进步，避免用 `:has()` 影响旧版 Chrome）。

## 验收结论

```bash
BASE=http://127.0.0.1:3000 ADMIN_PASSWORD=xxx node scripts/verify-scores-class.mjs
node --test            # 248 通过 / 0 失败
```

- 班级下拉：`全部班级 / 待分班 / 25软件技术1班`
- 选班级后请求 `…&classId=1`，表格各行班级列全部为该班（distinct = 1）
- 待分班：7 行，distinct = `未分班`
- 导出 xlsx 27 行，列含「班级」，值为 `25软件技术1班` / `未分班`
- 成绩页搜索框实测宽 260px（原来拉满整行）
- 9 个列表页 label 全覆盖：`关键词 / 角色 / 状态 / 分类 / 班级 / 时间 / 学期 / 课程 / 语言 / 优先级`
- 移动端 390px：label 正常显示、卡片含「班级」字段、`scrollWidth - innerWidth = 0`
- 全流程 0 个 console error

## 使用边界

- 班级下拉包含已停用的班级（`?all=true`），选到停用班级时可能筛不到人——这是预期，避免老师以为数据丢了。
- 「未分班」不含访客成绩（没有账号的历史记录），需要看访客数据请清空班级筛选。
- label 只加在列表页筛选区；`<dialog>` 内的筛选控件（分班弹框、成员弹框）保持原样。
