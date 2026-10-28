const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createDatabase } = require('../backend/database');
const { createApp } = require('../backend/app');

function setup() {
  let currentTime = 1_700_000_000_000;
  const db = createDatabase(':memory:');
  const now = () => currentTime;
  const app = createApp({ db, adminPassword: 'test-pass', now, requireAccountApproval: false });
  return { app, db, now, advance: (milliseconds) => { currentTime += milliseconds; } };
}

async function registerStudent(app, suffix = '001', displayName = '小林') {
  const agent = request.agent(app);
  const username = `student${suffix}`;
  await agent.post('/api/auth/register').send({ username, displayName, password: 'Classroom123' }).expect(201);
  return { agent, username, displayName };
}

test('supports multiple independent administrator accounts with role protection', async () => {
  const context = setup();
  const superAdmin = request.agent(context.app);
  await superAdmin.post('/api/admin/login').send({ username: 'admin', password: 'test-pass' }).expect(200);
  const created = await superAdmin.post('/api/admin/admins').send({
    username: 'teacher01', displayName: '张老师', password: 'Teacher123', role: 'manager'
  }).expect(201);
  assert.equal(created.body.role, 'manager');
  const manager = request.agent(context.app);
  const login = await manager.post('/api/admin/login').send({ username: 'teacher01', password: 'Teacher123' }).expect(200);
  assert.equal(login.body.admin.username, 'teacher01');
  assert.equal(login.body.admin.role, 'manager');
  await manager.get('/api/admin/users').expect(200);
  await manager.get('/api/admin/admins').expect(403);
  const list = await superAdmin.get('/api/admin/admins').expect(200);
  assert.equal(list.body.rows.length, 2);
  await superAdmin.patch(`/api/admin/admins/${created.body.id}/status`).send({ isActive: false }).expect(200);
  await manager.get('/api/admin/users').expect(401);
  await request(context.app).post('/api/admin/login').send({ username: 'teacher01', password: 'Teacher123' }).expect(401);
  await superAdmin.post(`/api/admin/admins/${created.body.id}/reset-password`).send({ password: 'Teacher456' }).expect(200);
  await request(context.app).post('/api/admin/login').send({ username: 'teacher01', password: 'Teacher456' }).expect(200);
  context.db.close();
});

test('imports real-name student accounts and can disable self-registration', async () => {
  const db = createDatabase(':memory:');
  const app = createApp({ db, adminPassword: 'test-pass', requireAccountApproval: false, studentRegistrationEnabled: false });
  const admin = request.agent(app);
  await admin.post('/api/admin/login').send({ username: 'admin', password: 'test-pass' }).expect(200);
  const imported = await admin.post('/api/admin/users/import').send({ text: '张三,20250101\n李四,20250102' }).expect(201);
  assert.equal(imported.body.imported, 2);
  await request(app).post('/api/auth/register').send({ displayName: '王五', password: '20250103' }).expect(404);
  const student = request.agent(app);
  await student.post('/api/auth/login').send({ username: '张三', password: '20250101' }).expect(200);
  await request(app).post('/api/auth/login').send({ username: '李四', password: '20250101' }).expect(401);
  const duplicate = await admin.post('/api/admin/users/import').send({ rows: [{ displayName: '张三', studentId: '20250109' }] }).expect(201);
  assert.equal(duplicate.body.imported, 0);
  assert.equal(duplicate.body.failed, 1);
  db.close();
});

test('registers with name and password only, logs in by name, and blocks duplicate or sensitive names', async () => {
  const context = setup();
  const registration = await request(context.app).post('/api/auth/register').send({
    displayName: '小明', password: 'Classroom123'
  }).expect(201);
  assert.match(registration.body.user.username, /^student_[a-f0-9]{12}$/);
  assert.equal(registration.body.user.displayName, '小明');

  await request(context.app).post('/api/auth/register').send({
    displayName: '小明', password: 'Classroom456'
  }).expect(409);
  await request(context.app).post('/api/auth/register').send({
    displayName: '管理员', password: 'Classroom456'
  }).expect(400).expect((response) => assert.match(response.body.message, /敏感词/));
  await request(context.app).post('/api/auth/login').send({
    username: '小明', password: 'Classroom123'
  }).expect(200);
  context.db.close();
});

