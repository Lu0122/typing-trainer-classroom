# 应用更新机制

开源之后，运行包可以自己从 GitHub 拉新版，不需要重新发 44MB 的整包。
老师双击 `更新字练场.bat` 就完成更新；出问题双击 `回滚字练场.bat` 退回上一版。

## 通道：`release` 分支

仓库里有一个专用的 `release` 分支，只放构建产物：

```
version.json          # 版本号、构建时间、每个文件的 sha256
public/               # 前端构建产物 + 后台页面 + vendor
backend/server.js     # esbuild 打包后的后端（better-sqlite3 走 external）
launcher.cjs          # 启动器
```

更新源（无需鉴权，公开仓库即可）：

```
https://raw.githubusercontent.com/Lu0122/typing-trainer-classroom/release/version.json
https://raw.githubusercontent.com/Lu0122/typing-trainer-classroom/release/<路径>
```

**为什么不用 GitHub Releases**：这台开发机没有 `gh` CLI，每次发版要手动上传整包；
走 git 分支用现有 `git push` 就能发布。以后装了 `gh` 也可以改成 Releases，
更新器只依赖 `version.json` + 单文件 URL 两件事。

**每次发布是一个全新的孤儿提交 + 强制推送**：产物里有 20MB 背景图，
留着历史会让仓库无限膨胀。`release` 分支永远只有一个提交。

## 发布新版本

```bash
# 1. 改 package.json 的 version（更新器靠它和 builtAt 判断新旧）
# 2. 构建并推送
npm run publish:update

# 只看构建结果、不推送（产物留在 output/update-payload，方便本地验证）
npm run publish:update -- --dry-run
```

## 客户端更新逻辑（`scripts/update-runtime.cjs`，包内文件名 `update.cjs`）

1. 读 `data/launcher.json` 拿 pid/端口，探测服务是否在跑；**在跑就退出**，提示先关窗口。
2. 拉远端 `version.json`，跟本地 `version.json` 比对 `builtAt`。
3. **逐文件比对 sha256，只下载变化的文件**（代码级更新通常 1 个后端文件 1.6MB）。
   背景图这类不变的大文件不会重复下载。
4. 全部下载到临时目录并逐个校验 sha256；**任何一步失败都不动本地文件**。
5. 备份将被替换的文件到 `backup/<时间戳>/`，写入 `index.json`（记录 replaced / added / removed）。
6. 覆盖 `public/`、`backend/server.js`、`launcher.cjs`，删除上一版有、这一版没有的文件
   （主要是每次构建换名字的哈希资源），最后写 `version.json`。

`--rollback` 读取最近一次备份：还原 `replaced` 里的文件，删除 `added` 里新增的文件，然后删掉该备份目录。

**绝不触碰**：`data/`、`.env`、`.env.example`、`runtime/`、`node_modules/`、`licenses/`。
清单里出现这些路径会直接中止（`MANAGED_PREFIXES` 白名单）。

## 数据库安全（教师机已经在用的库）

更新只换代码，`data/typing.db` 一个字节都不动。**结构变更也不会覆盖数据**：

1. **迁移只做加法**。`backend/database.js` 里全部是 `CREATE TABLE IF NOT EXISTS` 和
   带 `table_info` 判空的 `ALTER TABLE ... ADD COLUMN`，没有 `DROP TABLE` / `DROP COLUMN`。
   新字段都带默认值，老数据保持原样。
2. **升级前自动备份**。`createDatabase()` 打开已有库时会比较 `PRAGMA user_version`，
   落后就先 `VACUUM INTO data/backup/typing-v<旧版本>-<时间戳>.db` 再做迁移。
   - 用 `VACUUM INTO` 而不是复制文件：WAL 模式下直接拷 `.db` 会漏掉还没合并的写入。
   - 备份失败就**中止升级并报错**，不会冒险改结构。
   - 只保留最近 5 份，避免占满磁盘。
   - 全新库（还没有 `users` 表）没有数据可丢，不产生备份。
3. **升级版本号**。每次改结构把 `SCHEMA_VERSION` +1，迁移完写回 `user_version`，下次不会重复备份。

老师机上的恢复方式：停掉服务，把 `data/backup/` 里对应的 `.db` 改名成 `typing.db`
（同时删掉同目录的 `typing.db-wal` / `typing.db-shm`），再启动即可。

## 版本号从哪来

- `package.json` 的 `version` 决定 `version.json.version`；
- `builtAt` 是构建时间，更新器主要靠它判断「是否有新版」；
- 后端 `/api/health` 会返回当前运行的 `version`（运行包读 `version.json`，开发环境退回 `package.json`）。

## 验收记录

本地用「模拟旧包 → 真实 GitHub 更新」跑过完整链路：

| 检查 | 结果 |
|---|---|
| 只下载变化文件 | 1 个文件 / 1.6MB（整包 21.6MB） |
| 耗时 | 2.3 秒（本机网络） |
| sha256 校验 | 通过 |
| 备份生成 + 回滚还原 | 通过 |
| `.env` / `runtime/` 未被改动 | 通过 |
| 二次检查 | 「已经是最新版本」 |
| 断网 | 提示「连不上更新源」并退出，不改文件 |

脚本：

```bash
npm run publish:update -- --dry-run   # 先把产物构建到 output/update-payload
node scripts/verify-update-local.mjs  # 本地模拟更新源，验证更新 + 回滚
node scripts/verify-update-github.mjs # 走真实 GitHub 地址验证
```

> 这两个脚本不能叫 `test-*.mjs`，否则会被 `node --test` 当成测试文件收集。

## 已知边界

- **服务必须停着才能更新**。Windows 会锁住正在运行的 `backend/server.js`，没有热替换。
- 只更新代码，不更新 `runtime/node.exe` 和 `node_modules/`。如果将来新增了原生依赖，
  仍然要重新发整包。
- 老师机需要能访问 `raw.githubusercontent.com`。国内网络不通时用 `TYPING_UPDATE_URL` 指到镜像。
- 学生端不用更新：他们只是浏览器访问，刷新即生效。
