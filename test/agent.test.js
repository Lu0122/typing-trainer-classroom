const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createDatabase } = require('../backend/database');
const { createApp } = require('../backend/app');
const { inspectReadOnlySql, executeReadOnlySql } = require('../backend/agent');

// 接口返回的 results 是「列 + 行」结构，测试里按列名还原成对象方便断言。
function rowsOf(view) {
  if (!view || !Array.isArray(view.columns)) return [];
  return (view.rows || []).map((row) => Object.fromEntries(view.columns.map((column, index) => [column, row[index]])));
}

function setup() {
  let currentTime = 1_700_000_000_000;
  const db = createDatabase(':memory:');
  const app = createApp({ db, adminPassword: 'test-pass', requireAccountApproval: false, now: () => currentTime });
  return { db, app, now: () => currentTime };
}

test('agent SQL guard only permits bounded read queries and hides protected fields', () => {
  const db = createDatabase(':memory:');
  db.prepare("INSERT INTO users(username, display_name, password_hash) VALUES ('student01', '张三', 'secret')").run();
  const result = executeReadOnlySql(db, 'SELECT id, display_name FROM users');
  assert.deepEqual(result.rows, [{ id: 1, display_name: '张三' }]);
  assert.throws(() => inspectReadOnlySql('DELETE FROM users'), /只允许执行 SELECT/);
  assert.throws(() => inspectReadOnlySql('SELECT * FROM users'), /显式指定查询字段/);
  assert.throws(() => inspectReadOnlySql('SELECT password_hash FROM users'), /受保护字段/);
  assert.throws(() => inspectReadOnlySql('SELECT id FROM users; DROP TABLE users'), /多语句/);
  db.close();
});

test('admin agent is protected and can query read-only management tools', async () => {
  const context = setup();
  await request(context.app).get('/api/admin/agent/tools').expect(401);
  const admin = request.agent(context.app);
  await admin.post('/api/admin/login').send({ username: 'admin', password: 'test-pass' }).expect(200);
  const tools = await admin.get('/api/admin/agent/tools').expect(200);
  assert.deepEqual(tools.body.tools.map((tool) => tool.name), ['query_sql', 'export_sql', 'overview', 'students', 'progress', 'export_progress', 'export_scores', 'export_competition_event', 'export_competition_result', 'classes', 'assignments', 'feedback', 'student_detail', 'class_overview', 'inactive_students', 'trend_compare', 'key_diagnosis', 'mode_accuracy', 'competition_results']);

  const imported = await admin.post('/api/admin/users/import').send({ text: '张三,20250101\n李四,20250102' }).expect(201);
  assert.equal(imported.body.imported, 2);
  const result = await admin.post('/api/admin/agent/chat').send({ message: '找出学生账号' }).expect(200);
  assert.equal(result.body.source, 'fallback');
  assert.equal(result.body.toolCalls[0].tool, 'students');
  assert.equal(result.body.results[0].total, 2);
  assert.equal(result.body.results[0].columns.includes('passwordHash'), false);
  assert.equal(context.db.prepare('SELECT COUNT(*) AS count FROM agent_audit_logs').get().count, 1);
  context.db.close();
});

test('admin agent analyzes progress and creates a filtered CSV export', async () => {
  const context = setup();
  const admin = request.agent(context.app);
  await admin.post('/api/admin/login').send({ username: 'admin', password: 'test-pass' }).expect(200);
  await admin.post('/api/admin/users/import').send({ text: '王小明,20250301' }).expect(201);
  const user = context.db.prepare('SELECT id FROM users WHERE display_name = ?').get('王小明');
  const createdClass = await admin.post('/api/admin/classes').send({ name: '25级1班', term: '2026-2027' }).expect(201);
  await admin.post(`/api/admin/classes/${createdClass.body.id}/members`).send({ studentIds: [user.id] }).expect(200);
  context.db.prepare(`INSERT INTO training_sessions (user_id, mode, lesson_title, correct_chars, wrong_chars, accuracy, speed, duration_ms, completed_at, is_finalized) VALUES (?, 'pinyin-article', '第一篇', 30, 5, 85.7, 30, 60000, ?, 1)`).run(user.id, context.now() - 86_400_000);
  context.db.prepare(`INSERT INTO training_sessions (user_id, mode, lesson_title, correct_chars, wrong_chars, accuracy, speed, duration_ms, completed_at, is_finalized) VALUES (?, 'pinyin-article', '第二篇', 50, 2, 96.2, 50, 60000, ?, 1)`).run(user.id, context.now());

  const progress = await admin.post('/api/admin/agent/chat').send({ message: '查看学习进步' }).expect(200);
  const progressRow = rowsOf(progress.body.results.find((item) => item.tool === 'progress')).find((row) => row.displayName === '王小明');
  assert.equal(progressRow.sessions, 2);
  assert.equal(progressRow.speedChange, 20);
  assert.equal(progressRow.accuracyChange, 10.5);

  const exported = await admin.post('/api/admin/agent/chat').send({ message: '导出25级1班学习进步数据' }).expect(200);
  const exportData = exported.body.results.find((item) => item.tool === 'export_progress');
  assert.equal(exportData.total, 1);
  const csv = await admin.get(exportData.downloadUrl).expect(200);
  assert.match(csv.headers['content-type'], /text\/csv/);
  assert.match(csv.text, /王小明/);
  assert.match(csv.text, /速度变化/);
  context.db.close();
});


