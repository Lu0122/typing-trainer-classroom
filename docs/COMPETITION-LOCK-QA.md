# 比赛强制参赛与并发锁 QA

本次改动目标：老师开赛后学生**强制报名强制参赛**，单人也能开赛方便演练，
后台可**终止比赛**把学生放出来，比赛期间**其他玩法入口自动关闭**保证并发。

## 涉及文件

| 文件 | 改动 |
|---|---|
| `backend/competition-event.js` | `MIN_PLAYERS` 2 → 1；`ensureEntry()` 支持自动报名（团队赛自动分边）；`terminate()`；`hasActive()`；`POST /api/competitions/:id/terminate`；后台列表补 `capacity/playerCount/readyCount/onlineCount` |
| `backend/app.js` | 新增比赛期间的其他玩法入场拦截中间件 |
| `frontend/src/App.vue` | 轮询 `/api/competitions/available`，有检录/比赛中/暂停的赛事就强制跳 `#competition` 并锁住 `setPage` |
| `frontend/src/CompetitionGame.vue` | 删除「加入比赛」按钮与手动分边选择；补「已自动报名」与「比赛已终止 + 返回比赛项目」；列表变空时先按 id 复核真实状态再决定是否清空 |
| `public/admin.js` | 状态名补「已终止」；操作列新增「终止比赛」（二次确认）；赛事列表 2 秒刷新，新增「检录情况」列 |
| `scripts/verify-competition-lock.mjs` | 端到端验收脚本 |

## 关键机制

### 1. 强制报名

学生端不再调用 `/join`。`state(id, viewerId)` 在检录阶段会调 `ensureEntry(..., { automatic: true })`：

- 已在名单里 → 直接返回；
- 不在名单里 → 直接登记为正式选手；
- 团队赛没指定阵营 → 按「剩余名额最多」自动分边；
- **名额满了不再抛错**（自动报名路径），只是不登记，学生进入观战。

`ensureEntry` 的 `automatic` 只影响「不在检录阶段」和「名额已满」这两种情况：
自动报名安静跳过，手动 `join()` 仍然明确报错（老接口行为不变）。

### 2. 单人开赛

`MIN_PLAYERS` 从 2 改成 1，`beginRound` 的守卫变成「至少 1 名选手」。
0 人仍然拒绝——空场开赛没有意义，也会让结算逻辑没有可排名对象。
`duel`（旧 1v1）仍要求正好 2 人，这条没动。

### 3. 终止比赛

```js
terminate(id) // 状态置 terminated，同时把 countdown/running/paused/scheduled 的轮次一起置 terminated
```

- 不一起收轮次的话，学生端 `round.status` 仍是 `running`，会继续显示「比赛进行中」并往上报字。
- `available` 接口只返回 `registration/running/paused`，所以终止后学生端下一次轮询就拿不到这场赛事，
  `competitionPageLocked` 变 false，`setPage` 恢复可用。
- 前端**必须保留最后状态**：`refreshEvents` 看到列表为空时不能直接用本地 `status` 判断
  （老师刚终止时本地还停在 `registration`），要先按 `eventId` 拉一次详情，确认是 `finished/terminated` 才保留展示。

### 4. 比赛期间关闭其他玩法

`backend/app.js` 里在安装各玩法路由**之前**注册中间件，匹配到下列 POST 且存在进行中的赛事时返回 423：

```
/api/battle/join          /api/battle/competition/join
/api/boss/join
/api/arena/:mode/join     /api/arena/:mode/join-code   /api/arena/:mode/create
/api/chase/create         /api/chase/join-code
/api/runner/start
```

- 只拦「进入房间」，不影响已在对局里的读写、后台操作和比赛本身。
- 中间件注册在 `installCompetitionEvent` 之前，但用闭包变量 `competitionEvent` 延迟取到引擎实例
  （请求发生时才赋值），所以顺序不会出问题。
- `hasActive()` 只查一次 `status IN ('registration','running','paused')`，走主键外的少量数据，开销可忽略。

## 验收

```bash
# 后端
node --test                      # 288 passed
# 端到端（需要先起一个独立实例）
PORT=3100 DATABASE_PATH=./output/smoke/typing.db node backend/server.js
BASE=http://127.0.0.1:3100 node scripts/verify-competition-lock.mjs
```

端到端脚本覆盖：

| 检查 | 结果 |
|---|---|
| 学生打开首页被强制拉到 `#competition` | ✅ |
| 页面出现「已自动报名」、没有「加入比赛」按钮 | ✅ |
| 比赛期间 `POST /api/battle/join` 返回 423 | ✅ |
| 后台终止后学生端显示「比赛已终止」+「返回比赛项目」 | ✅ |
| 点返回能真的离开比赛页 | ✅ |
| 终止后 `battle/join` 不再被锁 | ✅ |
| 页面无 JS 报错 | ✅ |

单元测试新增：

- `allows a solo round so a teacher can rehearse alone`
- `still refuses to start a round with nobody enrolled`
- `entering the page enrols the student automatically`
- `terminating a competition releases students and blocks further results`
- 接口级：`a solo event can start, locks other games, and is released by terminate`

## 使用边界

- **强制参赛只在检录阶段生效**。开赛后才登录/打开页面的学生不会被塞进本场，只能观战——这是刻意的，
  否则会出现「别人已经打了一半他才开始」的不公平。要让人参赛，就重新开一场检录。
- 终止**不可恢复**，历史成绩也不会写进导出（`export.csv` 只导出 `finished` 的赛事）。
- 比赛期间被关闭的只有「进入房间」接口。学生如果**在开赛前就已经在某个游戏房间里**，
  他的轮询不会被打断，仍会占用一点并发；要彻底干净只能提前让学生退出游戏。
- 单人开赛只适合演练。正式比赛请照常在检录阶段确认人数，否则排行榜只有一个人。
