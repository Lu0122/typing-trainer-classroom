// 字练场 · 一键更新器（随运行包分发，文件名 update.cjs，用包内 runtime/node.exe 执行）
//
// 只更新「代码」三件：public/、backend/server.js、launcher.cjs。
// 绝不动 data/（学生成绩）、.env（后台密码）、runtime/、node_modules/、licenses/。
//
// 用法：
//   update.cjs              检查并更新
//   update.cjs --check      只看有没有新版，不改文件
//   update.cjs --rollback   回退到上一个备份
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

const root = __dirname;
const REPO = process.env.TYPING_UPDATE_REPO || 'Lu0122/typing-trainer-classroom';
const BRANCH = process.env.TYPING_UPDATE_BRANCH || 'release';
// 国内访问 GitHub 慢的时候，可以把 TYPING_UPDATE_URL 指到镜像（目录结构要和 release 分支一致）。
const RAW = (process.env.TYPING_UPDATE_URL || `https://raw.githubusercontent.com/${REPO}/${BRANCH}`).replace(/\/+$/, '');
const BACKUP_DIR = path.join(root, 'backup');
const LOCK = path.join(root, 'data', 'launcher.json');
// 允许被更新覆盖的路径前缀；其余一律拒绝，防止清单被改坏时误删数据。
const MANAGED_PREFIXES = ['public/', 'backend/server.js', 'launcher.cjs', 'version.json'];
const args = new Set(process.argv.slice(2));

function log(message) { console.log(message); }
function fail(message) { console.error(`\n✗ ${message}`); process.exit(1); }
function sha256(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function readJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function isManaged(relative) {
  const normalized = relative.replaceAll('\\', '/');
  return MANAGED_PREFIXES.some((prefix) => prefix.endsWith('/') ? normalized.startsWith(prefix) : normalized === prefix);
}

async function fetchJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20000), headers: { 'Cache-Control': 'no-cache' } });
  if (!response.ok) throw new Error(`读取 ${url} 失败（HTTP ${response.status}）`);
  return response.json();
}

// 逐文件下载：只拉 sha256 变过的文件，代码级更新通常 2–3MB，
// 不用为了改一行后端把 20MB 的背景图重新下一遍。
async function downloadFile(url, file) {
  const response = await fetch(url, { signal: AbortSignal.timeout(120000), redirect: 'follow' });
  if (!response.ok) throw new Error(`下载 ${url} 失败（HTTP ${response.status}）`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(await response.arrayBuffer()));
}

// 小并发跑一批下载，任何一条失败就整体失败（此时还没动任何本地文件）。
async function downloadAll(tasks, limit = 4) {
  let cursor = 0;
  let failure = null;
  const worker = async () => {
    while (cursor < tasks.length && !failure) {
      const task = tasks[cursor++];
      try { await task(); } catch (error) { failure = failure || error; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  if (failure) throw failure;
}

// 服务在跑的时候 Windows 会锁住 backend/server.js，硬覆盖必然失败，所以先确认没人在跑。
function runningService() {
  if (!fs.existsSync(LOCK)) return null;
  const record = readJson(LOCK, null);
  if (!record?.pid) return null;
  try {
    process.kill(record.pid, 0); // 只探测存活，不发信号
    return record;
  } catch {
    return null; // 进程已退出，锁文件是残留
  }
}

async function healthOk(port) {
  if (!port) return false;
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1500) });
    return response.ok;
  } catch { return false; }
}