// ------------------------------------------------------------ 补全的导出能力与审计查看

const { scoreRowsToCsv, formatStamp } = require('../backend/score-filters');

test('SQL 检查器：写操作、越权字段、注释、多语句、超大 LIMIT 全部拦住', () => {
  const rejected = [
    'DELETE FROM users', 'UPDATE users SET is_active = 0', 'INSERT INTO users (id) VALUES (1)',
    'REPLACE INTO users (id) VALUES (1)', 'DROP TABLE users', 'ALTER TABLE users ADD COLUMN x TEXT',
    'CREATE TABLE x (id INTEGER)', 'TRUNCATE TABLE users', 'PRAGMA table_info(users)', 'VACUUM',
    'ATTACH DATABASE "x.db" AS x', "SELECT load_extension('evil')", "SELECT readfile('/etc/passwd')",
    'SELECT * FROM users', 'SELECT u.* FROM users u', 'SELECT api_key_ciphertext FROM ai_settings',
    'SELECT token_hash FROM user_sessions', 'SELECT name FROM sqlite_master',
    'SELECT id FROM users; DELETE FROM users', 'SELECT id FROM users -- 注释', 'SELECT id FROM users /* x */',
    'SELECT id FROM users LIMIT 99999', 'SELECT id FROM users LIMIT 1e3',
    'WITH x AS (SELECT 1) SELECT id FROM users', 'SELECT id FROM users UNION SELECT id FROM admin_accounts',
    '', '   '
  ];
  for (const sql of rejected) assert.throws(() => inspectReadOnlySql(sql), undefined, `应当被拦截：${sql}`);
});

test('SQL 检查器：字符串里的关键字和分号不会误伤', () => {
  for (const sql of [
    "SELECT id FROM users WHERE display_name = 'delete'",
    "SELECT id FROM users WHERE display_name = 'a; DROP TABLE users'",
    'SELECT id, display_name FROM users',
    'SELECT COUNT(*) AS total FROM users'
  ]) {
    assert.equal(inspectReadOnlySql(sql).sql, sql.trim(), `应当放行：${sql}`);
  }
});

test('没有 LIMIT 的查询套上 500 行上限，有 LIMIT 的原样执行', () => {
  assert.match(inspectReadOnlySql('SELECT id FROM users').boundedSql, /LIMIT 500$/u);
  assert.equal(inspectReadOnlySql('SELECT id FROM users LIMIT 20').boundedSql, 'SELECT id FROM users LIMIT 20');
});

test('成绩 CSV：字符串时间戳不会再抛 Invalid time value', () => {
  // scores.created_at 是 SQLite CURRENT_TIMESTAMP 的字符串格式，new Date(Number(...)) 会得到 NaN。
  assert.equal(formatStamp('2026-10-28 13:46:04'), '2026-10-28 13:46:04');
  assert.equal(formatStamp(1_700_000_000_000), new Date(1_700_000_000_000).toISOString());
  assert.equal(formatStamp(null), '');
  const csv = scoreRowsToCsv([{
    nickname: '张三', username: 'student_1', studentId: '2025001', className: '25软件1班',
    score: 120, accuracy: 97, wrongChars: 3, passageTitle: '清晨的校园', createdAt: '2026-10-28 13:46:04'
  }]);
  assert.ok(csv.startsWith('\ufeff'), 'CSV 要带 BOM，Excel 打开才不乱码');
  const lines = csv.trim().split('\r\n');
  assert.equal(lines.length, 2);
  assert.match(lines[0], /姓名,账号,学号,班级/u);
  assert.match(lines[1], /张三,student_1,2025001,25软件1班,120,97%/u);
});

