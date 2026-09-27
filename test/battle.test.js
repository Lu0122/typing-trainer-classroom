const test=require('node:test');
const assert=require('node:assert/strict');
const {Battle}=require('../src/battle');
function setup(){let time=100000;const saved=[];const b=new Battle({now:()=>time,save:r=>saved.push(r)});return {b,saved,advance:n=>{time+=n;},join:(id,team)=>b.join({id,displayName:'同学'+id},team)};}
test('single room starts automatically with two players even on same side',()=>{
 const {b,join}=setup();assert.equal(join(1,'red').phase,'waiting');const s=join(2,'red');assert.equal(s.phase,'running');assert.equal(s.teams.red.count,1);assert.equal(s.teams.blue.count,1);
});
test('gives every player the same ordered task queue while preserving slower progress',()=>{
 const {b,join,advance}=setup();join(1,'red');join(2,'blue');
 const first=b.task(1);const second=b.task(2);
 assert.equal(first.sequence,1);assert.equal(second.sequence,1);assert.equal(first.total,second.total);assert.equal(first.text,second.text);assert.equal(first.kind,second.kind);
 advance(10000);b.attack(1,{ticket:first.id,text:first.text});
 const fastNext=b.task(1);const slowStill=b.task(2);
 assert.equal(fastNext.sequence,2);assert.notEqual(fastNext.text,first.text);assert.equal(slowStill.sequence,1);assert.equal(slowStill.text,first.text);assert.equal(slowStill.id,second.id);
});
test('keeps supplying numbered tasks until the battle ends',()=>{
 const {b,join}=setup();join(1,'red');join(2,'blue');let first;
 for(let i=0;i<12;i++){
  const current=b.task(1); if(i===0) first=current;
  assert.equal(current.sequence,i+1);assert.equal(current.total,null);
  b.advance(1,{ticket:current.id,text:current.text});
 }
 const next=b.task(1);assert.equal(next.sequence,13);assert.equal(next.text,first.text);assert.equal(b.state(1).phase,'running');
});
test('entering a complete line advances without creating an attack',()=>{
 const {b,join}=setup();join(1,'red');join(2,'blue');
 const task=b.task(1);const state=b.advance(1,{ticket:task.id,text:task.text});
 assert.equal(state.me.attacks,0);assert.equal(state.me.correct,0);assert.match(state.notice,/不产生攻击/);
 const next=b.task(1);assert.equal(next.sequence,2);assert.notEqual(next.id,task.id);
});
test('a complete line with errors can advance, but only correct characters create attacks',()=>{
 const {b,join}=setup();join(1,'red');join(2,'blue');
 const task=b.task(1);const wrong=`x${task.text.slice(1)}`;const state=b.advance(1,{ticket:task.id,text:wrong});
 assert.equal(state.me.attacks,0);assert.equal(state.me.correct,0);assert.equal(state.me.team,'red');
 assert.equal(b.task(1).sequence,2);
});
test('explicitly leaving removes only that player; rejoining starts that player fresh',()=>{
 const {b,join}=setup();join(1,'red');join(2,'blue');const first=b.task(1);b.attackCharacter(1,{ticket:first.id,text:first.text[0]});
 assert.equal(b.leave(1),true);assert.equal(b.state(2).online,1);
 const rejoined=b.join({id:1,displayName:'同学1'},'red');assert.equal(rejoined.phase,'running');assert.equal(rejoined.me.attacks,0);assert.equal(rejoined.me.correct,0);
 const fresh=b.task(1);assert.equal(fresh.sequence,1);assert.equal(fresh.progress,0);
});
test('60 players, capacity limit, 30 second balance and ticket invalidation',()=>{
 const {b,join,advance}=setup();for(let i=1;i<=60;i++)join(i,i===2?'blue':'red');assert.equal(b.state(1).online,60);assert.throws(()=>join(61,'blue'),/满/);
 const ticket=b.task(1);advance(10000);for(let i=1;i<=60;i++)b.state(i);advance(10000);for(let i=1;i<=60;i++)b.state(i);advance(10001);const s=b.state(1);assert.equal(s.teams.red.count,30);assert.equal(s.teams.blue.count,30);assert.throws(()=>b.attack(1,{ticket:ticket.id,text:ticket.text}),/失效/);
});
test('correct typing attacks once; conquest saves both rankings and starts next match automatically',()=>{
 const {b,join,advance,saved}=setup();join(1,'red');join(2,'blue');
 const first=b.task(1);assert.throws(()=>b.attack(1,{ticket:first.id,text:first.text}),/过快/);advance(3000);assert.throws(()=>b.attack(1,{ticket:first.id,text:'错误'}),/正确/);
 const attacked=b.attack(1,{ticket:first.id,text:first.text});assert.equal(attacked.territory.columns,36);assert.equal(attacked.territory.rows,18);assert.equal(attacked.lastAttack.team,'red');assert.ok(attacked.lastAttack.captured.length>=2);assert.throws(()=>b.attack(1,{ticket:first.id,text:first.text}),/失效/);
 for(let i=1;i<50;i++){b.state(2);const task=b.task(1);advance(3000);b.attack(1,{ticket:task.id,text:task.text});}
 const s=b.state(1);assert.equal(s.phase,'finished');assert.equal(s.result.winner,'red');assert.equal(s.result.teams.red[0].id,1);assert.equal(s.result.teams.red[0].attacks,50);assert.equal(s.territory.redCells,648);assert.ok(s.territory.frontier.every(columns=>columns===36));assert.equal(saved.length,1);
 const round=s.round;advance(10000);b.state(1);b.state(2);advance(10001);assert.equal(b.state(1).phase,'running');assert.notEqual(b.round,round);
});
test('broadcasts a prominent performance update when a segment sets the round best',()=>{
 const {b,join,advance}=setup();join(1,'red');join(2,'blue');
 const task=b.task(1);advance(10000);const state=b.attack(1,{ticket:task.id,text:task.text});
 const broadcast=state.broadcasts.at(-1);
 assert.equal(broadcast.team,'red');assert.match(broadcast.title,/刷新本局最快段落/);assert.match(broadcast.detail,/第 1 段用时/);assert.match(broadcast.detail,/字\/分/);
});
test('each correct character triggers a lighter attack and keeps the same task',()=>{
 const {b,join}=setup();join(1,'red');join(2,'blue');
 const task=b.task(1);const first=task.text[0];const state=b.attackCharacter(1,{ticket:task.id,text:first});
 assert.equal(state.me.attacks,1);assert.equal(state.lastAttack.power,0.15);assert.equal(state.lastAttack.playerId,1);assert.equal(b.task(1).progress,1);
 assert.throws(()=>b.attackCharacter(1,{ticket:task.id,text:first+'x'}),/字符/);
});

