const crypto = require('node:crypto');
const { articleLanguageForCategory, isArticleGenerationSupported, buildArticleMessages, normalizeArticleContent, validateArticleContent } = require('./article-prompt');

const GAME_DURATION_MS = 3 * 60 * 1000;
const DEFAULT_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
const DEFAULT_MODEL = 'qwen-flash';
const DEFAULT_ROLE_PROMPT = '你是一名真实的电商消费者，正在与客服沟通。请保持自然、具体、有情绪但不夸张，围绕订单、物流、退换货、售后和商品体验提出合理诉求。';

function clean(value, max = 4000) {
  return String(value ?? '').trim().slice(0, max);
}

function secretKey() {
  return crypto.createHash('sha256').update(process.env.AI_SETTINGS_SECRET || process.env.ADMIN_PASSWORD || 'typing-game-ai-settings').digest();
}

function encrypt(value) {
  if (!value) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', secretKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
}

function decrypt(value) {
  if (!value) return '';
  try {
    const [iv, tag, data] = value.split('.').map((part) => Buffer.from(part, 'base64url'));
    const decipher = crypto.createDecipheriv('aes-256-gcm', secretKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

function normalizeBaseUrl(value) {
  const raw = clean(value, 500).replace(/\/+$/, '');
  return raw || DEFAULT_BASE_URL;
}

function defaultSettings() {
  return { provider: '阿里云百炼', baseUrl: DEFAULT_BASE_URL, model: DEFAULT_MODEL, rolePrompt: DEFAULT_ROLE_PROMPT, enabled: false, apiKeyConfigured: false, updatedAt: null };
}

function readSettings(db) {
  const row = db.prepare('SELECT provider, base_url AS baseUrl, model, role_prompt AS rolePrompt, api_key_ciphertext AS apiKeyCiphertext, enabled, updated_at AS updatedAt FROM ai_settings WHERE id = 1').get();
  if (!row) return defaultSettings();
  return { provider: row.provider || '阿里云百炼', baseUrl: normalizeBaseUrl(row.baseUrl), model: row.model || DEFAULT_MODEL, rolePrompt: clean(row.rolePrompt, 2000) || DEFAULT_ROLE_PROMPT, enabled: Boolean(row.enabled), apiKeyConfigured: Boolean(decrypt(row.apiKeyCiphertext)), updatedAt: row.updatedAt || null };
}

function readPrivateSettings(db) {
  const row = db.prepare('SELECT provider, base_url AS baseUrl, model, role_prompt AS rolePrompt, api_key_ciphertext AS apiKeyCiphertext, enabled, updated_at AS updatedAt FROM ai_settings WHERE id = 1').get();
  return { provider: row?.provider || '阿里云百炼', baseUrl: normalizeBaseUrl(row?.baseUrl), model: row?.model || DEFAULT_MODEL, rolePrompt: clean(row?.rolePrompt, 2000) || DEFAULT_ROLE_PROMPT, apiKey: decrypt(row?.apiKeyCiphertext), enabled: Boolean(row?.enabled), updatedAt: row?.updatedAt || null };
}

function ensureSettings(db, now) {
  db.prepare(`INSERT INTO ai_settings (id, provider, base_url, model, role_prompt, api_key_ciphertext, enabled, updated_at)
    VALUES (1, ?, ?, ?, ?, '', 0, ?) ON CONFLICT(id) DO NOTHING`).run('阿里云百炼', DEFAULT_BASE_URL, DEFAULT_MODEL, DEFAULT_ROLE_PROMPT, now());
}

const fallbackScenarios = [
  { title: '包裹延迟：客户急着送礼', profile: '周女士，购买了生日礼物，物流显示两天没有更新。语气焦急，但愿意沟通。', context: '订单号 A20261028，预计昨天送达，客户今天晚上要参加生日聚会。', customerMessage: '你好，我买的生日礼物昨天应该到了，现在物流两天没动静，今晚就要送人了，怎么办？' },
  { title: '尺码不合：客户想换货', profile: '陈先生，第一次购买该品牌，收到衣服后发现偏小。希望换大一码，担心错过退换时间。', context: '订单号 B20261028，商品未使用，保留吊牌和包装。', customerMessage: '衣服收到了，但是尺码小了，想换大一码。请问现在还能换吗？运费是谁承担？' },
  { title: '商品瑕疵：客户要求处理', profile: '林女士，收到的杯子有明显裂纹，已经拍照。情绪不满，但愿意接受合理方案。', context: '订单号 C20261028，商品属于易碎品，客户已上传开箱照片。', customerMessage: '刚拆箱就发现杯子有裂纹，这种质量问题你们准备怎么处理？我不想承担来回寄回的麻烦。' }
];

function fallbackStart() {
  const scenario = fallbackScenarios[Math.floor(Math.random() * fallbackScenarios.length)];
  return { ...scenario, suggestedReplies: ['先确认订单号和具体诉求', '向客户说明处理时限与下一步', '给出明确的退换或补偿方案'] };
}

function fallbackReply(reply, history) {
  const normalized = clean(reply, 800);
  const hasPlan = /(查询|核实|安排|换货|退款|补发|补偿|处理|提交|联系)/u.test(normalized);
  const hasPolite = /(您好|你好|抱歉|感谢|理解|请|您)/u.test(normalized);
  const turns = history.filter((item) => item.role === 'agent').length;
  if (hasPlan && hasPolite) {
    return { customerMessage: '好的，麻烦你帮我尽快核实一下，并告诉我大概什么时候能有结果。', customerMood: '缓和', suggestedReplies: ['确认已经提交工单，并告知预计反馈时间', '复述客户诉求，避免信息遗漏', '结束前说明后续联系渠道'], needsFollowUp: turns < 3, resolved: turns >= 3 };
  }
  return { customerMessage: '我理解流程可能需要时间，但我现在最关心的是具体怎么解决、多久能处理好？', customerMood: '追问', suggestedReplies: ['先表达理解，再给出明确时间点', '说明需要客户补充的材料', '避免只说“尽快处理”'], needsFollowUp: true, resolved: false };
}

function buildSchema(name, properties, required) {
  return { type: 'json_schema', json_schema: { name, strict: true, schema: { type: 'object', additionalProperties: false, properties, required } } };
}

const START_FORMAT = buildSchema('customer_service_scenario', {
  title: { type: 'string' }, profile: { type: 'string' }, context: { type: 'string' }, customerMessage: { type: 'string' }, suggestedReplies: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 4 }
}, ['title', 'profile', 'context', 'customerMessage', 'suggestedReplies']);
const REPLY_FORMAT = buildSchema('customer_service_turn', {
  customerMessage: { type: 'string' }, customerMood: { type: 'string' }, suggestedReplies: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 4 }, needsFollowUp: { type: 'boolean' }, resolved: { type: 'boolean' }
}, ['customerMessage', 'customerMood', 'suggestedReplies', 'needsFollowUp', 'resolved']);
const SCORE_FORMAT = buildSchema('customer_service_score', {
  totalScore: { type: 'integer', minimum: 0, maximum: 100 }, dimensions: { type: 'array', minItems: 4, maxItems: 5, items: { type: 'object', additionalProperties: false, properties: { key: { type: 'string' }, label: { type: 'string' }, score: { type: 'integer', minimum: 0, maximum: 100 }, comment: { type: 'string' } }, required: ['key', 'label', 'score', 'comment'] } }, summary: { type: 'string' }, improvements: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 5 }
}, ['totalScore', 'dimensions', 'summary', 'improvements']);