test('内置规则下，竞速成绩 / 打字比赛 / 学习进步三类导出都能给出下载地址', async () => {
  const context = setup();
  const admin = request.agent(context.app);
  await admin.post('/api/admin/login').send({ username: 'admin', password: 'test-pass' }).expect(200);
  await admin.post('/api/admin/users/import').send({ text: '李雷,20250201' }).expect(201);
  context.db.prepare('INSERT INTO scores (nickname, score, accuracy, wrong_chars, created_at) VALUES (?, ?, ?, ?, ?)')
    .run('李雷', 88, 96, 2, context.now());
  context.db.prepare('INSERT INTO competition_results (id, mode, ended_at, result_json) VALUES (?, ?, ?, ?)')
    .run('c1', 'personal', context.now(), JSON.stringify({ rows: [] }));

  const scores = await admin.post('/api/admin/agent/chat').send({ message: '导出竞速成绩' }).expect(200);
  const scoresResult = scores.body.results.find((item) => item.tool === 'export_scores');
  assert.ok(scoresResult, '导出竞速成绩应命中 export_scores，而不是让模型硬拼 SQL');
  assert.equal(scoresResult.total, 1);
  assert.match(scoresResult.downloadUrl, /^\/api\/admin\/scores\/export\?format=csv/u);

  const competition = await admin.post('/api/admin/agent/chat').send({ message: '导出最近一场比赛的成绩' }).expect(200);
  const competitionResult = competition.body.results.find((item) => item.tool === 'export_competition_result');
  assert.match(competitionResult.downloadUrl, /^\/api\/competition\/personal\/export\.csv/u);

  const progress = await admin.post('/api/admin/agent/chat').send({ message: '导出全部学生学习进步数据' }).expect(200);
  assert.ok(progress.body.results.find((item) => item.tool === 'export_progress'));
  context.db.close();
});

test('竞速成绩导出支持 format=csv，默认仍返回 JSON', async () => {
  const context = setup();
  const admin = request.agent(context.app);
  await admin.post('/api/admin/login').send({ username: 'admin', password: 'test-pass' }).expect(200);
  await admin.post('/api/admin/users/import').send({ text: '韩梅梅,20250401' }).expect(201);
  context.db.prepare('INSERT INTO scores (nickname, score, accuracy, wrong_chars, created_at) VALUES (?, ?, ?, ?, ?)')
    .run('韩梅梅', 99, 98, 1, context.now());

  const json = await admin.get('/api/admin/scores/export').expect(200);
  assert.equal(json.body.total, 1);
  assert.ok(Array.isArray(json.body.rows));

  const csv = await admin.get('/api/admin/scores/export?format=csv').expect(200);
  assert.match(csv.headers['content-type'], /text\/csv/u);
  assert.match(csv.headers['content-disposition'], /attachment/u);
  assert.ok(csv.text.startsWith('\ufeff'));
  assert.match(csv.text, /韩梅梅/);
  context.db.close();
});

test('审计接口只回摘要，下载令牌只认本人', async () => {
  const context = setup();
  const admin = request.agent(context.app);
  await admin.post('/api/admin/login').send({ username: 'admin', password: 'test-pass' }).expect(200);
  await admin.post('/api/admin/agent/chat').send({ message: '导出竞速成绩' }).expect(200);

  const logs = await admin.get('/api/admin/agent/logs').expect(200);
  assert.equal(logs.body.total, 1);
  const row = logs.body.rows[0];
  assert.equal(row.message, '导出竞速成绩');
  assert.equal(row.adminUsername, 'admin');
  assert.deepEqual(row.tools, ['export_scores']);
  assert.ok(row.reply.length <= 300, '回复摘要要截断，不能把整份结果发给前端');
  assert.equal(row.resultJson, undefined, '不应把整份结果 JSON 发给前端');

  await admin.get('/api/admin/agent/exports/sql.csv?token=forged').expect(404);
  await request(context.app).get('/api/admin/agent/logs').expect(401);
  context.db.close();
});