function copyInto(source, relative, backupDir) {
  const target = path.join(root, relative);
  const existed = fs.existsSync(target);
  if (existed && backupDir) {
    const mirror = path.join(backupDir, relative);
    fs.mkdirSync(path.dirname(mirror), { recursive: true });
    fs.copyFileSync(target, mirror);
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  return existed;
}


// 上一版有、这一版没有的文件（主要是每次构建换名字的哈希资源），更新时删掉。
function pruneTargets(localFiles, keepSet) {
  return localFiles
    .map((file) => file.path)
    .filter((relative) => !keepSet.has(relative) && isManaged(relative) && fs.existsSync(path.join(root, relative)));
}

async function update({ checkOnly }) {
  log('字练场 · 检查更新');
  log(`  更新源：${RAW}`);

  const running = runningService();
  if (running) {
    const alive = (await healthOk(running.port)) || !running.port;
    if (alive) {
      fail(`字练场正在运行（端口 ${running.port || '启动中'}）。\n  请先关掉「启动字练场」的黑色窗口，再双击本文件。`);
    }
  }

  let remote;
  try {
    remote = await fetchJson(`${RAW}/version.json`);
  } catch (error) {
    fail(`连不上更新源，请检查网络。\n  ${error.message}`);
  }
  if (!Array.isArray(remote?.files) || !remote.files.length) fail('更新包清单不完整，已停止（未改动任何文件）。');
  // 数据库、配置、运行时是老师机的家底，清单里出现这些路径一律中止，下载都还没开始。
  const forbidden = remote.files.find((file) => !isManaged(file.path));
  if (forbidden) fail(`更新包试图覆盖受保护的路径：${forbidden.path}\n  已中止，未改动任何文件。`);

  const local = readJson(path.join(root, 'version.json'), null);
  log(`  当前版本：${local?.version || '未知'}${local?.builtAt ? `（${local.builtAt}）` : ''}`);
  log(`  最新版本：${remote.version}（${remote.builtAt || '未标注'}）`);

  // 按文件内容判断，而不是只看版本号：重新打包后 builtAt 会比已发布的还新，
  // 只比版本号会出现「刚装完就提示有更新」。
  const localHashes = new Map((local?.files || []).map((file) => [file.path, file.sha256]));
  const changed = remote.files.filter((file) => localHashes.get(file.path) !== file.sha256);
  const keep = new Set(remote.files.map((file) => file.path));
  const stale = local?.files ? pruneTargets(local.files, keep) : [];

  if (!changed.length && !stale.length) {
    log('\n✓ 已经是最新版本，无需更新。');
    return;
  }
  if (checkOnly) {
    log(`\n有新版本可用（${changed.length} 个文件有变化）。双击「更新字练场.bat」即可更新。`);
    return;
  }
  log(`\n  需要更新 ${changed.length} 个文件${stale.length ? `，清理 ${stale.length} 个过期文件` : ''}`);

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'typing-update-'));
  try {
    // 全部下载到临时目录并逐个校验，任何一步失败都不会动本地文件。
    log('  正在下载…');
    let bytes = 0;
    await downloadAll(changed.map((file) => async () => {
      const target = path.join(temp, file.path);
      await downloadFile(`${RAW}/${file.path}`, target);
      if (file.sha256 && sha256(target) !== file.sha256) throw new Error(`文件校验失败：${file.path}`);
      bytes += fs.statSync(target).size;
    }));
    log(`  已下载 ${(bytes / 1048576).toFixed(1)} MB，校验通过`);

    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
    const backupDir = path.join(BACKUP_DIR, stamp);
    fs.mkdirSync(backupDir, { recursive: true });
    const replaced = [];
    const added = [];
    for (const file of changed) {
      const existed = copyInto(path.join(temp, file.path), file.path, backupDir);
      (existed ? replaced : added).push(file.path);
    }
    for (const relative of stale) fs.rmSync(path.join(root, relative), { force: true });

    // version.json 不在清单里（清单本身要算哈希），单独备份一次，否则回滚后版本号对不上。
    const versionFile = path.join(root, 'version.json');
    if (fs.existsSync(versionFile)) {
      fs.copyFileSync(versionFile, path.join(backupDir, 'version.json'));
      replaced.push('version.json');
    } else added.push('version.json');
    fs.writeFileSync(path.join(backupDir, 'index.json'), JSON.stringify({ stamp, version: remote.version, builtAt: remote.builtAt || null, replaced, added, removed: stale }, null, 2));
    fs.writeFileSync(versionFile, JSON.stringify(remote, null, 2));

    log(`\n✓ 更新完成：${local?.version || '未知'} → ${remote.version}`);
    log(`  备份目录：backup/${stamp}（出问题双击「回滚字练场.bat」）`);
    if (stale.length) log(`  清理了 ${stale.length} 个过期文件`);
    log('\n请重新双击「启动字练场.bat」启动服务。');
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

function rollback() {
  log('字练场 · 回滚到上一个版本');
  if (!fs.existsSync(BACKUP_DIR)) fail('没有找到任何备份目录，无法回滚。');
  const stamps = fs.readdirSync(BACKUP_DIR).filter((name) => fs.existsSync(path.join(BACKUP_DIR, name, 'index.json'))).sort();
  if (!stamps.length) fail('没有找到可用的备份记录，无法回滚。');
  const stamp = stamps.at(-1);
  const dir = path.join(BACKUP_DIR, stamp);
  const index = readJson(path.join(dir, 'index.json'), null);
  if (!index) fail(`备份记录损坏：backup/${stamp}/index.json`);

  const running = runningService();
  if (running) fail(`字练场正在运行（端口 ${running.port || '启动中'}）。\n  请先关掉「启动字练场」的黑色窗口再回滚。`);

  for (const relative of index.replaced || []) {
    const source = path.join(dir, relative);
    if (!fs.existsSync(source)) continue;
    const target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }
  // 更新时新增、更新前不存在的文件要删掉，否则会残留新版的哈希资源。
  for (const relative of index.added || []) {
    const target = path.join(root, relative);
    if (fs.existsSync(target)) fs.rmSync(target, { force: true });
  }
  fs.rmSync(dir, { recursive: true, force: true });

  log(`\n✓ 已回滚到备份 ${stamp} 之前的版本。`);
  log('请重新双击「启动字练场.bat」启动服务。');
}

(async () => {
  try {
    if (args.has('--rollback')) rollback();
    else await update({ checkOnly: args.has('--check') });
  } catch (error) {
    fail(error?.message || String(error));
  }
})();
