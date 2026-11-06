const crypto = require('node:crypto');

// Classroom lobby is process-local like the game rooms; bounded history is not a permanent chat log.
function installLobby(app, { requireUser, now = Date.now }) {
  const messages = [], byRequest = new Map(), limits = new Map();
  const epoch = crypto.randomUUID(); let sequence = 0;
  const ttl = 30 * 60 * 1000;
  const fail = (message,status=400) => { throw Object.assign(new Error(message),{status}); };
  function cleanup() {
    while(messages.length && (messages.length > 200 || now()-messages[0].createdAt > ttl)) {
      const m=messages.shift(); byRequest.delete(`${m.userId}:${m.requestId}`);
    }
    for(const [key,item] of byRequest) if(now()-item.createdAt>ttl || !messages.includes(item)) byRequest.delete(key);
    for(const [key,time] of limits) if(now()-time>ttl) limits.delete(key);
  }
  function event(req,type,extra) {
    const item={id:++sequence,requestId:req.body.requestId,userId:req.user.id,name:req.user.displayName,type,createdAt:now(),...extra};
    messages.push(item);byRequest.set(`${item.userId}:${item.requestId}`,item);cleanup();return item;
  }
  function dedupe(req,type) {
    const id=String(req.body?.requestId || '');
    if(!/^[A-Za-z0-9_-]{12,80}$/.test(id))fail('请求标识无效');
    const existing=byRequest.get(`${req.user.id}:${id}`);
    if(existing && existing.type!==type)fail('请求标识已被使用',409);
    return existing;
  }
  function rate(userId,type,ms) {
    const key=`${userId}:${type}`,last=limits.get(key);
    if(last!==undefined && now()-last<ms)fail('操作太快，请稍后再试',429);
    limits.set(key,now());
  }
  function game(mode) { const g=mode==='race'?app.locals.raceLobby:mode==='chase'?app.locals.chaseLobby:mode==='rhythm'?app.locals.rhythmLobby:mode==='boss'?app.locals.bossLobby:mode==='battle'?app.locals.battleLobby:null;if(!g)fail('该玩法暂不支持组队邀请');return g; }
  function publicEvent(item,userId) {
    const result={epoch,id:item.id,type:item.type,name:item.name,userId:item.userId,createdAt:item.createdAt};
    if(item.type==='text')result.text=item.text;
    else {const state=game(item.mode).inspect(item.code);Object.assign(result,{mode:item.mode,code:item.code,room:state,canJoin:!!state && (item.userId===userId || (state.joinable ?? state.phase==='waiting') && state.count<state.capacity)});}
    return result;
  }
  const route = fn => (req,res,next) => {try {res.json(fn(req));} catch(e) {if(e.status)res.status(e.status).json({message:e.message});else next(e);}};
  app.get('/api/lobby/messages', requireUser, route(req=>{cleanup();return {epoch,messages:messages.slice(-100).map(item=>publicEvent(item,req.user.id)),serverNow:now()};}));
  app.post('/api/lobby/messages', requireUser, route(req=>{cleanup();const existing=dedupe(req,'text');if(existing)return publicEvent(existing,req.user.id);const text=String(req.body?.text||'').trim();if(!text || [...text].length>200)fail('请输入 1—200 字的消息');rate(req.user.id,'text',800);return publicEvent(event(req,'text',{text}),req.user.id);}));
  app.post('/api/lobby/invitations', requireUser, route(req=>{cleanup();const existing=dedupe(req,'invite');if(existing)return publicEvent(existing,req.user.id);const mode=String(req.body?.mode||'');const g=game(mode);rate(req.user.id,'invite',2000);const state=g.create(req.user);const code=String(mode==='chase'?state.code:mode==='race'||mode==='rhythm'?state.roomNo:mode==='battle'?state.inviteCode:state.round);const old=messages.findLast(item=>item.type==='invite'&&item.userId===req.user.id&&item.mode===mode&&item.code===code);if(old)return publicEvent(old,req.user.id);return publicEvent(event(req,'invite',{mode,code}),req.user.id);}));
  app.post('/api/lobby/invitations/:id/join', requireUser, route(req=>{cleanup();if(req.body?.epoch!==epoch)fail('邀请已过期，请刷新后重试',409);const item=messages.find(m=>m.type==='invite'&&String(m.id)===req.params.id);if(!item)fail('邀请已过期，请重新发起',404);const g=game(item.mode);g.join(req.user,item.code);return {mode:item.mode,code:item.code};}));
}
module.exports={installLobby};
