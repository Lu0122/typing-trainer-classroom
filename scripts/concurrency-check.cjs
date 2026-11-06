const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { performance, monitorEventLoopDelay } = require('node:perf_hooks');
const { createDatabase } = require('../backend/database');
const { createApp } = require('../backend/app');
const { hashSessionToken } = require('../backend/auth');
(async () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'typing-load-'));
  const db = createDatabase(path.join(folder, 'load.db'));
  const now = Date.now(), cookies = [];
  for (let i = 1; i <= 60; i++) {
    db.prepare('INSERT INTO users(id,username,display_name,password_hash,is_active) VALUES(?,?,?,?,1)').run(i, `load${i}`, `测试${i}`, 'unused');
    const token = `load-token-${i}`;
    db.prepare('INSERT INTO user_sessions VALUES(?,?,?,?)').run(hashSessionToken(token), i, now, now + 3600000);
    cookies.push(`typing_session=${token}`);
  }
  const server = createApp({ db }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const samples = {}, errors = {};
  async function call(name, route, cookie, body) {
    const start = performance.now();
    try {
      const response = await fetch(base + route, { method: body ? 'POST' : 'GET', headers: { cookie, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(10000) });
      await response.arrayBuffer();
      if (!response.ok) errors[`${name}:${response.status}`] = (errors[`${name}:${response.status}`] || 0) + 1;
      (samples[name] ||= []).push(performance.now() - start);
    } catch (e) { errors[`${name}:${e.name}`] = (errors[`${name}:${e.name}`] || 0) + 1; }
  }
  await Promise.all(cookies.map((cookie, i) => call('join', '/api/battle/join', cookie, {team:i % 2 ? 'red' : 'blue'})));
  const tasks = await Promise.all(cookies.map(async cookie => { const response = await fetch(base + '/api/battle/task', {headers:{cookie}}); return response.json(); }));
  const delay = monitorEventLoopDelay({resolution: 20}); delay.enable();
  const start = performance.now();
  for (let round = 0; round < 10; round++) {
    const requests = [];
    cookies.forEach((cookie, i) => {
      requests.push(call('battle', '/api/battle', cookie));
      requests.push(call('available', '/api/competitions/available', cookie));
      if (round < 5 && tasks[i].id && tasks[i].text) requests.push(call('characters', '/api/battle/characters', cookie, {ticket:tasks[i].id,text:tasks[i].text.slice(0, round + 1)}));
      if (round % 3 === 0) requests.push(call('training', '/api/training-sessions', cookie, {mode:'english-word', lessonTitle:'并发测试', correctChars:100, wrongChars:2, durationMs:60000, sourceKey:`load:${i}:${round}`, keyStats:[{keyCode:'KeyA',expectedCount:10,correctCount:9,wrongCount:1}]}));
    });
    await Promise.all(requests);
    await new Promise(resolve => setTimeout(resolve, Math.max(0, start + (round + 1) * 1000 - performance.now())));
  }
  delay.disable();
  const results = Object.fromEntries(Object.entries(samples).map(([key, rows]) => { rows.sort((a,b)=>a-b); return [key,{count:rows.length,p50:Math.round(rows[Math.floor(rows.length*.5)]),p95:Math.round(rows[Math.floor(rows.length*.95)]),max:Math.round(rows.at(-1))}]; }));
  const trainingRows = db.prepare("SELECT COUNT(*) AS n FROM training_sessions WHERE source_key LIKE 'load:%'").get().n;
  console.log(JSON.stringify({elapsedSeconds:Math.round((performance.now()-start)/100)/10,results,errors,trainingRows,loopP95Ms:Math.round(delay.percentile(95)/1e6),isolatedDatabase:folder}, null, 2));
  server.close(); db.close();
  if (Object.keys(errors).length || tasks.some(task => !task.id) || trainingRows !== 240) process.exitCode = 1;
})().catch(e=>{ console.error(e); process.exitCode=1; });