const ARTICLE_FORMAT = buildSchema('typing_practice_article', {
  title: { type: 'string', minLength: 2, maxLength: 60 },
  content: { type: 'string', minLength: 20, maxLength: 2000 }
}, ['title', 'content']);

async function callModel(settings, messages, responseFormat, timeoutMs = 20000) {
  if (!settings.enabled || !settings.apiKey) return null;
  const endpoint = `${normalizeBaseUrl(settings.baseUrl)}/chat/completions`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  // enable_thinking 必须放顶层：DashScope 的 OpenAI 兼容接口不认 extra_body，
  // 放进去会被忽略，模型按默认开启「思考」，首字要十几秒才出。
  const payload = { model: settings.model, messages, temperature: 0.4, stream: false, response_format: responseFormat, enable_thinking: false };
  try {
    let response = await fetch(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${settings.apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: controller.signal });
    if (!response.ok && responseFormat?.type === 'json_schema') {
      payload.response_format = { type: 'json_object' };
      response = await fetch(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${settings.apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: controller.signal });
    }
    if (!response.ok) throw new Error(`LLM ${response.status}`);
    const body = await response.json();
    const content = body?.choices?.[0]?.message?.content;
    if (!content) throw new Error('模型没有返回内容');
    return JSON.parse(String(content).replace(/^```json\s*|\s*```$/g, '').trim());
  } finally {
    clearTimeout(timer);
  }
}

