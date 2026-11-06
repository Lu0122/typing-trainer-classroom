const { WebSocketServer, WebSocket } = require('ws');
const crypto = require('node:crypto');
const { hashSessionToken } = require('./auth');

// A bounded, read-only stream: input and joins retain their existing HTTP acknowledgement path.
function attachBattleSocket(server, { app, db, now = Date.now, intervalMs = 1000, heartbeatMs = 5000 } = {}) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024, perMessageDeflate: false });
  const engine = app.locals.typingBattle;
  if (!engine) throw new Error('Battle engine unavailable');
  const findSession = db.prepare(`SELECT users.id, users.display_name AS displayName, users.avatar_data AS avatarData
    FROM user_sessions JOIN users ON users.id = user_sessions.user_id
    WHERE user_sessions.token_hash = ? AND user_sessions.expires_at > ? AND users.is_active = 1`);
  function authenticate(tokenHash) {
    const user = findSession.get(tokenHash, now());
    if (!user) return null;
    const avatarVersion = user.avatarData ? crypto.createHash('sha1').update(user.avatarData).digest('hex').slice(0, 10) : null;
    return { id: user.id, displayName: user.displayName, avatarUrl: avatarVersion ? `/api/users/${user.id}/avatar?v=${avatarVersion}` : null };
  }
  function upgrade(req, socket, head) {
    let url, origin;
    try { url = new URL(req.url, 'http://localhost'); origin = new URL(req.headers.origin); }
    catch { socket.destroy(); return; }
    if (url.pathname !== '/api/battle/stream') { socket.destroy(); return; }
    if (!['http:', 'https:'].includes(origin.protocol) || origin.host !== req.headers.host) { socket.destroy(); return; }
    let token;
    try {
      const item = String(req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith('typing_session='));
      token = item && decodeURIComponent(item.slice('typing_session='.length));
    } catch { socket.destroy(); return; }
    if (!token || token.length > 512) { socket.destroy(); return; }
    const tokenHash = hashSessionToken(token);
    const user = authenticate(tokenHash);
    if (!user || wss.clients.size >= 256 || [...wss.clients].filter(client => client.userId === user.id).length >= 4) { socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, ws => {
      ws.userId = user.id; ws.tokenHash = tokenHash; ws.user = user; ws.alive = true;
      wss.emit('connection', ws, req);
    });
  }
  server.on('upgrade', upgrade);
  wss.on('connection', ws => {
    ws.on('pong', () => { ws.alive = true; });
    ws.on('message', () => { ws.close(1008, 'Read only'); });
    ws.on('error', () => {});
  });
  const updates = setInterval(() => {
    for (const ws of wss.clients) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      if (ws.bufferedAmount > 512 * 1024) { ws.terminate(); continue; }
      try { ws.send(JSON.stringify({ type: 'state', data: engine.state(ws.userId, ws.user) })); }
      catch { ws.terminate(); }
    }
  }, intervalMs);
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      try {
        if (!ws.alive || !(ws.user = authenticate(ws.tokenHash))) { ws.terminate(); continue; }
        ws.alive = false; ws.ping();
      } catch { ws.terminate(); }
    }
  }, heartbeatMs);
  updates.unref(); heartbeat.unref();
  return { close() { clearInterval(updates); clearInterval(heartbeat); server.off('upgrade', upgrade); for (const ws of wss.clients) ws.terminate(); wss.close(); } };
}
module.exports = { attachBattleSocket };