test('accepts six-to-twelve digit or alphanumeric passwords', async () => {
  const context = setup();
  await request(context.app).post('/api/auth/register').send({ displayName: '数字用户', password: '123456' }).expect(201);
  await request(context.app).post('/api/auth/register').send({ displayName: '组合用户', password: 'abc123' }).expect(201);
  await request(context.app).post('/api/auth/register').send({ displayName: '纯字母用户', password: 'abcdef' }).expect(400);
  await request(context.app).post('/api/auth/register').send({ displayName: '短密码用户', password: '12345' }).expect(400);
  await request(context.app).post('/api/auth/register').send({ displayName: '超长密码用户', password: '1234567890123' }).expect(400);
  context.db.close();
});

test('registers a persistent student session and rejects duplicate usernames', async () => {
  const context = setup();
  const student = await registerStudent(context.app);
  const me = await student.agent.get('/api/auth/me').expect(200);
  assert.equal(me.body.authenticated, true);
  assert.equal(me.body.user.username, student.username);
  assert.notEqual(context.db.prepare('SELECT password_hash AS hash FROM users').get().hash, 'Classroom123');
  await request(context.app).post('/api/auth/register').send({
    username: student.username.toUpperCase(), displayName: '另一位同学', password: 'Classroom123'
  }).expect(409);
  context.db.close();
});

test('stores a resized avatar and serves it to authenticated clients', async () => {
  const context = setup();
  const { agent } = await registerStudent(context.app, 'avatar', '头像同学');
  const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  const saved = await agent.patch('/api/auth/avatar').send({ avatarData: tinyPng }).expect(200);
  assert.match(saved.body.user.avatarUrl, /^\/api\/users\/\d+\/avatar\?v=[a-f0-9]{10}$/);
  const me = await agent.get('/api/auth/me').expect(200);
  assert.equal(me.body.user.avatarUrl, saved.body.user.avatarUrl);
  await agent.get('/api/users/1/avatar').expect(200).expect('Content-Type', /image\/png/);
  await agent.patch('/api/auth/avatar').send({ avatarData: 'not-an-image' }).expect(400);
  context.db.close();
});

test('keeps student login sessions after the server app restarts', async () => {
  const context = setup();
  const registration = await request(context.app).post('/api/auth/register').send({
    username: 'student001', displayName: '小林', password: 'Classroom123'
  }).expect(201);
  const cookie = registration.headers['set-cookie'][0].split(';')[0];
  const restartedApp = createApp({
    db: context.db,
    adminPassword: 'test-pass',
    now: context.now,
    requireAccountApproval: false
  });
  const me = await request(restartedApp).get('/api/auth/me').set('Cookie', cookie).expect(200);
  assert.equal(me.body.authenticated, true);
  assert.equal(me.body.user.username, 'student001');
  context.db.close();
});

test('requires teacher approval for new accounts by default', async () => {
  let currentTime = 1_700_000_000_000;
  const db = createDatabase(':memory:');
  const app = createApp({ db, adminPassword: 'test-pass', now: () => currentTime });
  const registration = await request(app).post('/api/auth/register').send({
    username: 'student001', displayName: '小林', password: 'Classroom123'
  }).expect(202);
  assert.equal(registration.body.pending, true);
  assert.equal((await request(app).get('/api/auth/me').expect(200)).body.authenticated, false);
  await request(app).post('/api/auth/login').send({ username: 'student001', password: 'Classroom123' }).expect(401).expect((response) => assert.match(response.body.message, /审核/));

  const admin = request.agent(app);
  await admin.post('/api/admin/login').send({ password: 'test-pass' }).expect(200);
  const users = await admin.get('/api/admin/users').expect(200);
  assert.equal(users.body.rows[0].isActive, 0);
  await admin.patch(`/api/admin/users/${users.body.rows[0].id}/status`).send({ isActive: true }).expect(200);
  await request(app).post('/api/auth/login').send({ username: 'student001', password: 'Classroom123' }).expect(200);
  db.close();
});

