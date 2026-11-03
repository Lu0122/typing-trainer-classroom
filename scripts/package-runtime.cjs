const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { buildPayload } = require('./lib/build-payload.cjs');

const root = path.resolve(__dirname, '..');
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
const release = path.join(root, 'output', 'packages', `字练场-Windows-x64-${stamp}`);
const archive = `${release}.zip`;

function copy(source, destination, filter = () => true) {
  const info = fs.statSync(source);
  if (!filter(source, info)) return;
  if (info.isDirectory()) {
    fs.mkdirSync(destination, { recursive: true });
    for (const name of fs.readdirSync(source)) copy(path.join(source, name), path.join(destination, name), filter);
  } else { fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.copyFileSync(source, destination); }
}
function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', windowsHide: true, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${path.basename(command)} failed (${result.status})`);
}
function packageRoot(name) { return path.join(root, 'node_modules', ...name.split('/')); }

async function main() {
  if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('请在 Windows x64 上制作此运行包，以匹配 SQLite 原生模块。');
  if (!fs.existsSync(path.join(root, '.env'))) throw new Error('缺少 .env。');
  if (fs.existsSync(release) || fs.existsSync(archive)) throw new Error('输出目录已存在，请稍后重新打包。');
  // Verify the native module against the exact Node executable shipped below.
  const Database = require('better-sqlite3'); const db = new Database(':memory:'); db.close();
  fs.mkdirSync(release, { recursive: true });
  // 构建 public/ + backend/server.js + launcher.cjs，与发布更新包共用同一套逻辑。
  const { server, launcher } = await buildPayload(release);
  // Only these modules are required at runtime after bundling the server.
  for (const name of ['bindings', 'file-uri-to-path']) {
    const directory = packageRoot(name);
    const entry = require.resolve(name);
    copy(entry, path.join(release, 'node_modules', name, path.relative(directory, entry)));
    copy(path.join(directory, 'package.json'), path.join(release, 'node_modules', name, 'package.json'));
  }
  const sqlite = path.join(release, 'node_modules', 'better-sqlite3');
  copy(path.join(packageRoot('better-sqlite3'), 'lib'), path.join(sqlite, 'lib'));
  for (const name of ['package.json', 'LICENSE']) copy(path.join(packageRoot('better-sqlite3'), name), path.join(sqlite, name));
  copy(path.join(packageRoot('better-sqlite3'), 'build', 'Release', 'better_sqlite3.node'), path.join(sqlite, 'build', 'Release', 'better_sqlite3.node'));
  copy(path.join(packageRoot('lucide'), 'dist', 'umd', 'lucide.js'), path.join(release, 'node_modules', 'lucide', 'dist', 'umd', 'lucide.js'));
  copy(process.execPath, path.join(release, 'runtime', 'node.exe'));
  copy(path.join(path.dirname(process.execPath), 'LICENSE'), path.join(release, 'licenses', 'Node-LICENSE.txt'));
  copy(path.join(root, '.env'), path.join(release, '.env'));
  copy(path.join(root, '.env.example'), path.join(release, '.env.example'));
  fs.writeFileSync(path.join(release, '启动字练场.bat'), '@echo off\r\nchcp 65001 >nul\r\ncd /d "%~dp0"\r\n"%~dp0runtime\\node.exe" "%~dp0launcher.cjs" %*\r\nif errorlevel 1 pause\r\n');
  // 一键更新 / 回滚：都用包内自带的 node 跑 update.cjs，不依赖系统环境。
  fs.writeFileSync(path.join(release, '更新字练场.bat'), '@echo off\r\nchcp 65001 >nul\r\ncd /d "%~dp0"\r\n"%~dp0runtime\\node.exe" "%~dp0update.cjs" %*\r\npause\r\n');
  fs.writeFileSync(path.join(release, '回滚字练场.bat'), '@echo off\r\nchcp 65001 >nul\r\ncd /d "%~dp0"\r\n"%~dp0runtime\\node.exe" "%~dp0update.cjs" --rollback\r\npause\r\n');
  copy(path.join(root, 'scripts', 'update-runtime.cjs'), path.join(release, 'update.cjs'));
  copy(path.join(root, 'docs', 'WINDOWS-RUNTIME.md'), path.join(release, '使用说明.md'));

  // version.json 只描述「可被更新覆盖的代码文件」，供更新器比对与校验。
  const payloadFiles = walk(path.join(release, 'public')).map((file) => `public/${path.relative(path.join(release, 'public'), file).replaceAll('\\', '/')}`)
    .concat(['backend/server.js', 'launcher.cjs']);
  fs.writeFileSync(path.join(release, 'version.json'), JSON.stringify({
    version: JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version,
    builtAt: new Date().toISOString(),
    files: payloadFiles.sort().map((relative) => {
      const file = path.join(release, relative);
      return { path: relative, size: fs.statSync(file).size, sha256: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') };
    })
  }, null, 2));

  const names = new Set(['better-sqlite3', 'bindings', 'file-uri-to-path', 'lucide', 'echarts', 'zrender', 'tslib',
    'vue', '@vue/shared', '@vue/reactivity', '@vue/runtime-core', '@vue/runtime-dom', 'three', 'lucide-vue-next']);
  for (const input of [...Object.keys(server.metafile.inputs), ...Object.keys(launcher.metafile.inputs)]) {
    const match = input.replaceAll('\\', '/').match(/(?:^|\/)node_modules\/((?:@[^/]+\/)?[^/]+)/);
    if (match) names.add(match[1]);
  }
  const notices = [];
  for (const name of [...names].sort()) {
    const directory = packageRoot(name);
    const metadata = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'));
    notices.push(`${name} ${metadata.version} (${metadata.license || 'see license'})`);
    for (const file of fs.readdirSync(directory).filter(file => /^(?:licen[cs]e|copying|notice)(?:\.|$)/i.test(file))) {
      if (fs.statSync(path.join(directory, file)).isFile()) copy(path.join(directory, file), path.join(release, 'licenses', name.replaceAll('/', '_'), file));
    }
  }
  fs.writeFileSync(path.join(release, 'licenses', 'THIRD-PARTY.txt'), notices.join('\n') + '\n');
  const files = walk(release).map(file => ({ path: path.relative(release, file).replaceAll('\\', '/'), size: fs.statSync(file).size, sha256: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') }));
  if (files.some(file => /^(?:data|frontend|test|\.git)\//.test(file.path))) throw new Error('运行包包含不应携带的数据或开发文件。');
  const manifest = { node: process.version, abi: process.versions.modules, platform: 'win32-x64', files };
  fs.writeFileSync(path.join(release, 'release-manifest.json'), JSON.stringify(manifest, null, 2));
  // PowerShell only supplies ZIP compression; users do not need PowerShell scripts to run the app.
  const command = "Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::CreateFromDirectory($env:TYPING_RELEASE_DIR,$env:TYPING_RELEASE_ZIP,[IO.Compression.CompressionLevel]::Optimal,$false)";
  run('powershell.exe', ['-NoProfile', '-Command', command], { env: { ...process.env, TYPING_RELEASE_DIR: release, TYPING_RELEASE_ZIP: archive } });
  console.log(JSON.stringify({ directory: release, zip: archive, files: files.length, unpackedMB: +(files.reduce((sum, file) => sum + file.size, 0) / 1048576).toFixed(1), zipMB: +(fs.statSync(archive).size / 1048576).toFixed(1) }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
