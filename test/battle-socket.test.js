const test = require('node:test');
const assert = require('node:assert/strict');
const WebSocket = require('ws');
const { createDatabase } = require('../backend/database');
const { createApp } = require('../backend/app');
const { hashSessionToken } = require('../backend/auth');
const { attachBattleSocket } = require('../backend/battle-socket');

test('battle stream authenticates, restores authoritative state and revokes invalid sessions', async () => {
  const db = createDatabase(':memory:');
  const now = Date.now();
  db.prepare('INSERT INTO users(id, username, display_name, password_hash, is_active) VALUES(1, ?, ?, ?, 1)').run('stream-user', '测试学生', 'unused');
  const token = 'stream-test-token';
  db.prepare('INSERT INTO user_sessions VALUES(?,?,?,?)').run(hashSessionToken(token), 1, now, now + 60000);
  const app = createApp({ db });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const port = server.address().port, base = `http://127.0.0.1:${port}`;
  const channel = attachBattleSocket(server, { app, db, intervalMs: 30, heartbeatMs: 100 });
  const connect = (cookie, origin = base) => new WebSocket(`ws://127.0.0.1:${port}/api/battle/stream`, { headers: { cookie, origin } });
  async function rejected(ws) { return new Promise(resolve => { ws.once('error', () => resolve(true)); ws.once('open', () => resolve(false)); }); }
  try {
    assert.equal(await rejected(connect('')), true);
    assert.equal(await rejected(connect(`typing_session=${token}`, 'http://malicious.example')), true);
    const joined = await fetch(`${base}/api/battle/join`, { method: 'POST', headers: { cookie: `typing_session=${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ team: 'red' }) });
    assert.equal(joined.status, 200);
    const ws = connect(`typing_session=${token}`);
    const message = await new Promise((resolve, reject) => { ws.once('message', data => resolve(JSON.parse(data.toString()))); ws.once('error', reject); });
    assert.equal(message.type, 'state');
    assert.equal(message.data.me.id, 1);
    assert.equal(message.data.me.team, 'red');
    ws.terminate();
    const reconnect = connect(`typing_session=${token}`);
    const restored = await new Promise((resolve, reject) => { reconnect.once('message', data => resolve(JSON.parse(data.toString()))); reconnect.once('error', reject); });
    assert.equal(restored.data.me.id, 1);
    const closed = new Promise(resolve => reconnect.once('close', resolve));
    db.prepare('DELETE FROM user_sessions WHERE token_hash = ?').run(hashSessionToken(token));
    await closed;
    assert.equal(await rejected(connect(`typing_session=${token}`)), true);
  } finally {
    channel.close();
    await new Promise(resolve => server.close(resolve));
    db.close();
  }
});

test('sixty students receive personalized room snapshots and shutdown closes connections', async () => {
  const db = createDatabase(':memory:');
  const app = createApp({ db });
  const now = Date.now();
  for (let i = 1; i <= 60; i++) {
    db.prepare('INSERT INTO users(id,username,display_name,password_hash,is_active) VALUES(?,?,?,?,1)').run(i, `s${i}`, `同学${i}`, 'unused');
    db.prepare('INSERT INTO user_sessions VALUES(?,?,?,?)').run(hashSessionToken(`token-${i}`), i, now, now + 60000);
  }
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const port = server.address().port, base = `http://127.0.0.1:${port}`;
  const channel = attachBattleSocket(server, { app, db, intervalMs: 100, heartbeatMs: 500 });
  const clients = [];
  try {
    await Promise.all(Array.from({length:60}, async (_, j) => {
      const id = j + 1, cookie = `typing_session=token-${id}`;
      const response = await fetch(`${base}/api/battle/join`, { method:'POST', headers:{cookie, 'content-type':'application/json'}, body: JSON.stringify({team: id % 2 ? 'red' : 'blue'}) });
      assert.equal(response.status, 200);
      const ws = new WebSocket(`ws://127.0.0.1:${port}/api/battle/stream`, { headers: { cookie, origin:base } });
      clients.push(ws);
      const message = await new Promise((resolve, reject) => { ws.once('message', data => resolve(JSON.parse(data.toString()))); ws.once('error', reject); });
      assert.equal(message.data.me.id, id);
    }));
    assert.equal(clients.length, 60);
    const closed = clients.map(ws => new Promise(resolve => ws.once('close', resolve)));
    channel.close();
    await Promise.all(closed);
  } finally {
    for (const ws of clients) ws.terminate();
    await new Promise(resolve => server.close(resolve));
    db.close();
  }
});
