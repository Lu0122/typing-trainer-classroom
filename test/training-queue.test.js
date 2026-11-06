const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createDatabase } = require('../backend/database');
const { createApp } = require('../backend/app');
const { hashSessionToken } = require('../backend/auth');
const queueModule = import('../frontend/src/training-queue.mjs');
function storage() {
  const data = new Map();
  return { get length() { return data.size; }, key: i => [...data.keys()][i], getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: k => data.delete(k) };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test('offline record survives restart and retries with the same identifier', async () => {
  const { createTrainingQueue } = await queueModule;
  const store = storage(); let state, last, current = 1, timer;
  const queue = createTrainingQueue({storage: store, currentUserId: () => current, onChange: x => {state=x;}, send: async payload => {last=payload; throw new Error('offline');}, schedule: cb => {timer=cb;return 1;}, cancel: () => {timer=null;}, random:()=>0});
  queue.queue(1, { sourceKey:'practice:1:abc', mode:'beginner' }); await settle();
  assert.equal(state.count, 1); assert.equal(store.length, 1); assert.equal(last.sourceKey, 'practice:1:abc');
  queue.destroy();
  const calls=[]; const restored = createTrainingQueue({storage: store,currentUserId:()=>current,onChange:x=>{state=x;},send:async p=>calls.push(p),schedule:()=>1,cancel:()=>{}});
  restored.userChanged(); await settle();
  assert.equal(calls[0].sourceKey, 'practice:1:abc'); assert.equal(state.count,0); assert.equal(store.length,0);
  restored.destroy();
});

test('queues belonging to other students remain separate when the active user changes', async () => {
  const { createTrainingQueue } = await queueModule;
  const store = storage(); let user = 1; const calls=[];
  const q=createTrainingQueue({storage:store,currentUserId:()=>user,send:async (p,id)=>{calls.push([p.sourceKey,id]); throw Object.assign(new Error('expired'),{status:401});},schedule:()=>1,cancel:()=>{}});
  q.queue(1,{sourceKey:'one'}); await settle(); user=2; q.userChanged(); q.queue(2,{sourceKey:'two'}); await settle();
  assert.deepEqual(calls, [['one',1],['two',2]]); assert.equal(store.length,2); q.destroy();
});

test('unavailable storage is surfaced while the record remains in memory', async () => {
  const { createTrainingQueue } = await queueModule;
  let state; const broken={get length(){throw Error('denied');},setItem(){throw Error('denied');},removeItem(){throw Error('denied');}};
  const q=createTrainingQueue({storage:broken,currentUserId:()=>1,onChange:x=>{state=x;},send:async()=>{throw Error('offline');},schedule:()=>1,cancel:()=>{}});
  q.queue(1,{sourceKey:'one'}); await settle();
  assert.equal(state.storageProblem,true); assert.equal(state.count,1); q.destroy();
});

test('training submissions are idempotent and reject a different active account', async () => {
  const db=createDatabase(':memory:'); const now=Date.now();
  try {
    for (const id of [1,2]) {
      db.prepare('INSERT INTO users(id,username,display_name,password_hash,is_active) VALUES(?,?,?,?,1)').run(id,`student${id}`,`学生${id}`,'unused');
      db.prepare('INSERT INTO user_sessions VALUES(?,?,?,?)').run(hashSessionToken(`s${id}`),id,now,now+60000);
    }
    const app=createApp({db}); const body={expectedUserId:1,sourceKey:'practice:1:timeout-test',mode:'beginner',lessonTitle:'练习',correctChars:10,wrongChars:0,durationMs:10000};
    await request(app).post('/api/training-sessions').set('Cookie','typing_session=s2').send(body).expect(409);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM training_sessions').get().n,0);
    await request(app).post('/api/training-sessions').set('Cookie','typing_session=s1').send(body).expect(201);
    const duplicate=await request(app).post('/api/training-sessions').set('Cookie','typing_session=s1').send(body).expect(200);
    assert.equal(duplicate.body.duplicate,true); assert.equal(db.prepare('SELECT COUNT(*) n FROM training_sessions').get().n,1);
  } finally { db.close(); }
});

test('a lost response after the server commits is retried without a duplicate', async () => {
  const { createTrainingQueue } = await queueModule;
  const db=createDatabase(':memory:'); const now=Date.now();
  try {
    db.prepare('INSERT INTO users(id,username,display_name,password_hash,is_active) VALUES(?,?,?,?,1)').run(1,'retry-user','重试用户','unused');
    db.prepare('INSERT INTO user_sessions VALUES(?,?,?,?)').run(hashSessionToken('retry-token'),1,now,now+60000);
    const app=createApp({db}); let attempts=0, state;
    const q=createTrainingQueue({storage:storage(),currentUserId:()=>1,onChange:x=>{state=x;},schedule:()=>1,cancel:()=>{},send:async(payload,id)=>{
      const result=await request(app).post('/api/training-sessions').set('Cookie','typing_session=retry-token').send({...payload,expectedUserId:id});
      if (++attempts===1) throw new Error('response lost after commit');
      assert.equal(result.status,200); assert.equal(result.body.duplicate,true);
    }});
    q.queue(1,{sourceKey:'practice:1:lost-response',mode:'beginner',lessonTitle:'练习',correctChars:10,wrongChars:0,durationMs:10000});
    while (attempts < 1 || state.saving) await settle();
    assert.equal(state.count,1); q.retry();
    while (attempts < 2 || state.saving) await settle();
    assert.equal(state.count,0); assert.equal(db.prepare('SELECT COUNT(*) n FROM training_sessions').get().n,1); q.destroy();
  } finally { db.close(); }
});