test('明确要导出时一定给下载链接：模型选错工具也能兜底', async () => {
  const context = setup();
  const admin = request.agent(context.app);
  await admin.post('/api/admin/login').send({ username: 'admin', password: 'test-pass' }).expect(200);
  await admin.post('/api/admin/users/import').send({ text: '赵六,20250501' }).expect(201);
  context.db.prepare('INSERT INTO scores (nickname, score, accuracy, wrong_chars, created_at) VALUES (?, ?, ?, ?, ?)')
    .run('赵六', 77, 95, 3, context.now());
  context.db.prepare('INSERT INTO competition_results (id, mode, ended_at, result_json) VALUES (?, ?, ?, ?)')
    .run('c9', 'personal', context.now(), JSON.stringify({ rows: [] }));

  // 内置规则路径已经覆盖；这里确认「导出」类问题一定带 downloadUrl（回归保护）
  for (const message of ['导出竞速成绩', '导出学习进步数据', '导出最近一场比赛的成绩']) {
    const body = await admin.post('/api/admin/agent/chat').send({ message }).expect(200);
    const withUrl = (body.body.results || []).filter((item) => item.downloadUrl);
    assert.ok(withUrl.length > 0, `「${message}」必须给出下载链接`);
  }
  context.db.close();
});

test('「姓李的」这类口语要能归一成可命中的关键词', () => {
  const { normalizeStudentKeyword, extractNameKeyword } = require('../backend/agent');
  assert.equal(normalizeStudentKeyword('姓李的'), '李');
  assert.equal(normalizeStudentKeyword('姓李的学生'), '李');
  assert.equal(normalizeStudentKeyword('查姓李的'), '李');
  assert.equal(normalizeStudentKeyword('学生李雷的'), '李雷');
  assert.equal(normalizeStudentKeyword('查一下王小明'), '王小明');
  assert.equal(normalizeStudentKeyword('李心源'), '李心源');
  assert.equal(normalizeStudentKeyword(''), '');

  assert.equal(extractNameKeyword('查姓李的'), '李');
  assert.equal(extractNameKeyword('姓李的学生有谁'), '李');
  assert.equal(extractNameKeyword('查一下王小明'), '王小明');
  assert.equal(extractNameKeyword('看看学生'), '');
  assert.equal(extractNameKeyword('导出竞速成绩'), '');
});

test('问「姓李的」能查到姓李的学生，不会因为空关键词退化成最近列表', async () => {
  const context = setup();
  const admin = request.agent(context.app);
  await admin.post('/api/admin/login').send({ username: 'admin', password: 'test-pass' }).expect(200);
  await admin.post('/api/admin/users/import').send({ text: '李雷,20250601\n李心源,20250602\n王五,20250603' }).expect(201);

  const body = await admin.post('/api/admin/agent/chat').send({ message: '查姓李的' }).expect(200);
  const students = body.body.results.find((item) => item.tool === 'students');
  assert.ok(students, '应当调用 students 工具');
  // 参数在 toolCalls 里（results 只回数据，不带 arguments）
  const call = body.body.toolCalls.find((item) => item.tool === 'students');
  assert.equal(call.arguments.q, '李', '关键词要归一成「李」，不能是整句或空');
  const names = rowsOf(students).map((row) => row.displayName);
  assert.deepEqual(names.sort(), ['李心源', '李雷'].sort());
  context.db.close();
});

test('工具结果回给前端的是「列 + 行」，不再下发原始 JSON', async () => {
  const context = setup();
  const admin = request.agent(context.app);
  await admin.post('/api/admin/login').send({ username: 'admin', password: 'test-pass' }).expect(200);
  await admin.post('/api/admin/users/import').send({ text: '孙七,20250701' }).expect(201);

  const body = await admin.post('/api/admin/agent/chat').send({ message: '查孙七' }).expect(200);
  const view = body.body.results.find((item) => item.tool === 'students');
  assert.ok(Array.isArray(view.columns) && view.columns.length > 0, '要有列名');
  assert.ok(Array.isArray(view.rows) && view.rows.length > 0, '要有行数据');
  assert.ok(view.rows.every((row) => Array.isArray(row)), '每行是值数组，不是对象');
  assert.equal(view.total, 1);
  assert.equal(view.data, undefined, '不应再把原始 data 下发');
  assert.equal(view.columns.length, view.rows[0].length, '列数与每行值数量要一致');
  context.db.close();
});

