const path = require('node:path');
const os = require('node:os');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { createDatabase } = require('./database');
const { createApp } = require('./app');

const port = Number.parseInt(process.env.PORT, 10) || 3000;
const host = process.env.HOST || '0.0.0.0';
const databasePath = path.resolve(process.env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'typing.db'));
const db = createDatabase(databasePath);
const app = createApp({
  db,
  adminPassword: process.env.ADMIN_PASSWORD || 'admin123',
  secureCookies: process.env.COOKIE_SECURE === 'true',
  requireAccountApproval: process.env.REQUIRE_ACCOUNT_APPROVAL !== 'false'
});

if (!process.env.ADMIN_PASSWORD) {
  console.warn('提示：当前使用默认后台密码 admin123，请在 .env 中设置 ADMIN_PASSWORD。');
}

const server = app.listen(port, host, () => {
  console.log(`项目目录：${path.join(__dirname, '..')}`);
  console.log(`字练场已启动：http://localhost:${port}`);
  const addresses = Object.values(os.networkInterfaces()).flat().filter((item) => item && item.family === 'IPv4' && !item.internal);
  for (const item of addresses) console.log(`局域网访问：http://${item.address}:${port}`);
});

function shutdown() {
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