test('requires an account for challenges and rate limits repeated login failures', async () => {
  const context = setup();
  await request(context.app).post('/api/challenges').expect(401);
  await registerStudent(context.app);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await request(context.app).post('/api/auth/login').send({ username: 'student001', password: 'Wrong123' }).expect(401);
  }
  const limited = await request(context.app).post('/api/auth/login').send({ username: 'student001', password: 'Wrong123' }).expect(429);
  assert.match(limited.headers['retry-after'], /^\d+$/);
  context.db.close();
});

test('starts and submits a server-timed challenge for the authenticated student', async () => {
  const context = setup();
  const { agent } = await registerStudent(context.app);
  const start = await agent.post('/api/challenges').expect(201);
  context.advance(60_000);
  const submit = await agent.post(`/api/challenges/${start.body.sessionId}/submit`)
    .send({ typedText: start.body.passage.content.slice(0, 12), nickname: '伪造昵称' }).expect(201);
  assert.equal(submit.body.score, 12);
  assert.equal(submit.body.accuracy, 100);
  const saved = context.db.prepare('SELECT nickname, user_id AS userId FROM scores').get();
  assert.equal(saved.nickname, '小林');
  assert.equal(saved.userId, 1);
  context.db.close();
});

test('delays the challenge clock when the client asks for a countdown', async () => {
  const context = setup();
  const { agent } = await registerStudent(context.app);
  const start = await agent.post('/api/challenges').send({ startInMs: 3000 }).expect(201);
  assert.equal(start.body.startInMs, 3000);
  assert.equal(start.body.startedAt, context.now() + 3000);
  assert.equal(start.body.expiresAt, context.now() + 3000 + 60_000);

  // 倒计时还没走完就想提交，应当被拒绝
  await agent.post(`/api/challenges/${start.body.sessionId}/submit`)
    .send({ typedText: start.body.passage.content.slice(0, 5) })
    .expect(400);

  // 3 秒倒计时 + 60 秒作答之后可以正常结算
  context.advance(63_000);
  const submit = await agent.post(`/api/challenges/${start.body.sessionId}/submit`)
    .send({ typedText: start.body.passage.content.slice(0, 8) }).expect(201);
  assert.equal(submit.body.score, 8);
  context.db.close();
});

test('clamps startInMs to the supported range', async () => {
  const context = setup();
  const { agent } = await registerStudent(context.app);
  const tooBig = await agent.post('/api/challenges').send({ startInMs: 999_999 }).expect(201);
  assert.equal(tooBig.body.startInMs, 5000);
  const negative = await agent.post('/api/challenges').send({ startInMs: -2000 }).expect(201);
  assert.equal(negative.body.startInMs, 0);
  context.db.close();
});

test('supports separate English and pinyin challenge modes and leaderboards', async () => {
  const context = setup();
  const { agent } = await registerStudent(context.app);

  const english = await agent.post('/api/challenges').send({ mode: 'english' }).expect(201);
  assert.equal(english.body.mode, 'english');
  assert.equal(english.body.passage.category, '英文挑战');
  context.advance(60_000);
  const englishResult = await agent.post(`/api/challenges/${english.body.sessionId}/submit`)
    .send({ typedText: english.body.passage.content.slice(0, 24) }).expect(201);
  assert.equal(englishResult.body.score > 0, true);

  const pinyin = await agent.post('/api/challenges').send({ mode: 'pinyin' }).expect(201);
  assert.equal(pinyin.body.mode, 'pinyin');
  assert.equal(pinyin.body.passage.category, '拼音挑战');
  context.advance(60_000);
  await agent.post(`/api/challenges/${pinyin.body.sessionId}/submit`)
    .send({ typedText: pinyin.body.passage.content.slice(0, 12) }).expect(201);

  const englishBoard = await agent.get('/api/leaderboard?mode=english').expect(200);
  const pinyinBoard = await agent.get('/api/leaderboard?mode=pinyin').expect(200);
  assert.equal(englishBoard.body.rows.length, 1);
  assert.equal(pinyinBoard.body.rows.length, 1);
  context.db.close();
});

