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
