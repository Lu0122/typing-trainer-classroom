// 真实链路验证：从 GitHub 的 release 分支更新（不注入任何环境变量）
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';

const root = process.cwd();
const pkgDir = path.join(root, 'output', 'packages');
const zip = fs.readdirSync(pkgDir).filter((n) => /^字练场-Windows-x64-.*\.zip$/.test(n)).sort().at(-1);
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'typing-real-update-'));
const app = path.join(work, '字练场');
fs.mkdirSync(app, { recursive: true });

// 解压用 PowerShell（与 package-runtime 一致）
const unzip = spawnSync('powershell.exe', ['-NoProfile', '-Command',
  'Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::ExtractToDirectory($env:SRC,$env:DST)'
], { env: { ...process.env, SRC: path.join(pkgDir, zip), DST: app }, windowsHide: true, encoding: 'utf8' });
if (unzip.status !== 0) throw new Error(unzip.stderr || '解压失败');

// 把本地包改成「旧版」：后端加标记 + 清单哈希同步
const mainPath = path.join(app, 'backend', 'server.js');
const before = fs.readFileSync(mainPath, 'utf8') + '\n// OLD-BUILD-MARKER\n';
fs.writeFileSync(mainPath, before);
const versionFile = path.join(app, 'version.json');
const local = JSON.parse(fs.readFileSync(versionFile, 'utf8'));
local.version = '1.0.0';
local.builtAt = '2020-01-01T00:00:00.000Z';
local.files.find((f) => f.path === 'backend/server.js').sha256 = crypto.createHash('sha256').update(fs.readFileSync(mainPath)).digest('hex');
fs.writeFileSync(versionFile, JSON.stringify(local, null, 2));

const run = (args = []) => new Promise((resolve) => {
  const child = spawn(path.join(app, 'runtime', 'node.exe'), ['update.cjs', ...args], { cwd: app, windowsHide: true });
  let out = '';
  let err = '';
  child.stdout.on('data', (c) => { out += c; });
  child.stderr.on('data', (c) => { err += c; });
  child.on('close', (status) => resolve({ status, out, err }));
});

const started = Date.now();
const result = await run();
console.log(result.out.trim());
if (result.err) console.log('stderr:', result.err.trim());
console.log(`耗时 ${((Date.now() - started) / 1000).toFixed(1)} 秒`);

const after = fs.readFileSync(mainPath, 'utf8');
const updated = JSON.parse(fs.readFileSync(versionFile, 'utf8'));
console.log(`\n版本：${updated.version}　旧标记已清除：${!after.includes('OLD-BUILD-MARKER')}　退出码：${result.status}`);
fs.rmSync(work, { recursive: true, force: true });