test('rejects early submissions and challenges belonging to another student', async () => {
  const context = setup();
  const owner = await registerStudent(context.app, '001', '小林');
  const other = await registerStudent(context.app, '002', '小周');
  const start = await owner.agent.post('/api/challenges').expect(201);
  await owner.agent.post(`/api/challenges/${start.body.sessionId}/submit`).send({ typedText: '测试' }).expect(400);
  context.advance(60_000);
  await other.agent.post(`/api/challenges/${start.body.sessionId}/submit`).send({ typedText: '测试' }).expect(403);
  context.db.close();
});

test('replays a saved result for duplicate submission and rejects expired sessions', async () => {
  const context = setup();
  const { agent } = await registerStudent(context.app);
  const first = await agent.post('/api/challenges').expect(201);
  context.advance(60_000);
  const firstSubmit = await agent.post(`/api/challenges/${first.body.sessionId}/submit`).send({ typedText: '广西' }).expect(201);
  const repeatedSubmit = await agent.post(`/api/challenges/${first.body.sessionId}/submit`).send({ typedText: '广西' }).expect(200);
  assert.equal(repeatedSubmit.body.duplicate, true);
  assert.equal(repeatedSubmit.body.scoreId, firstSubmit.body.scoreId);
  const expired = await agent.post('/api/challenges').expect(201);
  context.advance(10 * 60 * 1000 + 60_001);
  await agent.post(`/api/challenges/${expired.body.sessionId}/submit`).send({ typedText: '广西' }).expect(410);
  context.db.close();
});

test('ranks each student once using their personal best and preserves tied ranks', async () => {
  const context = setup();
  const first = await registerStudent(context.app, '001', '小林');
  const second = await registerStudent(context.app, '002', '小周');
  const firstChallenge = await first.agent.post('/api/challenges').expect(201);
  const secondChallenge = await second.agent.post('/api/challenges').expect(201);
  context.advance(60_000);
  for (const [student, challenge] of [[first, firstChallenge], [second, secondChallenge]]) {
    const result = await student.agent.post(`/api/challenges/${challenge.body.sessionId}/submit`)
      .send({ typedText: challenge.body.passage.content.slice(0, 8) }).expect(201);
    assert.equal(result.body.rank, 1);
  }
  const lowerAttempt = await first.agent.post('/api/challenges').expect(201);
  context.advance(60_000);
  await first.agent.post(`/api/challenges/${lowerAttempt.body.sessionId}/submit`).send({ typedText: '错' }).expect(201);
  const leaderboard = await first.agent.get('/api/leaderboard').expect(200);
  assert.equal(leaderboard.body.rows.length, 2);
  assert.deepEqual(leaderboard.body.rows.map((row) => row.rank), [1, 1]);
  assert.equal(leaderboard.body.totals.attempts, 3);
  assert.equal(leaderboard.body.totals.participants, 2);
  const account = await first.agent.get('/api/account/stats').expect(200);
  assert.equal(account.body.attempts, 2);
  assert.equal(account.body.personalBest, 8);
  context.db.close();
});

test('protects admin routes and completes passage and student-account management', async () => {
  const context = setup();
  const student = await registerStudent(context.app);
  await request(context.app).get('/api/admin/stats').expect(401);
  const admin = request.agent(context.app);
  await admin.post('/api/admin/login').send({ password: 'test-pass' }).expect(200);
  const stats = await admin.get('/api/admin/stats').expect(200);
  assert.equal(stats.body.activePassages, 12);
  assert.equal(stats.body.registeredUsers, 1);
  const created = await admin.post('/api/admin/passages').send({
    title: '测试文章', category: '课堂测试',
    content: '这是一篇用于验证后台新增编辑删除闭环的中文练习文章。', isActive: true
  }).expect(201);
  await admin.put(`/api/admin/passages/${created.body.id}`).send({
    title: '测试文章已更新', category: '课堂测试',
    content: '这是一篇已经更新并用于验证后台完整操作闭环的中文练习文章。', isActive: false
  }).expect(200);
  const passages = await admin.get('/api/admin/passages').expect(200);
  assert.equal(passages.body.rows.find((row) => row.id === created.body.id).isActive, 0);
  await admin.delete(`/api/admin/passages/${created.body.id}`).expect(200);
  const users = await admin.get('/api/admin/users').expect(200);
  const userId = users.body.rows[0].id;
  await admin.patch(`/api/admin/users/${userId}/status`).send({ isActive: false }).expect(200);
  assert.equal((await student.agent.get('/api/auth/me').expect(200)).body.authenticated, false);
  await admin.patch(`/api/admin/users/${userId}/status`).send({ isActive: true }).expect(200);
  await admin.post(`/api/admin/users/${userId}/reset-password`).send({ password: 'NewPass456' }).expect(200);
  await request(context.app).post('/api/auth/login').send({ username: 'student001', password: 'Classroom123' }).expect(401);
  await request(context.app).post('/api/auth/login').send({ username: 'student001', password: 'NewPass456' }).expect(200);
  await admin.get('/api/admin/scores?page=999').expect(200).expect((response) => {
    assert.equal(response.body.page, response.body.pages);
  });
  context.db.close();
});

