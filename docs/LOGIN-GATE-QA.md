# 前台登录门禁 QA

改动目标：首页六张卡片（新手入门 / 英文打字 / 拼音打字 / 挑战模式 / 趣味游戏 / 打字比赛）
**未登录点不进去**，点一下先弹登录框，登录成功后自动进入刚才点的那一项。

## 涉及文件

| 文件 | 改动 |
|---|---|
| `frontend/src/App.vue` | 新增 `requireLogin()` / `runAfterLogin()`；`openBeginner` / `openPractice` / `openChallengePage` 包一层；新增 `openGames` / `openCompetitionHub` 并替换卡片绑定；登录/注册成功统一走 `runAfterLogin()`；登录框引导文案改为「登录后才能进入练习和比赛」 |
| `scripts/verify-home-login-gate.mjs` | 端到端验收脚本 |
| `README.md` | 「键盘熟悉模式不要求登录」已过时，改为说明卡片必须登录 |

## 实现要点

- **`returnAfterLogin` 现在能存函数**。原来只存页面名，`setPage('beginner')` 会漏掉
  `makeBeginnerSequence()`、挑战页的状态重置等副作用；改成存动作函数，登录后原样执行。
  字符串仍然兼容（`openCompetitionLogin()` 走的就是字符串）。
- 卡片绑定统一改成 `requireLogin(...)` 包装过的入口，**页面内部的跳转（返回、下一步、导航）不受影响**，
  否则会把老师/学生正常切页也一起拦掉。
- 未登录时页面不动（hash 保持 `#home`），只弹登录框；关掉登录框也不会自动跳转。

## 验收

```bash
PORT=3100 DATABASE_PATH=./output/smoke/typing.db node backend/server.js
BASE=http://127.0.0.1:3100 node scripts/verify-home-login-gate.mjs
```

| 检查 | 结果 |
|---|---|
| 未登录点「新手入门」弹出登录框、hash 仍为 `#home` | ✅ |
| 登录成功后自动进入 `#beginner` | ✅ |
| 已登录点「挑战模式」直接进入、不再弹框 | ✅ |
| 退出登录后点「趣味游戏」重新被拦 | ✅ |
| 页面无 JS 报错 | ✅ |

## 使用边界

- 拦的是**首页卡片**。已经登录的学生在页面内部的跳转不受影响。
- 老师账号不受影响：后台是独立页面（`/admin`），不走前台的卡片门禁。
- 大屏 `/board` 仍然免登录只读，投影机不用登录。
- 验收脚本里改 `location.hash` **不会**让前台切页（只在挂载时读 hash），
  必须 `page.reload()`；同源同路径的 `goto` 只改 hash 时也不会重新加载。
