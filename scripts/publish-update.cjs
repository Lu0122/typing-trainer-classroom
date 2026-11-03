// 发布代码更新包到 `release` 分支（不需要 gh CLI，走 git 推送）。
// 用法：npm run publish:update            构建并推送
//       npm run publish:update -- --dry-run 只构建到 output/update-payload，便于本地验证
//
// release 分支里只有 public/、backend/server.js、launcher.cjs、version.json。
// 每次发布都是**一个全新提交 + 强制推送**：这些产物里含 20MB 背景图，留着历史会让仓库无限膨胀。
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { buildPayload, copy, root } = require('./lib/build-payload.cjs');

const REPO_URL = process.env.TYPING_UPDATE_REMOTE || 'https://github.com/Lu0122/typing-trainer-classroom.git';
const BRANCH = 'release';
const payloadDir = path.join(root, 'output', 'update-payload');
const repoDir = path.join(root, 'output', 'update-repo');

function git(args, cwd, { allowFail = false } = {}) {
  const result = spawnSync('git', args, { cwd, windowsHide: true, encoding: 'utf8' });
  if (result.status !== 0 && !allowFail) throw new Error(`git ${args.join(' ')} 失败：\n${result.stderr || result.stdout}`);
  return result;
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}

async function main() {
  const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  fs.rmSync(payloadDir, { recursive: true, force: true });
  fs.mkdirSync(payloadDir, { recursive: true });

  console.log(`构建 v${version} 更新包…`);
  await buildPayload(payloadDir);

  // version.json 描述「可被覆盖的代码文件」，更新器拿它比对版本 + 逐文件校验。
  const payloadFiles = walk(path.join(payloadDir, 'public'))
    .map((file) => `public/${path.relative(path.join(payloadDir, 'public'), file).replaceAll('\\', '/')}`)
    .concat(['backend/server.js', 'launcher.cjs'])
    .sort();
  const manifest = {
    version,
    builtAt: new Date().toISOString(),
    files: payloadFiles.map((relative) => {
      const file = path.join(payloadDir, relative);
      return { path: relative, size: fs.statSync(file).size, sha256: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') };
    })
  };
  fs.writeFileSync(path.join(payloadDir, 'version.json'), JSON.stringify(manifest, null, 2));
  const totalMb = (payloadFiles.reduce((sum, relative) => sum + fs.statSync(path.join(payloadDir, relative)).size, 0) / 1048576).toFixed(1);
  console.log(`  ${payloadFiles.length} 个文件，共 ${totalMb} MB（更新时只下 sha256 变过的）`);

  if (process.argv.includes('--dry-run')) {
    console.log('\n✓ 已构建到 output/update-payload（未推送）');
    return;
  }

  // 每次都是一个全新的孤儿提交，历史里不留旧产物。
  fs.rmSync(repoDir, { recursive: true, force: true });
  fs.mkdirSync(repoDir, { recursive: true });
  git(['init', '--quiet'], repoDir);
  git(['symbolic-ref', 'HEAD', `refs/heads/${BRANCH}`], repoDir);
  git(['remote', 'add', 'origin', REPO_URL], repoDir);
  copy(payloadDir, repoDir);

  const name = git(['config', 'user.name'], root, { allowFail: true }).stdout.trim() || 'lulu';
  const email = git(['config', 'user.email'], root, { allowFail: true }).stdout.trim() || 'lulu@users.noreply.github.com';
  git(['add', '-A'], repoDir);
  git(['-c', `user.name=${name}`, '-c', `user.email=${email}`, 'commit', '--quiet', '-m', `release: v${version} (${manifest.builtAt})`], repoDir);
  console.log(`推送到 origin/${BRANCH}…`);
  git(['push', '--force', 'origin', `HEAD:${BRANCH}`], repoDir);

  console.log(`\n✓ 已发布 v${version}`);
  console.log('  运行包双击「更新字练场.bat」即可拉到这一版');
  console.log(`  更新源：https://raw.githubusercontent.com/Lu0122/typing-trainer-classroom/${BRANCH}/version.json`);
}

main()
  .catch((error) => { console.error(`\n✗ ${error.message}`); process.exitCode = 1; })
  .finally(() => {
    fs.rmSync(repoDir, { recursive: true, force: true });
    if (!process.argv.includes('--dry-run')) fs.rmSync(payloadDir, { recursive: true, force: true });
  });