test('records practice sessions and exposes student speed progress to the admin', async () => {
  const context = setup();
  const { agent } = await registerStudent(context.app);
  const samples = [20, 30, 40, 50];
  for (const speed of samples) {
    await agent.post('/api/training-sessions').send({
      mode: 'english-word', lessonTitle: '主题词汇', correctChars: speed,
      wrongChars: 1, durationMs: 60_000
    }).expect(201);
    context.advance(24 * 60 * 60 * 1000);
  }
  await agent.post('/api/training-sessions').send({ mode: 'unknown', lessonTitle: '无效', correctChars: 10, wrongChars: 0, durationMs: 60_000 }).expect(400);
  const admin = request.agent(context.app);
  await admin.post('/api/admin/login').send({ password: 'test-pass' }).expect(200);
  const overview = await admin.get('/api/admin/progress/overview').expect(200);
  assert.equal(overview.body.monitoredStudents, 1);
  assert.equal(overview.body.improvingStudents, 1);
  const progress = await admin.get('/api/admin/progress/students').expect(200);
  assert.equal(progress.body.rows[0].sessions, 4);
  assert.equal(progress.body.rows[0].speedChange, 10);
  assert.equal(progress.body.rows[0].activeDays, 4);
  assert.equal(progress.body.rows[0].dailyHours, 0.02);
  const detail = await admin.get(`/api/admin/progress/students/${progress.body.rows[0].id}`).expect(200);
  assert.equal(detail.body.daily.length, 4);
  context.db.close();
});

test('stores key diagnostics, exposes growth summary, and completes matching assignments', async () => {
  const context = setup();
  const { agent } = await registerStudent(context.app, '009', '小周');
  const admin = request.agent(context.app);
  await admin.post('/api/admin/login').send({ password: 'test-pass' }).expect(200);
  const assignment = await admin.post('/api/admin/assignments').send({
    title: '英文单词基础训练', mode: 'english-word', lessonTitle: '主题词汇',
    targetAccuracy: 90, targetSpeed: 10, audience: 'all'
  }).expect(201);
  assert.equal(typeof assignment.body.id, 'number');

  await agent.post('/api/training-sessions').send({
    mode: 'english-word', lessonTitle: '主题词汇', correctChars: 24, wrongChars: 2,
    durationMs: 60_000, keyStats: [
      { keyCode: 'KeyA', expectedCount: 10, correctCount: 7, wrongCount: 3, actualErrors: { KeyS: 2, KeyD: 1 } },
      { keyCode: 'KeyS', expectedCount: 8, correctCount: 8, wrongCount: 0, actualErrors: {} }
    ]
  }).expect(201);
  const diagnostics = await agent.get('/api/learning/diagnostics').expect(200);
  assert.equal(diagnostics.body.rows[0].keyCode, 'KeyA');
  assert.equal(diagnostics.body.rows[0].errorRate, 30);
  const summary = await agent.get('/api/learning/summary').expect(200);
  assert.equal(summary.body.stats.sessions, 1);
  assert.equal(summary.body.stats.weeklySessions, 1);
  assert.equal(summary.body.diagnostics[0].keyCode, 'KeyA');
  const tasks = await agent.get('/api/assignments').expect(200);
  assert.equal(tasks.body.rows.length, 1);
  assert.equal(tasks.body.rows[0].id, assignment.body.id);
  assert.equal(tasks.body.rows[0].status, 'completed');
  const adminAssignments = await admin.get('/api/admin/assignments').expect(200);
  assert.equal(adminAssignments.body.rows[0].targetCount, 1);
  assert.equal(adminAssignments.body.rows[0].completionRate, 100);
  const selected = await admin.post('/api/admin/assignments').send({
    title: '指定学生复练', mode: 'english-word', lessonTitle: '主题词汇', audience: 'selected', studentIds: [1]
  }).expect(201);
  await admin.put(`/api/admin/assignments/${selected.body.id}`).send({
    title: '指定学生复练（已调整）', mode: 'english-word', lessonTitle: '主题词汇', audience: 'selected', studentIds: [1], targetAccuracy: 95
  }).expect(200);
  const edited = await admin.get('/api/admin/assignments').expect(200);
  const editedRow = edited.body.rows.find((row) => row.id === selected.body.id);
  assert.equal(editedRow.title, '指定学生复练（已调整）');
  assert.deepEqual(editedRow.studentIds, [1]);
  const savedKeyStats = context.db.prepare('SELECT COUNT(*) AS count FROM typing_key_stats').get();
  assert.equal(savedKeyStats.count, 2);
  context.db.close();
});