test('新增的三个工具：班级对比 / 未练习名单 / 学生详情', async () => {
  const context = setup();
  const admin = request.agent(context.app);
  await admin.post('/api/admin/login').send({ username: 'admin', password: 'test-pass' }).expect(200);
  await admin.post('/api/admin/users/import').send({ text: '周八,20250801\n吴九,20250802' }).expect(201);
  const user = context.db.prepare('SELECT id FROM users WHERE display_name = ?').get('周八');
  const created = await admin.post('/api/admin/classes').send({ name: '25级2班', term: '2026-2027' }).expect(201);
  await admin.post(`/api/admin/classes/${created.body.id}/members`).send({ studentIds: [user.id] }).expect(200);
  context.db.prepare(`INSERT INTO training_sessions (user_id, mode, lesson_title, correct_chars, wrong_chars, accuracy, speed, duration_ms, completed_at, is_finalized)
    VALUES (?, 'pinyin-article', '第一篇', 30, 5, 85.7, 30, 60000, ?, 1)`).run(user.id, context.now());

  const classes = await admin.post('/api/admin/agent/chat').send({ message: '各班对比' }).expect(200);
  const classView = classes.body.results.find((item) => item.tool === 'class_overview');
  assert.ok(classView, '应当命中 class_overview');
  const classRows = rowsOf(classView);
  const target = classRows.find((row) => row.className === '25级2班');
  assert.ok(target, '要能查到 25级2班');
  assert.equal(Number(target.classSize), 1, '班级人数');
  assert.equal(Number(target.activeStudents), 1, '有训练的人数');

  const inactive = await admin.post('/api/admin/agent/chat').send({ message: '谁最近没练习' }).expect(200);
  const inactiveView = inactive.body.results.find((item) => item.tool === 'inactive_students');
  assert.ok(inactiveView, '应当命中 inactive_students');
  const inactiveNames = rowsOf(inactiveView).map((row) => row.displayName);
  assert.ok(inactiveNames.includes('吴九'), '没练过的吴九要在名单里');
  assert.ok(!inactiveNames.includes('周八'), '刚练过的周八不该在名单里');

  const detail = await admin.post('/api/admin/agent/chat').send({ message: '查一下周八的详情' }).expect(200);
  const detailView = detail.body.results.find((item) => item.tool === 'student_detail');
  assert.ok(detailView, '应当命中 student_detail');
  const detailRow = rowsOf(detailView)[0];
  assert.equal(detailRow.displayName, '周八');
  assert.equal(Number(detailRow.sessions), 1);
  assert.match(String(detailRow.recentSummary), /第一篇/u);
  context.db.close();
});

