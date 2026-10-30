const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createDatabase } = require('../backend/database');
const { createApp } = require('../backend/app');

function setup() {
  let currentTime = 1_700_000_000_000;
  const db = createDatabase(':memory:');
  const app = createApp({ db, adminPassword: 'test-pass', requireAccountApproval: false, now: () => currentTime });
  return { db, app, advance: (ms) => { currentTime += ms; } };
}

test('customer service challenge uses a fixed conversation contract and saves score results', async () => {
  const context = setup();
  const student = request.agent(context.app);
  await student.post('/api/auth/register').send({ displayName: '李小明', password: 'Classroom123' }).expect(201);
  const started = await student.post('/api/customer-service/start').send({}).expect(200);
  assert.equal(started.body.session.status, 'active');
  assert.equal(started.body.session.remainingMs, 180000);
  assert.equal(Array.isArray(started.body.session.scenario.suggestedReplies), true);
  const replied = await student.post('/api/customer-service/reply').send({ sessionId: started.body.session.id, reply: '您好，抱歉给您带来不便，我先为您核实订单，并在十分钟内反馈处理结果。' }).expect(200);
  assert.equal(replied.body.history.at(-1).role, 'customer');
  assert.equal(typeof replied.body.turn.resolved, 'boolean');
  const finished = await student.post('/api/customer-service/finish').send({ sessionId: started.body.session.id }).expect(200);
  assert.equal(typeof finished.body.result.totalScore, 'number');
  assert.equal(finished.body.result.replyCount, 1);
  const replay = await student.post('/api/customer-service/finish').send({ sessionId: started.body.session.id }).expect(200);
  assert.equal(replay.body.result.totalScore, finished.body.result.totalScore);
  context.db.close();
});

test('admin AI settings never return the API key and preserve it when omitted', async () => {
  const context = setup();
  const admin = request.agent(context.app);
  await admin.post('/api/admin/login').send({ username: 'admin', password: 'test-pass' }).expect(200);
  const saved = await admin.patch('/api/admin/ai-settings').send({ model: 'qwen-flash', apiKey: 'sk-secret', rolePrompt: '你是一名着急出差的消费者，优先关注换货时效。', enabled: true }).expect(200);
  assert.equal(saved.body.apiKeyConfigured, true);
  assert.equal('apiKey' in saved.body, false);
  assert.equal(saved.body.rolePrompt, '你是一名着急出差的消费者，优先关注换货时效。');
  const preserved = await admin.patch('/api/admin/ai-settings').send({ model: 'qwen3.8-max', enabled: false }).expect(200);
  assert.equal(preserved.body.apiKeyConfigured, true);
  assert.equal(preserved.body.enabled, false);
  assert.equal(preserved.body.rolePrompt, '你是一名着急出差的消费者，优先关注换货时效。');
  context.db.close();
});

test('AI passage generation requires an admin API key without exposing settings', async () => {
  const context = setup();
  const admin = request.agent(context.app);
  await admin.post('/api/admin/login').send({ username: 'admin', password: 'test-pass' }).expect(200);
  await admin.post('/api/admin/passages/generate').send({ title: '校园晨读', category: '校园生活' }).expect(400).expect((response) => {
    assert.match(response.body.message, /API Key/);
  });
  context.db.close();
});