test('preserves registered students while creating classes and batch assigning members', async () => {
  const context = setup();
  const first = await registerStudent(context.app, 'class-a', '一班同学');
  const second = await registerStudent(context.app, 'class-b', '二班同学');
  const firstMe = await first.agent.get('/api/auth/me').expect(200);
  const secondMe = await second.agent.get('/api/auth/me').expect(200);
  const admin = request.agent(context.app);
  await admin.post('/api/admin/login').send({ password: 'test-pass' }).expect(200);
  const created = await admin.post('/api/admin/classes').send({ name: '25级软件技术1班', term: '2026-2027 第一学期', description: '软件技术专业' }).expect(201);
  const classId = created.body.id;
  const unassigned = await admin.get('/api/admin/classes/unassigned/students').expect(200);
  assert.deepEqual(unassigned.body.rows.map((row) => row.id).sort((a, b) => a - b), [firstMe.body.user.id, secondMe.body.user.id].sort((a, b) => a - b));
  await admin.post(`/api/admin/classes/${classId}/members`).send({ studentIds: [firstMe.body.user.id, secondMe.body.user.id] }).expect(200);
  const members = await admin.get(`/api/admin/classes/${classId}/members`).expect(200);
  assert.deepEqual(members.body.rows.map((row) => row.id).sort((a, b) => a - b), [firstMe.body.user.id, secondMe.body.user.id].sort((a, b) => a - b));
  assert.equal((await admin.get('/api/admin/classes/unassigned/students')).body.rows.length, 0);
  const secondClass = await admin.post('/api/admin/classes').send({ name: '25级软件技术2班' }).expect(201);
  const classPage = await admin.get('/api/admin/classes?page=1&pageSize=1').expect(200);
  assert.equal(classPage.body.total, 2); assert.equal(classPage.body.pages, 1); assert.equal(classPage.body.rows.length, 2);
  await admin.post(`/api/admin/classes/${secondClass.body.id}/members`).send({ studentIds: [firstMe.body.user.id] }).expect(200);
  assert.equal((await admin.get(`/api/admin/classes/${classId}/members`)).body.rows.length, 1);
  assert.equal((await admin.get(`/api/admin/classes/${secondClass.body.id}/members`)).body.rows[0].id, firstMe.body.user.id);
  assert.equal((await first.agent.get('/api/auth/me')).body.user.displayName, '一班同学');
  assert.equal((await second.agent.get('/api/auth/me')).body.user.displayName, '二班同学');
  context.db.close();
});