test('趋势对比 / 错键诊断 / 模式准确率 / 比赛结果', async () => {
  const context = setup();
  const admin = request.agent(context.app);
  await admin.post('/api/admin/login').send({ username: 'admin', password: 'test-pass' }).expect(200);
  await admin.post('/api/admin/users/import').send({ text: '钱十,20250901' }).expect(201);
  const user = context.db.prepare('SELECT id FROM users WHERE display_name = ?').get('钱十');
  const day = 24 * 60 * 60 * 1000;
  const insertSession = context.db.prepare(`INSERT INTO training_sessions
    (user_id, mode, lesson_title, correct_chars, wrong_chars, accuracy, speed, duration_ms, completed_at, is_finalized)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`);
  const thisWeek = insertSession.run(user.id, 'pinyin-article', '本周练习', 30, 5, 80, 40, 60000, context.now() - day).lastInsertRowid;
  insertSession.run(user.id, 'english-word', '上周练习', 30, 5, 90, 60, 60000, context.now() - 9 * day);
  context.db.prepare(`INSERT INTO typing_key_stats
    (training_session_id, user_id, mode, key_code, expected_count, correct_count, wrong_count, actual_errors_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, '{}', ?)`).run(thisWeek, user.id, 'pinyin-article', 'KeyK', 10, 8, 2, context.now());
  context.db.prepare('INSERT INTO competition_results (id, mode, ended_at, result_json) VALUES (?, ?, ?, ?)')
    .run('cr1', 'personal', context.now(), JSON.stringify({ rows: [{ userId: user.id }, { userId: 99 }] }));
  context.db.prepare(`INSERT INTO competitions (id, name, kind, schedule, status, config_json, created_at, ended_at)
    VALUES (?, ?, ?, ?, ?, '{}', ?, ?)`).run('ce1', '期中打字赛', 'personal', 'manual', 'finished', context.now() - day, context.now() - day);

  const trend = await admin.post('/api/admin/agent/chat').send({ message: '本周比上周怎么样' }).expect(200);
  const trendView = trend.body.results.find((item) => item.tool === 'trend_compare');
  assert.ok(trendView, '应当命中 trend_compare');
  const trendRows = rowsOf(trendView);
  const sessionsRow = trendRows.find((row) => row.metric === '训练次数');
  assert.equal(Number(sessionsRow.current), 1, '本周 1 次');
  assert.equal(Number(sessionsRow.previous), 1, '上周 1 次');
  const dailyRow = trendRows.find((row) => row.metric === '按天分布');
  assert.match(String(dailyRow.current), /次/u);

  const keys = await admin.post('/api/admin/agent/chat').send({ message: '哪些键最容易打错' }).expect(200);
  const keyView = keys.body.results.find((item) => item.tool === 'key_diagnosis');
  assert.ok(keyView, '应当命中 key_diagnosis');
  assert.equal(rowsOf(keyView)[0].keyCode, 'KeyK');

  const modes = await admin.post('/api/admin/agent/chat').send({ message: '哪个模式准确率最低' }).expect(200);
  const modeView = modes.body.results.find((item) => item.tool === 'mode_accuracy');
  assert.ok(modeView, '应当命中 mode_accuracy');
  assert.equal(rowsOf(modeView)[0].mode, 'pinyin-article', '准确率 80% 的排前面');

  const results = await admin.post('/api/admin/agent/chat').send({ message: '最近的比赛结果' }).expect(200);
  const resultView = results.body.results.find((item) => item.tool === 'competition_results');
  assert.ok(resultView, '应当命中 competition_results');
  const resultRows = rowsOf(resultView);
  assert.ok(resultRows.some((row) => row.kind === '打字比赛' && Number(row.players) === 2));
  assert.ok(resultRows.some((row) => row.kind === '比赛赛事' && row.name === '期中打字赛'));
  context.db.close();
});

test('会话：第一句话建会话，后续追问进同一个，刷新能读回，可删除', async () => {
  const context = setup();
  const admin = request.agent(context.app);
  await admin.post('/api/admin/login').send({ username: 'admin', password: 'test-pass' }).expect(200);
  await admin.post('/api/admin/users/import').send({ text: '郑十一,20251001' }).expect(201);

  const first = await admin.post('/api/admin/agent/chat').send({ message: '查郑十一' }).expect(200);
  const conversationId = first.body.conversationId;
  assert.ok(conversationId, '第一句话要建会话');

  const list = await admin.get('/api/admin/agent/conversations').expect(200);
  assert.equal(list.body.rows.length, 1);
  assert.equal(list.body.rows[0].id, conversationId);
  assert.match(list.body.rows[0].title, /查郑十一/u);
  assert.equal(list.body.rows[0].messageCount, 1);

  await admin.post('/api/admin/agent/chat').send({ message: '本周比上周怎么样', conversationId }).expect(200);
  const detail = await admin.get(`/api/admin/agent/conversations/${conversationId}`).expect(200);
  assert.equal(detail.body.messages.length, 4, '两轮 = 2 条提问 + 2 条回答');
  assert.equal(detail.body.messages[0].role, 'user');
  assert.equal(detail.body.messages[1].role, 'assistant');
  assert.ok(Array.isArray(detail.body.messages[1].results), '回答要带明细，刷新后表格还能重建');

  await admin.delete(`/api/admin/agent/conversations/${conversationId}`).expect(200);
  const after = await admin.get('/api/admin/agent/conversations').expect(200);
  assert.equal(after.body.rows.length, 0);
  await admin.get(`/api/admin/agent/conversations/${conversationId}`).expect(404);
  context.db.close();
});

test('结果带中文表头，前端不用再显示英文字段名', async () => {
  const context = setup();
  const admin = request.agent(context.app);
  await admin.post('/api/admin/login').send({ username: 'admin', password: 'test-pass' }).expect(200);
  await admin.post('/api/admin/users/import').send({ text: '冯十二,20251101' }).expect(201);

  const body = await admin.post('/api/admin/agent/chat').send({ message: '查冯十二' }).expect(200);
  const view = body.body.results.find((item) => item.tool === 'students');
  assert.ok(Array.isArray(view.labels), '要有中文表头');
  assert.ok(view.labels.includes('姓名'));
  assert.ok(view.labels.includes('学号'));
  assert.ok(!view.labels.includes('displayName'), '不该把英文字段名直接给界面');
  assert.equal(view.labels.length, view.columns.length);
  context.db.close();
});