// 流式调用（OpenAI 兼容的 SSE）：边生成边回调，返回完整文本。
// 只用于「纯文本回答」场景，不支持 response_format —— 流式下 JSON 会边生成边截断，没法用。
async function streamModel(settings, messages, { onDelta = () => {}, timeoutMs = 60000 } = {}) {
  if (!settings.enabled || !settings.apiKey) return '';
  const endpoint = `${normalizeBaseUrl(settings.baseUrl)}/chat/completions`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${settings.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: settings.model,
        messages,
        temperature: 0.4,
        stream: true,
        stream_options: { include_usage: false },
        enable_thinking: false
      }),
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`LLM ${response.status}`);
    if (!response.body) throw new Error('模型没有返回流');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let full = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let index = buffer.indexOf('\n');
      while (index >= 0) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        index = buffer.indexOf('\n');
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        try {
          const chunk = JSON.parse(payload);
          const delta = chunk?.choices?.[0]?.delta?.content;
          if (delta) { full += delta; onDelta(delta); }
        } catch { /* 心跳行或半截数据，忽略 */ }
      }
    }
    return full;
  } finally {
    clearTimeout(timer);
  }
}

function sessionState(row) {
  return { id: row.id, scenario: JSON.parse(row.scenario_json), history: JSON.parse(row.history_json), startedAt: row.started_at, expiresAt: row.expires_at, status: row.status, remainingMs: Math.max(0, row.expires_at - Date.now()) };
}

function getOwnedSession(db, id, userId) {
  const row = db.prepare('SELECT * FROM customer_service_sessions WHERE id = ? AND user_id = ?').get(id, userId);
  if (!row) throw Object.assign(new Error('客服挑战不存在或已失效'), { status: 404 });
  return row;
}