test('targets assignments to a class and updates only class members', async () => {
  const context = setup();
  const member = await registerStudent(context.app, 'ctm', '班级任务学生');
  const outsider = await registerStudent(context.app, 'cto', '未分班学生');
  const memberId = (await member.agent.get('/api/auth/me').expect(200)).body.user.id;
  const outsiderId = (await outsider.agent.get('/api/auth/me').expect(200)).body.user.id;
  const admin = request.agent(context.app);
  await admin.post('/api/admin/login').send({ password: 'test-pass' }).expect(200);
  const classRow = await admin.post('/api/admin/classes').send({ name: '班级任务测试班' }).expect(201);
  await admin.post(`/api/admin/classes/${classRow.body.id}/members`).send({ studentIds: [memberId] }).expect(200);
  await admin.post('/api/admin/assignments').send({ title: '班级专项任务', mode: 'english-word', audience: 'class', classId: classRow.body.id, targetAccuracy: 90 }).expect(201);
  const memberTasks = await member.agent.get('/api/assignments').expect(200);
  const outsiderTasks = await outsider.agent.get('/api/assignments').expect(200);
  assert.equal(memberTasks.body.rows.length, 1);
  assert.equal(outsiderTasks.body.rows.length, 0);
  await member.agent.post('/api/training-sessions').send({ mode: 'english-word', lessonTitle: '主题词汇', correctChars: 20, wrongChars: 0, durationMs: 60000, keyStats: [] }).expect(201);
  const adminAssignments = await admin.get('/api/admin/assignments').expect(200);
  assert.equal(adminAssignments.body.rows[0].audience, 'class');
  assert.equal(adminAssignments.body.rows[0].completionRate, 100);
  const overview = await admin.get(`/api/admin/classes/${classRow.body.id}/overview`).expect(200);
  assert.equal(overview.body.metrics.memberCount, 1); assert.equal(overview.body.tasks[0].completionRate, 100); assert.equal(overview.body.ranking[0].displayName, '班级任务学生');
  const assignmentPage = await admin.get('/api/admin/assignments?page=1&pageSize=1').expect(200);
  assert.equal(assignmentPage.body.total, 1); assert.equal(assignmentPage.body.pages, 1); assert.equal(assignmentPage.body.rows.length, 1);
  assert.equal(memberId > 0 && outsiderId > 0, true);
  context.db.close();
});

test('paginates student and progress management lists on the server', async () => {
  const context = setup();
  for (let index = 1; index <= 25; index += 1) {
    context.db.prepare('INSERT INTO users (username, display_name, password_hash, is_active) VALUES (?, ?, ?, 1)').run(`page${index}`, `分页学生${index}`, 'test');
  }
  const admin = request.agent(context.app);
  await admin.post('/api/admin/login').send({ password: 'test-pass' }).expect(200);
  const users = await admin.get('/api/admin/users?page=2&pageSize=10').expect(200);
  assert.equal(users.body.total, 25); assert.equal(users.body.page, 2); assert.equal(users.body.rows.length, 10);
  const progress = await admin.get('/api/admin/progress/students?page=3&pageSize=10&q=分页学生').expect(200);
  assert.equal(progress.body.total, 25); assert.equal(progress.body.page, 3); assert.equal(progress.body.rows.length, 5);
  context.db.close();
});

test('rejects cross-origin state-changing requests', async () => {
  const context = setup();
  await request(context.app).post('/api/auth/register')
    .set('Origin', 'https://attacker.example').set('Host', 'classroom.local')
    .send({ username: 'student001', displayName: '小林', password: 'Classroom123' }).expect(403);
  context.db.close();
});

test('paginates the administrator list and clamps out-of-range pages', async () => {
  const context = setup();
  const admin = request.agent(context.app);
  await admin.post('/api/admin/login').send({ username: 'admin', password: 'test-pass' }).expect(200);
  const insert = context.db.prepare(`INSERT INTO admin_accounts
    (username, display_name, password_hash, role, is_active, created_at) VALUES (?, ?, 'x', 'manager', 1, ?)`);
  for (let index = 0; index < 25; index += 1) insert.run(`teacher${index}`, `老师${index}`, 1000 + index);

  const first = await admin.get('/api/admin/admins?pageSize=10').expect(200);
  assert.equal(first.body.total, 26, '25 个新建 + 内置超级管理员');
  assert.equal(first.body.pages, 3);
  assert.equal(first.body.rows.length, 10);

  const beyond = await admin.get('/api/admin/admins?page=99&pageSize=10').expect(200);
  assert.equal(beyond.body.page, 3, '越界页夹到最后一页');
  assert.equal(beyond.body.rows.length, 6);
  context.db.close();
});