test('流式接口：推 SSE 事件，不再返回一坨 JSON', async () => {
  const context = setup();
  const admin = request.agent(context.app);
  await admin.post('/api/admin/login').send({ username: 'admin', password: 'test-pass' }).expect(200);
  await admin.post('/api/admin/users/import').send({ text: '钱十三,20251201' }).expect(201);

  const res = await admin.post('/api/admin/agent/chat?stream=1').send({ message: '查钱十三' }).expect(200);
  assert.match(res.headers['content-type'], /text\/event-stream/u);
  assert.match(res.text, /event: meta/u);
  assert.match(res.text, /event: done/u);

  const doneBlock = res.text.split('\n\n').find((block) => block.includes('event: done'));
  const payload = JSON.parse(doneBlock.split('data: ')[1]);
  assert.ok(payload.conversationId, 'done 里要带会话 id');
  assert.ok(String(payload.reply).length > 0, 'done 里要带完整回答');
  assert.ok(Array.isArray(payload.downloads), 'done 里要带下载链接');
  context.db.close();
});

test('名单类结果不再被截到 5 行：12 个学生要全部交出去', async () => {
  const context = setup();
  const admin = request.agent(context.app);
  await admin.post('/api/admin/login').send({ username: 'admin', password: 'test-pass' }).expect(200);
  const lines = Array.from({ length: 12 }, (_, i) => `测试学生${String(i + 1).padStart(2, '0')},20260${String(i + 1).padStart(3, '0')}`).join('\n');
  await admin.post('/api/admin/users/import').send({ text: lines }).expect(201);

  const body = await admin.post('/api/admin/agent/chat').send({ message: '谁最近没练习' }).expect(200);
  const view = body.body.results.find((item) => item.tool === 'inactive_students');
  assert.ok(view, '应当命中 inactive_students');
  // 原来回答阶段只把前 5 行交给模型，模型只能说「显示了前 5 位」，名单被吃掉一半。
  assert.equal(view.rows.length, 12, '12 个学生都要在 rows 里，不能只给前几行');
  assert.equal(view.total, 12);
  assert.equal(view.rows.length, view.total, 'rows 行数等于 total 时就是完整数据');
  context.db.close();
});

test('流式接口推 progress 事件，界面才知道在查什么', async () => {
  const context = setup();
  const admin = request.agent(context.app);
  await admin.post('/api/admin/login').send({ username: 'admin', password: 'test-pass' }).expect(200);
  await admin.post('/api/admin/users/import').send({ text: '进度同学,20260901' }).expect(201);

  const res = await admin.post('/api/admin/agent/chat?stream=1').send({ message: '谁最近没练习' }).expect(200);
  assert.match(res.text, /event: meta/u);
  assert.match(res.text, /event: progress/u, '查完数据要推一条进度，别让界面干等');
  const progressBlock = res.text.split('\n\n').find((block) => block.includes('event: progress'));
  const payload = JSON.parse(progressBlock.split('data: ')[1]);
  assert.match(payload.text, /查到 1 条数据/u);
  assert.match(res.text, /event: done/u);
  context.db.close();
});

test('问「未分班的账号」查的是学生名单，不是班级列表', async () => {
  const context = setup();
  const admin = request.agent(context.app);
  await admin.post('/api/admin/login').send({ username: 'admin', password: 'test-pass' }).expect(200);
  await admin.post('/api/admin/users/import').send({ text: '分班甲,20270101\n分班乙,20270102\n游离丙,20270103' }).expect(201);
  const created = await admin.post('/api/admin/classes').send({ name: '25级1班', term: '2026-2027' }).expect(201);
  const ids = context.db.prepare("SELECT id FROM users WHERE display_name IN ('分班甲','分班乙')").all().map((row) => row.id);
  await admin.post(`/api/admin/classes/${created.body.id}/members`).send({ studentIds: ids }).expect(200);

  // 以前这条问题会被「分班」两个字带去调 classes（返回班级列表），
  // 模型拿着班级名回答「没有查到未分班账号」。
  const body = await admin.post('/api/admin/agent/chat').send({ message: '有哪些未分班的账号' }).expect(200);
  const view = body.body.results.find((item) => item.tool === 'students');
  assert.ok(view, '必须用 students 查名单，不能拿 classes 的班级列表糊弄');
  assert.equal(view.total, 1, '只有游离丙没分班');
  assert.equal(rowsOf(view)[0].displayName, '游离丙');

  // 「未分班的学生有几个」这种带「几个」的问法也不能被班级分支抢走
  const count = await admin.post('/api/admin/agent/chat').send({ message: '未分班的学生有几个' }).expect(200);
  assert.ok(count.body.results.find((item) => item.tool === 'students'));
  context.db.close();
});