function installCustomerService(app, { db, requireUser, requireAdmin, now = () => Date.now() }) {
  ensureSettings(db, now);

  app.get('/api/admin/ai-settings', requireAdmin, (request, response) => response.json(readSettings(db)));
  app.patch('/api/admin/ai-settings', requireAdmin, (request, response) => {
    const current = readPrivateSettings(db);
    const provider = clean(request.body?.provider, 80) || current.provider;
    const baseUrl = normalizeBaseUrl(request.body?.baseUrl || current.baseUrl);
    const model = clean(request.body?.model, 120) || current.model;
    const apiKey = clean(request.body?.apiKey, 300) || current.apiKey;
    const enabled = Boolean(request.body?.enabled);
    const rolePrompt = clean(request.body?.rolePrompt, 2000) || current.rolePrompt || DEFAULT_ROLE_PROMPT;
    db.prepare(`UPDATE ai_settings SET provider = ?, base_url = ?, model = ?, role_prompt = ?, api_key_ciphertext = ?, enabled = ?, updated_at = ? WHERE id = 1`).run(provider, baseUrl, model, rolePrompt, encrypt(apiKey), enabled ? 1 : 0, now());
    return response.json(readSettings(db));
  });
  app.post('/api/admin/ai-settings/test', requireAdmin, async (request, response) => {
    const current = readPrivateSettings(db);
    const candidate = { ...current, provider: clean(request.body?.provider, 80) || current.provider, baseUrl: normalizeBaseUrl(request.body?.baseUrl || current.baseUrl), model: clean(request.body?.model, 120) || current.model, apiKey: clean(request.body?.apiKey, 300) || current.apiKey, enabled: true };
    if (!candidate.apiKey) return response.status(400).json({ message: '请先填写 API Key' });
    try {
      const result = await callModel(candidate, [{ role: 'system', content: '请只返回 JSON：{"ok":true,"message":"连接成功"}。' }, { role: 'user', content: '测试连接' }], { type: 'json_object' }, 12000);
      return response.json({ ok: true, message: result?.message || '连接成功' });
    } catch (error) {
      return response.status(502).json({ message: `模型连接失败：${error.message}` });
    }
  });

  app.post('/api/admin/passages/generate', requireAdmin, async (request, response) => {
    const current = readPrivateSettings(db);
    if (!current.apiKey) return response.status(400).json({ message: '请先在 AI 服务设置中配置 API Key' });
    const titleHint = clean(request.body?.title, 60);
    const categoryHint = clean(request.body?.category, 30);
    if (!titleHint || !categoryHint) return response.status(400).json({ message: '请先填写文章标题和文章分类' });
    if (!isArticleGenerationSupported(categoryHint)) return response.status(400).json({ message: `「${categoryHint}」分类前台暂未使用，不再支持 AI 生成，请选择其它分类或手工录入正文` });
    const lengthHint = Math.min(2000, Math.max(80, Number.parseInt(request.body?.length, 10) || 400));
    // 语言由分类决定，不由模型决定：选了英文分类就必须出英文。
    const language = articleLanguageForCategory(categoryHint);
    const settings = { ...current, enabled: true };
    try {
      let article = null;
      let problem = '模型没有返回内容';
      // 第一次不合格就把原因回喂给模型重生一次；仍不合格直接报错，不写库。
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const messages = buildArticleMessages({ title: titleHint, category: categoryHint, length: lengthHint, language, feedback: attempt ? problem : '' });
        const draft = await callModel(settings, messages, ARTICLE_FORMAT, 30000);
        const content = normalizeArticleContent(clean(draft?.content, 2000), language);
        problem = draft ? validateArticleContent(content, language) : '模型没有返回内容';
        if (!problem) {
          article = { title: clean(draft.title, 60) || titleHint, content };
          break;
        }
      }
      if (!article) throw new Error(`${problem}（已重试 1 次）`);
      return response.json({ title: article.title, category: categoryHint, content: article.content, language, model: settings.model });
    } catch (error) {
      return response.status(502).json({ message: `AI 文章生成失败：${error.message}` });
    }
  });

  app.post('/api/customer-service/start', requireUser, async (request, response) => {
    const settings = readPrivateSettings(db);
    const fallback = fallbackStart();
    const modelStartedAt = now();
    const scenarioFromModel = await callModel(settings, [
      { role: 'system', content: `${settings.rolePrompt}\n\n请生成一个真实、常见、适合客服训练的电商售后场景。必须按照 JSON Schema 返回，不要输出额外文字。建议话术要是客服可以直接参考的短句。` },
      { role: 'user', content: '请随机生成一个包含订单背景、消费者身份、核心诉求和情绪的客服挑战场景。' }
    ], START_FORMAT).catch(() => null);
    const scenario = scenarioFromModel || fallback;
    const id = crypto.randomUUID();
    const startedAt = now();
    const history = [{ role: 'customer', content: scenario.customerMessage, timestamp: startedAt }];
    db.prepare(`INSERT INTO customer_service_sessions (id, user_id, scenario_json, history_json, started_at, expires_at, status) VALUES (?, ?, ?, ?, ?, ?, 'active')`).run(id, request.user.id, JSON.stringify(scenario), JSON.stringify(history), startedAt, startedAt + GAME_DURATION_MS);
    return response.json({ session: { id, scenario, history, startedAt, expiresAt: startedAt + GAME_DURATION_MS, status: 'active', remainingMs: GAME_DURATION_MS }, provider: scenarioFromModel ? settings.provider : '内置训练场景', meta: { source: scenarioFromModel ? 'llm' : 'fallback', latencyMs: Math.max(0, now() - modelStartedAt), model: scenarioFromModel ? settings.model : null } });
  });

  app.post('/api/customer-service/reply', requireUser, async (request, response) => {
    const row = getOwnedSession(db, clean(request.body?.sessionId, 80), request.user.id);
    if (row.status !== 'active') return response.status(409).json({ message: '本次挑战已经结束' });
    const current = now();
    if (current > row.expires_at) return response.status(410).json({ message: '挑战时间已结束，请查看结算' });
    const reply = clean(request.body?.reply, 1200);
    if (!reply) return response.status(400).json({ message: '请输入回复内容' });
    const history = JSON.parse(row.history_json);
    history.push({ role: 'agent', content: reply, timestamp: current });
    const settings = readPrivateSettings(db);
    const fallback = fallbackReply(reply, history);
    const modelStartedAt = now();
    const turnFromModel = await callModel(settings, [
      { role: 'system', content: `${settings.rolePrompt}\n\n你正在进行客服应答训练。根据场景和历史对话继续扮演消费者。请保持问题真实、简洁，不要替客服做决定。必须严格按 JSON Schema 返回，并给出 3 条客服可参考的建议话术。` },
      { role: 'user', content: JSON.stringify({ scenario: JSON.parse(row.scenario_json), conversation: history }) }
    ], REPLY_FORMAT).catch(() => null);
    const turn = turnFromModel || fallback;
    const customerMessage = clean(turn.customerMessage, 1200);
    history.push({ role: 'customer', content: customerMessage, mood: clean(turn.customerMood, 30), timestamp: now() });
    db.prepare('UPDATE customer_service_sessions SET history_json = ? WHERE id = ?').run(JSON.stringify(history), row.id);
    return response.json({ turn, history, remainingMs: Math.max(0, row.expires_at - current), meta: { source: turnFromModel ? 'llm' : 'fallback', latencyMs: Math.max(0, now() - modelStartedAt), model: turnFromModel ? settings.model : null } });
  });

  app.post('/api/customer-service/finish', requireUser, async (request, response) => {
    const row = getOwnedSession(db, clean(request.body?.sessionId, 80), request.user.id);
    if (row.status === 'finished') {
      const saved = db.prepare('SELECT result_json AS result FROM customer_service_results WHERE session_id = ?').get(row.id);
      return response.json({ result: saved ? JSON.parse(saved.result) : null });
    }
    const history = JSON.parse(row.history_json);
    const durations = [];
    for (let i = 1; i < history.length; i += 1) if (history[i].role === 'agent' && history[i - 1]?.role === 'customer') durations.push(Math.max(0, history[i].timestamp - history[i - 1].timestamp));
    const avgReplyMs = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null;
    const settings = readPrivateSettings(db);
    const fallback = { totalScore: Math.max(0, Math.min(100, 55 + Math.min(25, history.filter((item) => item.role === 'agent').length * 8))), dimensions: [{ key: 'speed', label: '回复速度', score: avgReplyMs === null ? 0 : Math.max(0, Math.min(100, Math.round(100 - avgReplyMs / 1000))), comment: avgReplyMs === null ? '没有记录到有效回复' : `平均 ${Math.round(avgReplyMs / 1000)} 秒` }, { key: 'clarity', label: '表达清晰', score: 72, comment: '建议先复述诉求，再给出下一步' }, { key: 'empathy', label: '共情与礼貌', score: 78, comment: '保持礼貌并回应客户情绪' }, { key: 'solution', label: '解决方案', score: 68, comment: '把处理时限和责任边界说清楚' }], summary: '已完成一次客服模拟训练。', improvements: ['先确认订单和客户诉求，再承诺处理时限', '避免只说“尽快处理”，给出可验证的下一步'] };
    const modelStartedAt = now();
    const resultFromModel = await callModel(settings, [
      { role: 'system', content: `${settings.rolePrompt}\n\n你现在是客服质检教练。请根据完整对话和服务端统计，对客服表现进行客观评分。速度、礼貌共情、问题理解、方案有效性、表达清晰度都要考虑。必须严格按 JSON Schema 返回。` },
      { role: 'user', content: JSON.stringify({ scenario: JSON.parse(row.scenario_json), conversation: history, replyCount: durations.length, averageReplyMs: avgReplyMs }) }
    ], SCORE_FORMAT).catch(() => null);
    const result = resultFromModel || fallback;
    const endedAt = now();
    db.prepare("UPDATE customer_service_sessions SET status = 'finished', ended_at = ? WHERE id = ?").run(endedAt, row.id);
    db.prepare('INSERT OR REPLACE INTO customer_service_results (session_id, user_id, result_json, created_at) VALUES (?, ?, ?, ?)').run(row.id, request.user.id, JSON.stringify({ ...result, replyCount: durations.length, averageReplyMs: avgReplyMs, startedAt: row.started_at, endedAt }), endedAt);
    return response.json({ result: { ...result, replyCount: durations.length, averageReplyMs: avgReplyMs, startedAt: row.started_at, endedAt }, meta: { source: resultFromModel ? 'llm' : 'fallback', latencyMs: Math.max(0, now() - modelStartedAt), model: resultFromModel ? settings.model : null } });
  });
}

module.exports = { installCustomerService, GAME_DURATION_MS, readPrivateSettings, callModel, streamModel };