test('accepts a short correct prefix as one batched attack request',()=>{
 const {b,join}=setup();join(1,'red');join(2,'blue');
 const task=b.task(1);const prefix=task.text.slice(0,4);const state=b.attackCharacters(1,{ticket:task.id,text:prefix});
 assert.equal(state.me.attacks,4);assert.equal(state.me.correct,4);assert.equal(state.lastAttack.characters,4);assert.equal(state.lastAttack.power,0.6);assert.equal(b.task(1).progress,4);
});
test('combo ramps up conquest power and exposes the tier to clients',()=>{
 const {b,join}=setup();join(1,'red');join(2,'blue');
 // 连击 1—4 为基础威力，每字 0.15。
 const task=b.task(1);const send=n=>b.attackCharacters(1,{ticket:task.id,text:task.text.slice(0,n)});
 const state=send(4);
 assert.equal(state.lastAttack.multiplier,1);assert.equal(state.lastAttack.power,0.6);assert.equal(state.me.combo,4);
 // 第 5 个字进入 1.5 倍档：新增的 3 个字各按 1.5 倍结算。
 const boosted=send(7);
 assert.equal(boosted.me.combo,7);assert.equal(boosted.lastAttack.multiplier,1.5);
 assert.equal(boosted.lastAttack.power,Math.round(0.15*1.5*3*1000)/1000);
 assert.equal(boosted.lastAttack.label,'连击加成');assert.match(boosted.notice,/连击加成/);
 // 连击到 15 升到 2.5 倍，30 以上升到 4 倍。
 const high=send(19);
 assert.equal(high.me.combo,19);assert.equal(high.lastAttack.multiplier,2.5);assert.equal(high.lastAttack.label,'持续压制');
 const peak=send(31);
 assert.equal(peak.me.combo,31);assert.equal(peak.lastAttack.multiplier,4);assert.equal(peak.lastAttack.label,'压倒性攻势');
 assert.ok(peak.lastAttack.power>high.lastAttack.power);
 // 客户端能拿到档位定义，用于绘制威力条。
 assert.equal(b.state(1).comboPower.base,0.15);
 assert.deepEqual(b.state(1).comboPower.tiers.map(t=>t.multiplier),[4,2.5,1.5]);
});
test('a wrong character resets the combo and drops power back to base',()=>{
 const {b,join}=setup();join(1,'red');join(2,'blue');
 const task=b.task(1);b.attackCharacters(1,{ticket:task.id,text:task.text.slice(0,10)});
 assert.equal(b.state(1).me.combo,10);assert.equal(b.state(1).me.multiplier,1.5);
 // 输入错误的前缀会被拒绝，同时清空连击，威力回落到基础档。
 assert.throws(()=>b.attackCharacters(1,{ticket:task.id,text:'x'+task.text.slice(1,3)}),/字符/);
 assert.equal(b.state(1).me.combo,0);assert.equal(b.state(1).me.multiplier,1);
 // 重新起连击时威力从基础值开始，且要接着已结算的位置继续输入。
 const retry=b.attackCharacters(1,{ticket:task.id,text:task.text.slice(0,11)});
 assert.equal(retry.lastAttack.multiplier,1);assert.equal(retry.me.combo,1);assert.equal(b.state(1).me.bestCombo,10);
});
