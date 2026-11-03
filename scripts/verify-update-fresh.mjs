// 新包自检：刚装好的运行包对 GitHub 执行 --check，应该报「已经是最新版本」
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';

const root = process.cwd();
const pkgDir = path.join(root, 'output', 'packages');
const zip = fs.readdirSync(pkgDir).filter((n) => /^字练场-Windows-x64-.*\.zip$/.test(n)).sort().at(-1);
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'typing-fresh-check-'));
const app = path.join(work, '字练场');
fs.mkdirSync(app, { recursive: true });
const unzip = spawnSync('powershell.exe', ['-NoProfile', '-Command',
  'Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::ExtractToDirectory($env:SRC,$env:DST)'
], { env: { ...process.env, SRC: path.join(pkgDir, zip), DST: app }, windowsHide: true, encoding: 'utf8' });
if (unzip.status !== 0) throw new Error(unzip.stderr || '解压失败');

const result = await new Promise((resolve) => {
  const child = spawn(path.join(app, 'runtime', 'node.exe'), ['update.cjs', '--check'], { cwd: app, windowsHide: true });
  let out = '';
  child.stdout.on('data', (c) => { out += c; });
  child.stderr.on('data', (c) => { out += c; });
  child.on('close', (status) => resolve({ status, out }));
});
console.log(result.out.trim());
console.log(`\n判定：${/已经是最新版本/.test(result.out) ? '✓ 新包与线上一致' : '✗ 新包仍被判为可更新'}`);
fs.rmSync(work, { recursive: true, force: true });
