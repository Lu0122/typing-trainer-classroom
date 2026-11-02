// 端到端验证：老师建赛 → 学生被强制拉进比赛页并自动报名 → 老师终止 → 学生可离开。
// 用法：BASE=http://127.0.0.1:3100 node scripts/verify-competition-lock.mjs
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:3100';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123456.';
const OUT = 'output/competition-lock';
mkdirSync(OUT, { recursive: true });

const failures = [];
const fail = (msg) => failures.push(msg);
const stamp = Date.now().toString().slice(-6);

const browser = await chromium.launch({ channel: 'chrome' });
const adminContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const api = adminContext.request;

// 1. 老师登录并建一场单人也能开的个人赛
await api.post(`${BASE}/api/admin/login`, { data: { password: ADMIN_PASSWORD } }).then(async (r) => {
  if (!r.ok()) throw new Error(`管理员登录失败 ${r.status()}`);
});
const created = await api.post(`${BASE}/api/competitions`, {
  data: { name: `自动化验收 ${stamp}`, mode: 'speed', config: { roundMs: 60_000, language: 'zh' } }
});
if (!created.ok()) throw new Error(`建赛失败 ${created.status()} ${await created.text()}`);
const competitionId = (await created.json()).id;

// 之前失败过的运行会留下没终止的赛事，它们会让「比赛进行中」一直成立，
// 干扰「终止后是否解锁」的判断，所以先全部收掉。
for (let round = 0; round < 3; round += 1) {
  const listed = await api.get(`${BASE}/api/competitions?pageSize=50`);
  const rows = listed.ok() ? ((await listed.json()).rows || []) : [];
  const stale = rows.filter((row) => ['registration', 'running', 'paused'].includes(row.status) && row.id !== competitionId);
  if (!stale.length) break;
  for (const row of stale) await api.post(`${BASE}/api/competitions/${row.id}/terminate`, { data: { reason: 'cleanup' } });
}
await api.post(`${BASE}/api/competitions/${competitionId}/registration`, { data: {} });
console.log('已建赛并开启检录：', competitionId.slice(0, 8));

// 2. 学生登录后应该被强制拉到比赛页
const studentContext = await browser.newContext({ viewport: { width: 1366, height: 768 } });
const page = await studentContext.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

const username = `smoke${stamp}`;
// 学生注册默认是关闭的（老师统一导入），所以用后台接口建号，再用学生身份登录。
// 后台建号时 username 写的是姓名（不是学号），登录要用姓名。
const displayName = `验收${stamp}`;
const createdUser = await api.post(`${BASE}/api/admin/users`, {
  data: { displayName, studentId: username, password: 'Classroom123' }
});
if (!createdUser.ok()) throw new Error(`建学生号失败 ${createdUser.status()} ${await createdUser.text()}`);
const loggedIn = await studentContext.request.post(`${BASE}/api/auth/login`, {
  data: { username: displayName, password: 'Classroom123' }
});
if (!loggedIn.ok()) throw new Error(`学生登录失败 ${loggedIn.status()} ${await loggedIn.text()}`);

await page.goto(`${BASE}/#home`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);

const forced = await page.evaluate(() => ({
  hash: location.hash,
  hasEventCard: !!document.querySelector('.competition-event-card'),
  bodyText: document.body.innerText.slice(0, 400),
}));
if (!forced.hash.includes('competition')) fail(`学生没有被拉到比赛页：hash=${forced.hash}`);
if (!forced.hasEventCard) fail('比赛页没有渲染赛事卡片');

const noJoinButton = await page.evaluate(() => !/加入比赛/.test(document.body.innerText));
if (!noJoinButton) fail('仍然出现「加入比赛」按钮，学生需要手动确认');
const autoJoined = await page.evaluate(() => /已自动报名/.test(document.body.innerText));
if (!autoJoined) fail('没有显示「已自动报名」提示');
await page.screenshot({ path: `${OUT}/student-locked.png` });

// 3. 比赛期间其他玩法入口应被服务端拒绝
const blocked = await studentContext.request.post(`${BASE}/api/battle/join`, { data: {} });
if (blocked.status() !== 423) fail(`比赛期间 battle/join 没有返回 423，实际 ${blocked.status()}`);

// 4. 老师终止
const terminated = await api.post(`${BASE}/api/competitions/${competitionId}/terminate`, { data: { reason: 'teacher' } });
if (!terminated.ok()) fail(`终止失败 ${terminated.status()} ${await terminated.text()}`);

await page.waitForTimeout(3500);
const afterTerminate = await page.evaluate(() => ({
  hash: location.hash,
  text: document.body.innerText.slice(0, 500),
  hasBackButton: [...document.querySelectorAll('button')].some((b) => /返回比赛项目/.test(b.textContent || '')),
}));
if (!/比赛已终止/.test(afterTerminate.text)) fail('学生端没有显示「比赛已终止」');
if (!afterTerminate.hasBackButton) fail('学生端没有「返回比赛项目」按钮');
await page.screenshot({ path: `${OUT}/student-terminated.png` });

// 5. 终止后可以真的离开比赛页
if (afterTerminate.hasBackButton) {
  await page.locator('.competition-event-primary', { hasText: '返回比赛项目' }).click();
  await page.waitForTimeout(1500);
  const left = await page.evaluate(() => location.hash);
  if (left.includes('competition') && !left.includes('competition-hub')) fail(`点了返回仍停在比赛页：${left}`);
}
// 6. 终止后其他玩法入口恢复
const released = await studentContext.request.post(`${BASE}/api/battle/join`, { data: {} });
if (released.status() === 423) fail('终止后 battle/join 仍然被锁');

console.log(JSON.stringify({
  hash: forced.hash,
  autoJoined,
  noJoinButton,
  blockedStatus: blocked.status(),
  terminatedText: /比赛已终止/.test(afterTerminate.text),
  releasedStatus: released.status(),
  pageErrors: errors.slice(0, 3),
}, null, 2));

await browser.close();
if (failures.length) {
  console.error('\n失败项：\n- ' + failures.join('\n- '));
  process.exitCode = 1;
} else {
  console.log('\n全部通过');
}
