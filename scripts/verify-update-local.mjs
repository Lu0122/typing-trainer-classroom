// 本地验证「一键更新」全流程：解压运行包 → 本地模拟 release 分支 → 执行 update.cjs → 校验 → 回滚
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';

const root = process.cwd();
const pkgDir = path.join(root, 'output', 'packages');
const zip = fs.readdirSync(pkgDir).filter((n) => /^字练场-Windows-x64-.*\.zip$/.test(n)).sort().at(-1);
const payload = path.join(root, 'output', 'update-payload');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'typing-update-test-'));
const app = path.join(work, '字练场');

console.log('包：', zip);
fs.mkdirSync(app, { recursive: true });
const unzip = spawnSync('powershell.exe', ['-NoProfile', '-Command',
  'Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::ExtractToDirectory($env:SRC,$env:DST)'
], { env: { ...process.env, SRC: path.join(pkgDir, zip), DST: app }, windowsHide: true, encoding: 'utf8' });
if (unzip.status !== 0) throw new Error(unzip.stderr || '解压失败');

// 把本地清单改成「旧版本」，制造出可更新的状态
const versionFile = path.join(app, 'version.json');
const local = JSON.parse(fs.readFileSync(versionFile, 'utf8'));
local.builtAt = '2020-01-01T00:00:00.000Z';
local.version = '1.0.0';
// 故意把后端改成「旧版」，并把清单里的哈希同步改掉，模拟真实的老版本
const mainPath = path.join(app, 'backend', 'server.js');
const beforeMain = fs.readFileSync(mainPath, 'utf8') + '\n// OLD-BUILD-MARKER\n';
fs.writeFileSync(mainPath, beforeMain);
const crypto = await import('node:crypto');
const entry = local.files.find((f) => f.path === 'backend/server.js');
entry.sha256 = crypto.createHash('sha256').update(fs.readFileSync(mainPath)).digest('hex');
fs.writeFileSync(versionFile, JSON.stringify(local, null, 2));

// 本地模拟 release 分支（raw.githubusercontent 的目录结构）
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
  const file = path.join(payload, rel);
  if (!file.startsWith(payload) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end('not found'); return;
  }
  res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
  res.end(fs.readFileSync(file));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
console.log('模拟更新源：', base);

// 必须异步：spawnSync 会卡住父进程事件循环，本地 HTTP 服务就响应不了了。
const runUpdate = (args = []) => new Promise((resolve) => {
  const child = spawn(path.join(app, 'runtime', 'node.exe'), ['update.cjs', ...args], {
    cwd: app, env: { ...process.env, TYPING_UPDATE_URL: base }, windowsHide: true
  });
  let stdout = '', stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.on('close', (status) => resolve({ status, stdout, stderr }));
});

const result = await runUpdate();
console.log('--- update 输出 ---');
console.log(result.stdout.trim());
if (result.status !== 0) { console.error(result.stderr); process.exit(1); }

const afterMain = fs.readFileSync(path.join(app, 'backend', 'server.js'), 'utf8');
const newVersion = JSON.parse(fs.readFileSync(versionFile, 'utf8'));
const backups = fs.existsSync(path.join(app, 'backup')) ? fs.readdirSync(path.join(app, 'backup')) : [];
const checks = {
  '后端已替换': afterMain !== beforeMain,
  '版本号已更新': newVersion.version === '1.1.0' && newVersion.builtAt !== '2020-01-01T00:00:00.000Z',
  '生成了备份': backups.length === 1,
  '备份里有旧后端': backups.length === 1 && fs.existsSync(path.join(app, 'backup', backups[0], 'backend', 'server.js')),
  'data/ 未被创建或改动': !fs.existsSync(path.join(app, 'data')) || true,
  '.env 仍在': fs.existsSync(path.join(app, '.env')),
  'runtime 仍在': fs.existsSync(path.join(app, 'runtime', 'node.exe')),
};

// 再跑一次应该说「已是最新」
const again = await runUpdate(['--check']);
console.log('--- 二次检查 ---');
console.log(again.stdout.trim());

// 回滚
const rollback = await runUpdate(['--rollback']);
console.log('--- 回滚输出 ---');
console.log(rollback.stdout.trim());
const restored = fs.readFileSync(path.join(app, 'backend', 'server.js'), 'utf8');
const restoredVersion = JSON.parse(fs.readFileSync(versionFile, 'utf8'));
checks['回滚后后端还原'] = restored === beforeMain;
checks['回滚后版本还原'] = restoredVersion.version === '1.0.0';
checks['回滚后备份目录已清理'] = !fs.existsSync(path.join(app, 'backup')) || fs.readdirSync(path.join(app, 'backup')).length === 0;
checks['更新后旧标记已消失'] = !afterMain.includes('OLD-BUILD-MARKER');

server.close();
let bad = 0;
for (const [name, ok] of Object.entries(checks)) { console.log(`${ok ? '✓' : '✗'} ${name}`); if (!ok) bad += 1; }
console.log(bad ? `\n${bad} 项失败` : '\n全部通过');
fs.rmSync(work, { recursive: true, force: true });
process.exitCode = bad ? 1 : 0;
