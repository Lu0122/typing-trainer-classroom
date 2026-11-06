// 构建「可运行产物」：public/ + backend/server.js + launcher.cjs。
// 打包（package-runtime）和发更新（publish-update）都走这里，避免两条路径各写一份、将来跑偏。
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..', '..');
// 构建产物里的哈希文件（assets/main-xxxxxxxx.js 之类）；每次构建都会变，不能当稳定资源拷。
const generatedAsset = /-[A-Za-z0-9_-]{8}\.(?:js|css)(?:\.map)?$/;

function copy(source, destination, filter = () => true) {
  const info = fs.statSync(source);
  if (!filter(source, info)) return;
  if (info.isDirectory()) {
    fs.mkdirSync(destination, { recursive: true });
    for (const name of fs.readdirSync(source)) copy(path.join(source, name), path.join(destination, name), filter);
  } else {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', windowsHide: true, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${path.basename(command)} failed (${result.status})`);
}

/**
 * 在 target 目录下生成 public/、backend/server.js、launcher.cjs。
 * @param {string} target 目标目录（会被创建，public/ 会被清空重建）
 * @returns {Promise<{server: import('esbuild').BuildResult, launcher: import('esbuild').BuildResult}>}
 */
async function buildPayload(target) {
  fs.mkdirSync(target, { recursive: true });
  const publicPath = path.join(target, 'public');
  const viteCli = path.join(path.dirname(require.resolve('vite/package.json')), 'bin', 'vite.js');
  run(process.execPath, [viteCli, 'build', '--config', path.join(root, 'vite.config.js'), '--outDir', publicPath, '--emptyOutDir', '--manifest']);

  // 稳定资源（后台页面、vendor、图标等）从仓库 public/ 拷过来，历史哈希文件一律不拷。
  copy(path.join(root, 'public'), publicPath, (file, info) => {
    const relative = path.relative(path.join(root, 'public'), file).replaceAll('\\', '/');
    if (info.isDirectory()) return !['.vite', '.playwright-cli'].includes(path.basename(file));
    return !['index.html', 'board.html', 'admin-next.html'].includes(relative) && !generatedAsset.test(path.basename(file)) && !/\.(?:log|map)$/i.test(file);
  });

  const server = await esbuild.build({
    entryPoints: [path.join(root, 'backend', 'server.js')],
    outfile: path.join(target, 'backend', 'server.js'),
    bundle: true, platform: 'node', target: 'node20',
    external: ['better-sqlite3'], minify: true, metafile: true, legalComments: 'eof'
  });
  const launcher = await esbuild.build({
    entryPoints: [path.join(root, 'scripts', 'runtime-launcher.cjs')],
    outfile: path.join(target, 'launcher.cjs'),
    bundle: true, platform: 'node', target: 'node20',
    external: ['./backend/server.js'], minify: true, metafile: true, legalComments: 'eof'
  });
  return { server, launcher };
}

module.exports = { buildPayload, copy, root, generatedAsset };
