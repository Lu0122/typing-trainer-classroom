// Bundled into the portable release; the release root is always __dirname.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const net = require('node:net');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
require('dotenv').config({ path: path.join(__dirname, '.env') });
process.chdir(__dirname);

const noBrowser = process.argv.includes('--no-browser');
const instance = crypto.randomUUID();
const lockPath = path.join(__dirname, 'data', 'launcher.json');
const portArgument = process.argv.find(arg => arg.startsWith('--port='));
const requestedPort = Number(portArgument ? portArgument.slice(7) : process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0';
let ownsLock = false;

function health(port) {
  return new Promise(resolve => {
    const request = http.get({ hostname: '127.0.0.1', port, path: '/api/health', timeout: 800 }, response => {
      let body = '';
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve(null); } });
    });
    request.on('timeout', () => request.destroy());
    request.on('error', () => resolve(null));
  });
}

function openBrowser(port) {
  if (noBrowser) return;
  // 老师开机第一件事是管后台，所以默认打开 /admin，不是学生首页。
  execFile('cmd.exe', ['/d', '/s', '/c', `start "" "http://127.0.0.1:${port}/admin"`], { windowsHide: true }, error => {
    if (error) console.log(`请手动打开 http://127.0.0.1:${port}/admin`);
  });
}

function alive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; }
}

function freePort(first) {
  return new Promise((resolve, reject) => {
    const tryPort = port => {
      const probe = net.createServer();
      probe.once('error', error => {
        if (error.code === 'EADDRINUSE' && first !== 0 && port < Math.min(first + 20, 65535)) tryPort(port + 1);
        else reject(error);
      });
      probe.listen(port, host, () => {
        const selected = probe.address().port;
        probe.close(() => resolve(selected));
      });
    };
    tryPort(first);
  });
}

async function main() {
  if (!Number.isInteger(requestedPort) || requestedPort < 0 || requestedPort > 65535) throw new Error('PORT 应为 1—65535 之间的数字。');
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  if (fs.existsSync(lockPath)) {
    let previous;
    try { previous = JSON.parse(fs.readFileSync(lockPath, 'utf8')); } catch { throw new Error('启动记录损坏，请确认没有服务窗口后删除 data/launcher.json。'); }
    if (alive(previous.pid)) {
      const status = previous.port && await health(previous.port);
      if (status?.instance === previous.instance) {
        console.log(`字练场已经在运行：http://127.0.0.1:${previous.port}/admin`);
        openBrowser(previous.port);
      } else console.log('这个运行包的服务正在启动或尚未退出，请查看原服务窗口。');
      return;
    }
    fs.unlinkSync(lockPath);
  }
  const record = { pid: process.pid, instance, port: 0 };
  try { fs.writeFileSync(lockPath, JSON.stringify(record), { flag: 'wx' }); }
  catch (error) { if (error.code === 'EEXIST') { console.log('另一个启动程序正在运行，请稍候。'); return; } throw error; }
  ownsLock = true;
  const port = await freePort(requestedPort);
  if (requestedPort && port !== requestedPort) console.log(`端口 ${requestedPort} 已被占用，本次使用 ${port}。`);
  record.port = port;
  fs.writeFileSync(lockPath, JSON.stringify(record));
  process.env.PORT = String(port);
  process.env.TYPING_RUNTIME_INSTANCE = instance;
  console.log('================================================');
  console.log('  字练场 · 免安装运行版');
  console.log('  ⚠ 不要关闭这个黑色窗口');
  console.log('     关掉窗口 = 服务停止，全班学生都会断线');
  console.log('  需要停止时：输入 q 回车，或按 Ctrl+C');
  console.log('================================================');
  require('./backend/server.js');
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', value => { if (value.trim().toLowerCase() === 'q') process.emit('SIGINT'); });
  // Poll only our own server instance; never open an unrelated process on the port.
  const deadline = Date.now() + 15000;
  async function ready() {
    const status = await health(port);
    if (status?.instance === instance) {
      console.log(noBrowser
        ? `READY 服务已就绪：http://127.0.0.1:${port}/`
        : `READY 服务已就绪，已在本机打开后台：http://127.0.0.1:${port}/admin`);
      openBrowser(port);
    } else if (Date.now() < deadline) setTimeout(ready, 200);
    else console.error('服务未就绪，请查看上面的错误或 data/runlogs/server-events.log。');
  }
  ready();
}

process.on('exit', () => {
  if (!ownsLock) return;
  try { if (JSON.parse(fs.readFileSync(lockPath, 'utf8')).instance === instance) fs.unlinkSync(lockPath); } catch { /* Preserve another instance's lock. */ }
});
main().catch(error => { console.error(`启动失败：${error.message}`); process.exitCode = 1; });
