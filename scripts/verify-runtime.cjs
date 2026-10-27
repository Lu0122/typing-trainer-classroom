const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const net = require('node:net');
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const packages = path.join(root, 'output', 'packages');
const newest = () => fs.readdirSync(packages).filter(name => /^字练场-Windows-x64-.*\.zip$/.test(name)).sort().at(-1);
const archive = path.resolve(process.argv[2] || path.join(packages, newest() || 'missing.zip'));
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'typing-runtime-check-'));
const extracted = path.join(temporary, '字练场 运行验收');
const cleanEnv = { ...process.env, PATH: path.join(process.env.SystemRoot || 'C:\\Windows', 'System32'), NODE_PATH: '', NODE_OPTIONS: '' };
for (const key of ['PORT', 'HOST', 'DATABASE_PATH', 'ADMIN_PASSWORD', 'COOKIE_SECURE', 'REQUIRE_ACCOUNT_APPROVAL', 'TYPING_RUNTIME_INSTANCE']) delete cleanEnv[key];
let active;

function start(port = 0) {
  let output = '', errors = '';
  const child = spawn('cmd.exe', ['/d', '/c', '启动字练场.bat', '--no-browser', `--port=${port}`], { cwd: extracted, env: cleanEnv, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  active = child;
  const ready = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`启动超时。${errors}\n${output}`)), 20000);
    child.stdout.on('data', chunk => {
      output += chunk.toString();
      const match = output.match(/READY (http:\/\/127\.0\.0\.1:\d+)\//);
      if (match) { clearTimeout(timeout); resolve(match[1]); }
    });
    child.stderr.on('data', chunk => { errors += chunk.toString(); });
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('exit', code => { clearTimeout(timeout); reject(new Error(`服务提前退出 (${code})：${errors}\n${output}`)); });
  });
  return { child, ready };
}
async function stop(child) {
  if (child.exitCode !== null) return;
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { child.kill(); reject(new Error('服务未能正常停止')); }, 10000);
    child.once('exit', code => { clearTimeout(timeout); code === 0 ? resolve() : reject(new Error(`退出状态 ${code}`)); });
    child.stdin.write('q\n');
  });
  if (active === child) active = null;
}
async function get(base, url) {
  const response = await fetch(base + url, { signal: AbortSignal.timeout(10000) });
  assert.equal(response.status, 200, url);
  return response;
}

async function main() {
  const unzip = spawnSync('powershell.exe', ['-NoProfile', '-Command', 'Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::ExtractToDirectory($env:TYPING_CHECK_ZIP,$env:TYPING_CHECK_DIR)'], { env: { ...process.env, TYPING_CHECK_ZIP: archive, TYPING_CHECK_DIR: extracted }, windowsHide: true, encoding: 'utf8' });
  if (unzip.status !== 0) throw new Error(unzip.stderr || '解压失败');
  assert.ok(!fs.existsSync(path.join(extracted, 'data')), '压缩包不能携带学生数据');
  const manifest = JSON.parse(fs.readFileSync(path.join(extracted, 'release-manifest.json'), 'utf8'));
  for (const file of manifest.files) {
    const actual = path.resolve(extracted, file.path);
    assert.ok(actual.startsWith(extracted + path.sep));
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(actual)).digest('hex'), file.sha256, file.path);
  }
  const runtime = path.join(extracted, 'runtime', 'node.exe');
  const version = spawnSync(runtime, ['-p', 'process.version'], { cwd: extracted, env: cleanEnv, encoding: 'utf8', windowsHide: true });
  assert.equal(version.stdout.trim(), manifest.node);
  const first = start(); const base = await first.ready;
  const status = await (await get(base, '/api/health')).json();
  assert.equal(status.app, 'hanzi-sprint'); assert.ok(status.instance);
  for (const url of ['/', '/admin', '/board', '/admin.js', '/admin.css', '/vendor/lucide/lucide.js', '/vendor/echarts/echarts.min.js', '/api/passages']) await get(base, url);
  const buildManifest = JSON.parse(fs.readFileSync(path.join(extracted, 'public', '.vite', 'manifest.json'), 'utf8'));
  const assets = new Set();
  for (const entry of Object.values(buildManifest)) {
    assets.add(entry.file); for (const file of [...(entry.css || []), ...(entry.assets || [])]) assets.add(file);
  }
  for (const asset of assets) await get(base, '/' + asset);
  for (const asset of ['home-beginner.png', 'runner/jungle-valley-v2.png', 'chase/harbor-blue-hour-v2.png']) await get(base, '/assets/' + asset);
  const board = await (await get(base, '/api/battle/competition/board')).json();
  assert.equal(board.inputRules.allowMistakes, true);
  const settings = require('dotenv').parse(fs.readFileSync(path.join(extracted, '.env')));
  const admin = await fetch(base + '/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: settings.ADMIN_PASSWORD || 'admin123' }) });
  assert.equal(admin.status, 200, '运行包沿用 .env 后台密码');
  const registration = await fetch(base + '/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'runtime901', displayName: '运行包验收', password: 'Classroom123' }) });
  assert.equal(registration.status, 201);
  const duplicate = spawnSync(runtime, ['launcher.cjs', '--no-browser', '--port=0'], { cwd: extracted, env: cleanEnv, windowsHide: true, encoding: 'utf8', timeout: 10000 });
  assert.equal(duplicate.status, 0); assert.match(duplicate.stdout, /已经在运行/);
  assert.equal((await (await get(base, '/api/health')).json()).instance, status.instance);
  await stop(first.child);
  assert.ok(!fs.existsSync(path.join(extracted, 'data', 'launcher.json')), '正常停止后清除启动锁');
  const database = path.resolve(extracted, settings.DATABASE_PATH || 'data/typing.db');
  assert.ok(database.startsWith(extracted + path.sep), '默认数据应留在运行包内');
  const count = spawnSync(runtime, ['-e', "const Database=require('better-sqlite3');const db=new Database(process.argv[1]);console.log(db.prepare('SELECT COUNT(*) AS n FROM users').get().n);db.close();", database], { cwd: extracted, env: cleanEnv, encoding: 'utf8', windowsHide: true });
  assert.equal(count.status, 0, count.stderr); assert.equal(count.stdout.trim(), '1');
  // Occupy a port to prove startup selects another without touching the existing service.
  const blocker = net.createServer(); await new Promise(resolve => blocker.listen(0, '0.0.0.0', resolve));
  try {
    const blocked = blocker.address().port;
    const second = start(blocked); const nextBase = await second.ready;
    assert.notEqual(Number(new URL(nextBase).port), blocked);
    await get(nextBase, '/api/health');
    const login = await fetch(nextBase + '/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: settings.ADMIN_PASSWORD || 'admin123' }) });
    assert.equal(login.status, 200);
    await stop(second.child);
  } finally { await new Promise(resolve => blocker.close(resolve)); }
  assert.ok(fs.existsSync(path.join(extracted, 'data', 'runlogs', 'server-events.log')));
  console.log(JSON.stringify({ passed: true, zip: archive, checkedFiles: manifest.files.length, frontendAssets: assets.size, node: manifest.node, nativeDatabase: true, persistedUsers: 1, duplicateLaunch: true, portFallback: true, noSystemNodeRequired: true }, null, 2));
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (active) await stop(active).catch(() => {});
  const resolved = path.resolve(temporary);
  if (path.dirname(resolved) === path.resolve(os.tmpdir()) && path.basename(resolved).startsWith('typing-runtime-check-')) fs.rmSync(resolved, { recursive: true, force: true });
});
