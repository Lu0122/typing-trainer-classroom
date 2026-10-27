const test=require('node:test');
const assert=require('node:assert/strict');
const request=require('supertest');
const {createDatabase}=require('../backend/database');
const {createApp}=require('../backend/app');
const {hashSessionToken}=require('../backend/auth');
test('60 authenticated clients share one match; attack and result persist through real routes',async()=>{
 const db=createDatabase(':memory:');let time=100000;
 const app=createApp({db,now:()=>time});
 try{
  const cookies=[];
  for(let i=1;i<=60;i++){
   db.prepare('INSERT INTO users(id,username,display_name,password_hash,is_active) VALUES(?,?,?,?,1)').run(i,'load'+i,'同学'+i,'unused');
   const token='test-session-'+i;db.prepare('INSERT INTO user_sessions VALUES(?,?,?,?)').run(hashSessionToken(token),i,time,time+999999);
   cookies.push('typing_session='+token);
  }
  await request(app).get('/api/battle').expect(401);
  await Promise.all(cookies.map((cookie,i)=>request(app).post('/api/battle/join').set('Cookie',cookie).send({team:i%2?'blue':'red'}).expect(200)));
  const states=await Promise.all(cookies.map(cookie=>request(app).get('/api/battle').set('Cookie',cookie).expect(200)));
  assert.equal(new Set(states.map(s=>s.body.round)).size,1);assert.equal(states[0].body.online,60);
  for(let i=0;i<50;i++){
   await Promise.all(cookies.map(cookie=>request(app).get('/api/battle').set('Cookie',cookie).expect(200)));
   const t=await request(app).get('/api/battle/task').set('Cookie',cookies[0]).expect(200);time+=3000;
   await request(app).post('/api/battle/attack').set('Cookie',cookies[0]).send({ticket:t.body.id,text:t.body.text}).expect(200);
  }
  const final=await request(app).get('/api/battle').set('Cookie',cookies[1]).expect(200);
  assert.equal(final.body.result.winner,'red');assert.equal(final.body.result.teams.red[0].id,1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM battle_results').get().n,1);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM training_sessions WHERE mode = 'battle'").get().n,1);
 }finally{db.close();}
});

test('referee controls a separate timed territory competition',async()=>{
 const db=createDatabase(':memory:');let time=100000;
 const app=createApp({db,now:()=>time,adminPassword:'test-pass',requireAccountApproval:false});
 try{
  const admin=request.agent(app);
  await admin.post('/api/admin/login').send({password:'test-pass'}).expect(200);
  const cookies=[];
  for(let i=1;i<=2;i++){
   db.prepare('INSERT INTO users(id,username,display_name,password_hash,is_active) VALUES(?,?,?,?,1)').run(i,'match'+i,'选手'+i,'unused');
   const token='competition-session-'+i;
   db.prepare('INSERT INTO user_sessions VALUES(?,?,?,?)').run(hashSessionToken(token),i,time,time+999999);
   cookies.push('typing_session='+token);
  }
  await request(app).post('/api/battle/competition/referee/start').expect(401);
  await admin.post('/api/battle/competition/referee/prepare').send({durationMs:30000}).expect(200);
  await request(app).post('/api/battle/competition/join').set('Cookie',cookies[0]).send({team:'red'}).expect(200);
  const joined=await request(app).post('/api/battle/competition/join').set('Cookie',cookies[1]).send({team:'blue'}).expect(200);
  assert.equal(joined.body.phase,'waiting');
  const board=await request(app).get('/api/battle/competition/board').expect(200);
  assert.equal(board.body.me,null);
  assert.equal(board.body.online,2);
  const countdown=await admin.post('/api/battle/competition/referee/start').expect(200);
  assert.equal(countdown.body.phase,'countdown');
  await request(app).get('/api/battle/competition/task').set('Cookie',cookies[0]).expect(400);
  time+=5000;
  const ticket=await request(app).get('/api/battle/competition/task').set('Cookie',cookies[0]).expect(200);
  await request(app).post('/api/battle/competition/characters').set('Cookie',cookies[0]).send({ticket:ticket.body.id,text:ticket.body.text.slice(0,6)}).expect(200);
  time+=30001;
  const finished=await admin.get('/api/battle/competition/referee').expect(200);
  assert.equal(finished.body.result.winner,'red');
  assert.ok(finished.body.result.red>50);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM battle_results').get().n,1);
 }finally{db.close();}
});

test('territory competition API accepts mistakes, counts accuracy, and resumes attacks after the wrong position',async()=>{
 const db=createDatabase(':memory:');let time=100000;
 const app=createApp({db,now:()=>time,adminPassword:'test-pass',requireAccountApproval:false});
 try{
  const admin=request.agent(app);await admin.post('/api/admin/login').send({password:'test-pass'}).expect(200);
  const cookies=[];
  for(let i=1;i<=2;i++){
   db.prepare('INSERT INTO users(id,username,display_name,password_hash,is_active) VALUES(?,?,?,?,1)').run(i,'mistake'+i,'选手'+i,'unused');
   const token='mistake-session-'+i;db.prepare('INSERT INTO user_sessions VALUES(?,?,?,?)').run(hashSessionToken(token),i,time,time+999999);cookies.push('typing_session='+token);
  }
  await admin.post('/api/battle/competition/referee/prepare').send({durationMs:30000}).expect(200);
  await request(app).post('/api/battle/competition/join').set('Cookie',cookies[0]).send({team:'red'}).expect(200);
  await request(app).post('/api/battle/competition/join').set('Cookie',cookies[1]).send({team:'blue'}).expect(200);
  await admin.post('/api/battle/competition/referee/start').expect(200);time+=5000;
  const t=await request(app).get('/api/battle/competition/task').set('Cookie',cookies[0]).expect(200);
  const miss=await request(app).post('/api/battle/competition/characters').set('Cookie',cookies[0]).send({ticket:t.body.id,text:'x'}).expect(200);
  assert.equal(miss.body.inputRules.allowMistakes,true);assert.equal(miss.body.me.combo,0);assert.equal(miss.body.me.attempted,1);assert.equal(miss.body.event,0);
  const hit=await request(app).post('/api/battle/competition/characters').set('Cookie',cookies[0]).send({ticket:t.body.id,text:'x'+t.body.text.slice(1,5)}).expect(200);
  assert.equal(hit.body.me.correct,4);assert.equal(hit.body.me.attempted,5);assert.equal(hit.body.me.combo,4);assert.equal(hit.body.players.find(p=>p.id===1).accuracy,80);
  const restored=await request(app).get('/api/battle/competition/task').set('Cookie',cookies[0]).expect(200);
  assert.equal(restored.body.typed,'x'+t.body.text.slice(1,5));
  time+=30001;
  const finished=await request(app).get('/api/battle/competition').set('Cookie',cookies[0]).expect(200);
  assert.equal(finished.body.result.teams.red[0].accuracy,80);assert.equal(finished.body.result.teams.red[0].correct,4);
 }finally{db.close();}
});
