const path = require('node:path');
const os = require('node:os');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { createDatabase } = require('./database');
const { createApp } = require('./app');
const { attachBattleSocket } = require('./battle-socket');

// 挑出「发给学生」用的那个局域网地址。
// 一台电脑常常同时挂着 WSL、Hyper-V、VMware、VPN 的虚拟网卡，全都打印出来老师分不清。
// 先按网卡名排除虚拟网卡，再按网段排序（192.168 > 10 > 172.16-31 > 其它），
// 最后把 .1 结尾的地址（虚拟网络的网关常用）往后排。
const VIRTUAL_ADAPTER = /vethernet|vmware|virtualbox|hyper-v|wsl|docker|loopback|tap|tailscale|zerotier|vpn|teredo|isatap/i;
function lanRank(address) {
  let score = 30;
  if (/^192\.168\./.test(address)) score = 0;
  else if (/^10\./.test(address)) score = 10;
  else if (/^172\.(?:1[6-9]|2\d|3[01])\./.test(address)) score = 20;
  if (address.endsWith('.1')) score += 5;
  return score;
}
function lanAddresses() {
  return Object.entries(os.networkInterfaces())
    .flatMap(([name, items]) => (items || [])
      .filter((item) => item && item.family === 'IPv4' && !item.internal)
      .map((item) => ({ name, address: item.address })))
    .filter((item) => !VIRTUAL_ADAPTER.test(item.name))
    .filter((item) => !/^198\.(?:18|19)\./.test(item.address) && !item.address.startsWith('169.254.'))
    .sort((a, b) => lanRank(a.address) - lanRank(b.address));
}

const port = Number.parseInt(process.env.PORT, 10) || 3000;
const host = process.env.HOST || '0.0.0.0';
const databasePath = path.resolve(process.env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'typing.db'));
const db = createDatabase(databasePath);
const app = createApp({
  db,
  adminPassword: process.env.ADMIN_PASSWORD || 'admin123',
  secureCookies: process.env.COOKIE_SECURE === 'true',
  requireAccountApproval: process.env.REQUIRE_ACCOUNT_APPROVAL !== 'false'
  ,studentRegistrationEnabled: process.env.STUDENT_REGISTRATION_ENABLED === 'true'
});

if (!process.env.ADMIN_PASSWORD) {
  console.warn('提示：当前使用默认后台密码 admin123，请在 .env 中设置 ADMIN_PASSWORD。');
}

const server = app.listen(port, host, () => {
  console.log(`项目目录：${path.join(__dirname, '..')}`);
  console.log(`本机后台：http://127.0.0.1:${port}/admin`);
  // 老师只需要一条能发给学生的链接，所以这里挑一个最像「教室局域网」的地址：
  // 先排除虚拟网卡（WSL / Hyper-V / VMware / VPN 等），再按网段排序。
  const lan = lanAddresses();
  if (lan.length) {
    console.log('');
    console.log('==== 发给学生的链接（把下面这一条发到班级群）====');
    console.log(`  http://${lan[0].address}:${port}    [${lan[0].name}]`);
    console.log('================================================');
    if (lan.length > 1) {
      console.log(`其它网卡（一般不用）：${lan.slice(1).map((item) => `http://${item.address}:${port} [${item.name}]`).join('  ')}`);
    }
  } else {
    console.log('没有检测到可用的局域网地址：学生可能连不上，请确认这台电脑已连上教室网络。');
  }
});

const battleSocket = attachBattleSocket(server, { app, db });
function shutdown() {
  battleSocket.close();
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// 运行事件日志：启动 / 心跳 / 退出 / 未捕获异常 / 端口占用 全部带时间戳落到 data/runlogs/server-events.log。
// 服务「跑着跑着没了」时，先看这个文件：有「退出」行说明是正常信号退出；没有退出行、
// 心跳也停在某个时刻，说明进程是被外部强杀的（终端/会话关闭、任务管理器结束进程等）。
const fs = require('node:fs');
const eventLogPath = path.join(__dirname, '..', 'data', 'runlogs', 'server-events.log');
const lastLogged = new Map();
function logEvent(kind, detail = '') {
  const now = Date.now();
  if (now - (lastLogged.get(kind) || 0) < 5000) return; // 同类事件 5 秒内只记一次，避免异常刷屏
  lastLogged.set(kind, now);
  const line = `[${new Date().toISOString()}] ${kind}${detail ? ' ' + detail : ''}`;
  try {
    fs.mkdirSync(path.dirname(eventLogPath), { recursive: true });
    fs.appendFileSync(eventLogPath, line + '\n');
  } catch { /* 日志写不进去不能影响服务 */ }
  console.log(line);
}
logEvent('启动', `pid=${process.pid} port=${port} database=${databasePath}`);
setInterval(() => logEvent('心跳', `pid=${process.pid}`), 10 * 60 * 1000).unref();
server.on('error', (error) => {
  logEvent('监听失败', `${error.code || ''} ${error.message}`);
  if (error.code === 'EADDRINUSE') {
    console.error(`端口 ${port} 已被占用：可能已经有一个服务在运行，或上一次的旧进程没退干净。`);
    process.exit(1);
  }
});
process.on('uncaughtException', (error) => logEvent('未捕获异常', (error && error.stack) || String(error)));
process.on('unhandledRejection', (reason) => logEvent('未处理的 Promise 拒绝', (reason && (reason.stack || reason.message)) || String(reason)));
process.on('exit', (code) => logEvent('退出', `code=${code}`));