test('问「某班有哪些学生」要的是名单，不是班级人数', async () => {
  const context = setup();
  const admin = request.agent(context.app);
  await admin.post('/api/admin/login').send({ username: 'admin', password: 'test-pass' }).expect(200);
  await admin.post('/api/admin/users/import').send({ text: '名单甲,20270201\n名单乙,20270202\n名单丙,20270203' }).expect(201);
  const created = await admin.post('/api/admin/classes').send({ name: '25软件技术1班', term: '2026-2027' }).expect(201);
  const ids = context.db.prepare("SELECT id FROM users WHERE display_name IN ('名单甲','名单乙')").all().map((row) => row.id);
  await admin.post(`/api/admin/classes/${created.body.id}/members`).send({ studentIds: ids }).expect(200);

  // 班名里没有「级」字，原来那条 /[0-9]+级…班/ 的正则认不出来，会退化成「最近 10 个学生」。
  const body = await admin.post('/api/admin/agent/chat').send({ message: '25软件技术1班有哪些学生' }).expect(200);
  const view = body.body.results.find((item) => item.tool === 'students');
  assert.ok(view, '应当命中 students');
  assert.equal(view.total, 2, '只返回这个班的两个人');
  const names = rowsOf(view).map((row) => row.displayName).sort();
  assert.deepEqual(names, ['名单乙', '名单甲'].sort());

  // 问人数还是走 classes
  const count = await admin.post('/api/admin/agent/chat').send({ message: '25软件技术1班有几个学生' }).expect(200);
  assert.ok(count.body.results.find((item) => item.tool === 'classes'));
  context.db.close();
});

test('管理员不能读取、续写或删除其他管理员的助手会话', async () => {
  const context = setup();
  const owner = request.agent(context.app), other = request.agent(context.app);
  try {
    await owner.post('/api/admin/login').send({username:'admin',password:'test-pass'}).expect(200);
    await owner.post('/api/admin/admins').send({username:'teacher01',displayName:'李老师',password:'abc123',role:'manager'}).expect(201);
    await other.post('/api/admin/login').send({username:'teacher01',password:'abc123'}).expect(200);
    const first = await owner.post('/api/admin/agent/chat').send({message:'查看概览'}).expect(200);
    const id = first.body.conversationId;
    assert.ok(id);
    assert.equal((await other.get('/api/admin/agent/conversations').expect(200)).body.rows.length, 0);
    await other.get(`/api/admin/agent/conversations/${id}`).expect(404);
    await other.post('/api/admin/agent/chat').send({message:'继续',conversationId:id}).expect(404);
    await other.delete(`/api/admin/agent/conversations/${id}`).expect(404);
    await other.post('/api/admin/agent/chat').send({message:'继续',conversationId:999999}).expect(404);
    const legacy = context.db.prepare("INSERT INTO agent_conversations (admin_id,title,created_at,updated_at) VALUES (NULL,'旧对话',?,?)").run(context.now(),context.now()).lastInsertRowid;
    assert.ok((await other.get('/api/admin/agent/conversations').expect(200)).body.rows.some(row => row.id === legacy));
    await other.get(`/api/admin/agent/conversations/${legacy}`).expect(200);
    await other.post('/api/admin/agent/chat').send({message:'继续',conversationId:legacy}).expect(200);
    await other.delete(`/api/admin/agent/conversations/${legacy}`).expect(200);
    const detail = await owner.get(`/api/admin/agent/conversations/${id}`).expect(200);
    assert.equal(detail.body.messages.length, 2);
    await owner.post('/api/admin/agent/chat').send({message:'继续',conversationId:id}).expect(200);
    await owner.delete(`/api/admin/agent/conversations/${id}`).expect(200);
  } finally { context.db.close(); }
});
