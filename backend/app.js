const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');
const express = require('express');
const { scoreTyping, visibleCharacters } = require('./scoring');
const { countScoreRows, selectScoreRows, scoreRowsToCsv } = require('./score-filters');
const { listPage } = require('./pagination');
const {
  FAKE_PASSWORD_RECORD,
  createSessionToken,
  hashPassword,
  hashPasswordSync,
  hashSessionToken,
  normalizeDisplayName,
  normalizeUsername,
  validateDisplayName,
  validatePassword,
  validateUsername,
  verifyPassword
} = require('./auth');

const CHALLENGE_DURATION_MS = 60_000;
const SUBMIT_GRACE_MS = 2_000;
// 后台用于教师的日常管理，保留 30 天登录状态；主动退出或账号停用仍会立即失效。
const ADMIN_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const STUDENT_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CHALLENGE_CATEGORIES = { english: '英文挑战', pinyin: '拼音挑战', legacy: '一分钟挑战' };

function parseCookies(header = '') {
  return Object.fromEntries(
    header.split(';').filter((part) => part.includes('=')).map((part) => {
      const index = part.indexOf('=');
      return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
    })
  );
}

function cleanText(value, maxLength) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function normalizeKeyStats(value) {
  if (!Array.isArray(value)) return [];
  const grouped = new Map();
  for (const item of value.slice(0, 160)) {
    const keyCode = cleanText(item?.keyCode, 32);
    if (!keyCode) continue;
    const expectedCount = Math.min(10000, Math.max(0, Number.parseInt(item?.expectedCount, 10) || 0));
    const correctCount = Math.min(expectedCount, Math.max(0, Number.parseInt(item?.correctCount, 10) || 0));
    const wrongCount = Math.min(expectedCount, Math.max(0, Number.parseInt(item?.wrongCount, 10) || 0));
    if (!expectedCount) continue;
    const actualErrors = {};
    if (item?.actualErrors && typeof item.actualErrors === 'object') {
      for (const [actualKey, count] of Object.entries(item.actualErrors).slice(0, 24)) {
        const safeKey = cleanText(actualKey, 32);
        const safeCount = Math.min(10000, Math.max(0, Number.parseInt(count, 10) || 0));
        if (safeKey && safeCount) actualErrors[safeKey] = safeCount;
      }
    }
    const current = grouped.get(keyCode) || { keyCode, expectedCount: 0, correctCount: 0, wrongCount: 0, actualErrors: {} };
    current.expectedCount += expectedCount;
    current.correctCount += correctCount;
    current.wrongCount += wrongCount;
    for (const [actualKey, count] of Object.entries(actualErrors)) current.actualErrors[actualKey] = (current.actualErrors[actualKey] || 0) + count;
    grouped.set(keyCode, current);
  }
  return [...grouped.values()];
}

function assignmentIncludesStudent(assignment, userId, db = null) {
  if (assignment.audience === 'all') return true;
  if (assignment.audience === 'class') {
    const classId = Number(assignment.class_id ?? assignment.classId);
    return Boolean(db && classId > 0 && db.prepare('SELECT 1 FROM class_members WHERE class_id = ? AND user_id = ? AND left_at IS NULL').get(classId, userId));
  }
  try {
    const raw = assignment.student_ids_json ?? assignment.studentIdsJson ?? '[]';
    const ids = JSON.parse(raw);
    return Array.isArray(ids) && ids.map(Number).includes(Number(userId));
  } catch {
    return false;
  }
}

function appVersion() {
  for (const file of [path.join(__dirname, '..', 'version.json'), path.join(__dirname, '..', 'package.json')]) {
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (data.version) return data.version;
    } catch { /* 文件不存在就试下一个 */ }
  }
  return 'unknown';
}

function createApp({ db, adminPassword = 'admin123', now = () => Date.now(), secureCookies = false, requireAccountApproval = true, studentRegistrationEnabled = true }) {
  const app = express();
  const adminSessions = new Map();
  const loginFailures = new Map();
  const registrationAttempts = new Map();
  const adminLoginFailures = new Map();

  const adminCount = db.prepare('SELECT COUNT(*) AS count FROM admin_accounts').get().count;
  if (!adminCount) {
    db.prepare(`INSERT INTO admin_accounts
      (username, display_name, password_hash, role, is_active, created_at)
      VALUES ('admin', '超级管理员', ?, 'superadmin', 1, ?)`)
      .run(hashPasswordSync(adminPassword), now());
  }

  app.disable('x-powered-by');
  app.use(express.json({ limit: '256kb' }));
  app.use((request, response, next) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Referrer-Policy', 'same-origin');
    response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
    next();
  });
  app.use((request, response, next) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) return next();
    const origin = request.headers.origin;
    if (!origin) return next();
    try {
      if (new URL(origin).host !== request.headers.host) return response.status(403).json({ message: '请求来源不受信任' });
    } catch {
      return response.status(403).json({ message: '请求来源不受信任' });
    }
    return next();
  });

  function sessionCookie(name, value, maxAge) {
    const secure = secureCookies ? '; Secure' : '';
    return `${name}=${encodeURIComponent(value)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure}`;
  }

  function requestIp(request) {
    return request.socket.remoteAddress || 'unknown';
  }

  function consumeLimit(store, key, limit, windowMs) {
    const current = now();
    let entry = store.get(key);
    if (!entry || entry.resetAt <= current) entry = { count: 0, resetAt: current + windowMs };
    if (entry.count >= limit) return Math.max(1, Math.ceil((entry.resetAt - current) / 1000));
    entry.count += 1;
    store.set(key, entry);
    return 0;
  }

  function isFailureLimited(store, key, limit, windowMs) {
    const entry = store.get(key);
    if (!entry || entry.resetAt <= now()) {
      store.delete(key);
      return 0;
    }
    if (entry.count < limit) return 0;
    return Math.max(1, Math.ceil((entry.resetAt - now()) / 1000));
  }

  function recordFailure(store, key, windowMs) {
    const current = now();
    const entry = store.get(key);
    store.set(key, !entry || entry.resetAt <= current
      ? { count: 1, resetAt: current + windowMs }
      : { ...entry, count: entry.count + 1 });
  }

  function rateLimited(response, retryAfter) {
    response.setHeader('Retry-After', retryAfter);
    return response.status(429).json({ message: `尝试次数过多，请 ${retryAfter} 秒后再试` });
  }

  function avatarUrlForUser(user) {
    if (!user?.avatarData) return null;
    const avatarVersion = crypto.createHash('sha1').update(user.avatarData).digest('hex').slice(0, 10);
    return `/api/users/${user.id}/avatar?v=${avatarVersion}`;
  }

  function publicUser(user) {
    return { id: user.id, username: user.username, displayName: user.displayName, avatarUrl: avatarUrlForUser(user) };
  }

  function getStudentFromRequest(request) {
    const token = parseCookies(request.headers.cookie).typing_session;
    if (!token) return null;
    const tokenHash = hashSessionToken(token);
    const row = db.prepare(`
      SELECT users.id, users.username, users.display_name AS displayName, users.avatar_data AS avatarData, users.is_active AS isActive,
             user_sessions.expires_at AS expiresAt
      FROM user_sessions JOIN users ON users.id = user_sessions.user_id
      WHERE user_sessions.token_hash = ?
    `).get(tokenHash);
    if (!row || !row.isActive || row.expiresAt <= now()) {
      db.prepare('DELETE FROM user_sessions WHERE token_hash = ?').run(tokenHash);
      return null;
    }
    return { ...row, avatarUrl: avatarUrlForUser(row) };
  }

  function createStudentSession(userId, response) {
    const token = createSessionToken();
    const createdAt = now();
    const expiresAt = createdAt + STUDENT_SESSION_TTL_MS;
    db.transaction(() => {
      db.prepare('DELETE FROM user_sessions WHERE expires_at <= ?').run(createdAt);
      db.prepare('INSERT INTO user_sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
        .run(hashSessionToken(token), userId, createdAt, expiresAt);
      db.prepare(`
        DELETE FROM user_sessions WHERE user_id = ? AND token_hash NOT IN (
          SELECT token_hash FROM user_sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 5
        )
      `).run(userId, userId);
    })();
    response.setHeader('Set-Cookie', sessionCookie('typing_session', token, STUDENT_SESSION_TTL_MS / 1000));
  }

  function generateStudentUsername() {
    let username = '';
    do {
      username = `student_${crypto.randomBytes(6).toString('hex')}`;
    } while (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username));
    return username;
  }

  app.use((request, response, next) => {
    request.user = getStudentFromRequest(request);
    next();
  });

  function requireUser(request, response, next) {
    if (!request.user) return response.status(401).json({ message: '请先登录学生账号' });
    return next();
  }

  function requireAdmin(request, response, next) {
    const token = parseCookies(request.headers.cookie).typing_admin;
    const session = token && adminSessions.get(token);
    const expiresAt = typeof session === 'number' ? session : session?.expiresAt;
    if (!expiresAt || expiresAt < now()) {
      if (token) adminSessions.delete(token);
      return response.status(401).json({ message: '请先登录后台' });
    }
    request.admin = typeof session === 'number' ? { id: 0, username: 'admin', role: 'superadmin' } : session;
    if (request.admin.id > 0) {
      const account = db.prepare('SELECT id, username, display_name AS displayName, role, is_active AS isActive FROM admin_accounts WHERE id = ?').get(request.admin.id);
      if (!account?.isActive) {
        adminSessions.delete(token);
        response.setHeader('Set-Cookie', sessionCookie('typing_admin', '', 0));
        return response.status(401).json({ message: '后台账号已停用，请联系超级管理员' });
      }
      request.admin = account;
      adminSessions.set(token, { ...account, expiresAt });
    }
    return next();
  }

  function requireSuperAdmin(request, response, next) {
    return requireAdmin(request, response, () => request.admin?.role === 'superadmin'
      ? next()
      : response.status(403).json({ message: '只有超级管理员可以管理后台账号' }));
  }

  function trainingRowsForUsers(userIds = null) {
    const filters = userIds?.length ? `WHERE is_finalized = 1 AND user_id IN (${userIds.map(() => '?').join(',')})` : 'WHERE is_finalized = 1';
    const practice = db.prepare(`
      SELECT user_id AS userId, mode, lesson_title AS lessonTitle, correct_chars AS correctChars,
             wrong_chars AS wrongChars, accuracy, speed, duration_ms AS durationMs,
             completed_at AS completedAt
      FROM training_sessions ${filters}
    `).all(...(userIds || []));
    const scoreFilters = userIds?.length ? `WHERE scores.user_id IN (${userIds.map(() => '?').join(',')})` : 'WHERE scores.user_id IS NOT NULL';
    const challenges = db.prepare(`
      SELECT scores.user_id AS userId, 'challenge' AS mode, COALESCE(scores.title_snapshot, passages.title, '一分钟挑战') AS lessonTitle,
             scores.score AS correctChars, scores.wrong_chars AS wrongChars, scores.accuracy,
             scores.score AS speed, 60000 AS durationMs,
             CAST(strftime('%s', scores.created_at) AS INTEGER) * 1000 AS completedAt
      FROM scores LEFT JOIN passages ON passages.id = scores.passage_id
      ${scoreFilters}
    `).all(...(userIds || []));
    return [...practice, ...challenges].filter((row) => row.completedAt).sort((a, b) => a.completedAt - b.completedAt);
  }

  function average(rows, field) {
    return rows.length ? Math.round(rows.reduce((sum, row) => sum + Number(row[field] || 0), 0) / rows.length * 10) / 10 : 0;
  }

  function progressSummary(user, rows) {
    const first = rows.slice(0, 3);
    const recent = rows.slice(-3);
    const hasTrend = rows.length >= 4;
    const firstSpeed = average(first, 'speed');
    const recentSpeed = average(recent, 'speed');
    const firstAccuracy = average(first, 'accuracy');
    const recentAccuracy = average(recent, 'accuracy');
    const latest = rows.at(-1) || null;
    const modes = Object.fromEntries([...new Set(rows.map((row) => row.mode))].map((mode) => [mode, rows.filter((row) => row.mode === mode).length]));
    const activeDays = new Set(rows.map((row) => new Date(row.completedAt).toISOString().slice(0, 10))).size;
    const totalDurationMs = rows.reduce((sum, row) => sum + Number(row.durationMs || 0), 0);
    return {
      ...user,
      sessions: rows.length,
      firstSpeed,
      recentSpeed,
      speedChange: hasTrend ? Math.round((recentSpeed - firstSpeed) * 10) / 10 : null,
      firstAccuracy,
      recentAccuracy,
      accuracyChange: hasTrend ? Math.round((recentAccuracy - firstAccuracy) * 10) / 10 : null,
      latestSpeed: latest?.speed || 0,
      latestAccuracy: latest?.accuracy || 0,
      latestAt: latest?.completedAt || null,
      bestSpeed: rows.reduce((max, row) => Math.max(max, Number(row.speed || 0)), 0),
      activeDays,
      totalHours: Math.round(totalDurationMs / 3_600_000 * 100) / 100,
      dailyHours: activeDays ? Math.round(totalDurationMs / activeDays / 3_600_000 * 100) / 100 : 0,
      modes
    };
  }

  function getUserBest(userId, category = null) {
    const categoryFilter = category ? ' AND COALESCE(scores.category_snapshot, passages.category) = ?' : '';
    const params = category ? [userId, category] : [userId];
    return db.prepare(`
      SELECT scores.id, scores.score, scores.accuracy, scores.created_at AS createdAt
      FROM scores LEFT JOIN passages ON passages.id = scores.passage_id
      WHERE scores.user_id = ?${categoryFilter}
      ORDER BY scores.score DESC, scores.accuracy DESC, scores.created_at ASC LIMIT 1
    `).get(...params);
  }

  function getUserRank(userId, category = null) {
    const best = getUserBest(userId, category);
    if (!best) return { best: null, rank: null };
    const categoryFilter = category ? ' AND COALESCE(scores.category_snapshot, passages.category) = ?' : '';
    const categoryParams = category ? [category] : [];
    const rank = db.prepare(`
      WITH ordered AS (
        SELECT user_id, score, accuracy,
               ROW_NUMBER() OVER (PARTITION BY scores.user_id ORDER BY scores.score DESC, scores.accuracy DESC, scores.created_at ASC) AS attemptOrder
        FROM scores JOIN users ON users.id = scores.user_id
          LEFT JOIN passages ON passages.id = scores.passage_id
        WHERE scores.user_id IS NOT NULL AND users.is_active = 1${categoryFilter}
      )
      SELECT COUNT(*) + 1 AS rank FROM ordered
      WHERE attemptOrder = 1 AND (score > ? OR (score = ? AND accuracy > ?))
    `).get(...categoryParams, best.score, best.score, best.accuracy).rank;
    return { best, rank };
  }

  function getSavedChallengeResult(session) {
    const saved = db.prepare(`
      SELECT id, score, accuracy, wrong_chars AS wrong
      FROM scores WHERE session_id = ?
    `).get(session.id);
    if (!saved) return null;
    const standing = getUserRank(session.user_id, session.category);
    const typedCount = saved.score + saved.wrong;
    return {
      score: saved.score,
      accuracy: saved.accuracy,
      wrong: saved.wrong,
      typedCount,
      completed: typedCount >= visibleCharacters(session.content).length,
      rank: standing.rank,
      personalBest: standing.best?.score ?? saved.score,
      isPersonalBest: standing.best?.id === saved.id,
      scoreId: saved.id
    };
  }

  app.post('/api/auth/register', async (request, response, next) => {
    if (!studentRegistrationEnabled) return response.status(404).json({ message: '学生注册已关闭，请联系老师导入账号' });
    try {
      const retryAfter = consumeLimit(registrationAttempts, requestIp(request), 5, 60 * 60 * 1000);
      if (retryAfter) return rateLimited(response, retryAfter);

      const requestedUsername = normalizeUsername(request.body.username);
      const username = requestedUsername || generateStudentUsername();
      const displayName = normalizeDisplayName(cleanText(request.body.displayName, 12));
      const password = String(request.body.password ?? '');
      const validationError = (requestedUsername ? validateUsername(requestedUsername) : null) || validateDisplayName(displayName) || validatePassword(password);
      if (validationError) return response.status(400).json({ message: validationError });

      const duplicateName = db.prepare('SELECT id FROM users WHERE lower(trim(display_name)) = lower(trim(?)) LIMIT 1').get(displayName);
      if (duplicateName) return response.status(409).json({ message: '该姓名已经注册，请使用其他姓名' });

      const passwordHash = await hashPassword(password);
      let result;
      try {
        result = db.prepare(`
          INSERT INTO users (username, display_name, password_hash, is_active, last_login_at)
          VALUES (?, ?, ?, ?, CASE WHEN ? = 1 THEN NULL ELSE CURRENT_TIMESTAMP END)
        `).run(username, displayName, passwordHash, requireAccountApproval ? 0 : 1, requireAccountApproval ? 1 : 0);
      } catch (error) {
        if (String(error.code).startsWith('SQLITE_CONSTRAINT')) {
          return response.status(409).json({ message: '该姓名或账号已经注册' });
        }
        throw error;
      }
      const user = { id: Number(result.lastInsertRowid), username, displayName, avatarData: null };
      if (requireAccountApproval) {
        return response.status(202).json({ pending: true, message: '注册申请已提交，请等待老师在后台启用账号' });
      }
      createStudentSession(user.id, response);
      return response.status(201).json({ user: publicUser(user) });
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/auth/config', (request, response) => {
    response.json({ studentRegistrationEnabled });
  });

  app.post('/api/auth/login', async (request, response, next) => {
    try {
      const loginIdentifier = String(request.body.username ?? request.body.displayName ?? '').trim();
      const username = normalizeUsername(loginIdentifier);
      const displayName = normalizeDisplayName(loginIdentifier);
      const key = `${requestIp(request)}:${username || displayName}`;
      const retryAfter = isFailureLimited(loginFailures, key, 5, 10 * 60 * 1000);
      if (retryAfter) return rateLimited(response, retryAfter);

      const user = db.prepare(`
        SELECT id, username, display_name AS displayName, avatar_data AS avatarData, password_hash AS passwordHash, is_active AS isActive
        FROM users
        WHERE username = ? OR lower(trim(display_name)) = lower(trim(?))
        LIMIT 1
      `).get(username, displayName);
      const passwordValid = await verifyPassword(String(request.body.password ?? ''), user?.passwordHash || FAKE_PASSWORD_RECORD);
      if (!user || !user.isActive || !passwordValid) {
        recordFailure(loginFailures, key, 10 * 60 * 1000);
        const message = user && !user.isActive && passwordValid
          ? '账号正在等待老师审核，请先在后台启用账号'
          : '账号或密码不正确';
        return response.status(401).json({ message });
      }

      loginFailures.delete(key);
      db.prepare('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);
      createStudentSession(user.id, response);
      return response.json({ user: publicUser(user) });
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/auth/logout', (request, response) => {
    const token = parseCookies(request.headers.cookie).typing_session;
    if (token) db.prepare('DELETE FROM user_sessions WHERE token_hash = ?').run(hashSessionToken(token));
    response.setHeader('Set-Cookie', sessionCookie('typing_session', '', 0));
    response.json({ ok: true });
  });

  app.patch('/api/auth/avatar', requireUser, (request, response) => {
    const avatarData = String(request.body?.avatarData || '').trim();
    if (!/^data:image\/(?:png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/i.test(avatarData)) {
      return response.status(400).json({ message: '头像格式不正确，请选择 PNG、JPG 或 WebP 图片' });
    }
    if (avatarData.length > 220_000) return response.status(413).json({ message: '头像图片过大，请重新选择较小的图片' });
    db.prepare('UPDATE users SET avatar_data = ? WHERE id = ?').run(avatarData, request.user.id);
    request.user.avatarData = avatarData;
    return response.json({ user: publicUser(request.user) });
  });

  // 学生反馈的处理状态，后台只能在这三个值之间流转。
  const BUG_REPORT_STATUSES = ['待处理', '处理中', '已处理'];

  const bugReportColumns = `
    bug_reports.id, bug_reports.user_id AS userId, users.display_name AS displayName,
    bug_reports.title, bug_reports.preconditions AS preconditions, bug_reports.steps,
    bug_reports.test_data AS testData, bug_reports.expected_result AS expectedResult,
    bug_reports.actual_result AS actualResult, bug_reports.priority, bug_reports.frequency,
    bug_reports.environment, bug_reports.status, bug_reports.created_at AS createdAt,
    CASE WHEN bug_reports.attachment_data IS NULL THEN 0 ELSE 1 END AS hasAttachment
  `;
  app.post('/api/bug-reports', requireUser, (request, response) => {
    const body = request.body || {};
    const title = cleanText(body.title, 120);
    const preconditions = cleanText(body.preconditions, 1200);
    const steps = cleanText(body.steps, 4000);
    const testData = cleanText(body.testData, 1200);
    const expectedResult = cleanText(body.expectedResult, 1600);
    const actualResult = cleanText(body.actualResult, 1600);
    const priority = ['P0', 'P1', 'P2', 'P3'].includes(body.priority) ? body.priority : 'P2';
    const frequency = ['每次', '经常', '偶尔', '仅一次'].includes(body.frequency) ? body.frequency : '每次';
    const environment = cleanText(body.environment, 500);
    const attachmentData = typeof body.attachmentData === 'string' ? body.attachmentData : '';
    // 学生端只强制「说清发生了什么」。复现步骤、预期结果这些是测试工程师的语言，
    // 大一学生在机房填不出来，强制必填只会逼他们乱填。其余字段允许留空。
    if (!title) {
      return response.status(400).json({ message: '请用一句话说清遇到的问题' });
    }
    if (attachmentData && !/^data:image\/(?:png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/i.test(attachmentData)) {
      return response.status(400).json({ message: '附件仅支持 PNG、JPG 或 WebP 图片' });
    }
    if (attachmentData.length > 220_000) return response.status(413).json({ message: '截图压缩后仍过大，请换一张图片' });
    const result = db.prepare(`
      INSERT INTO bug_reports
        (user_id, title, preconditions, steps, test_data, expected_result, actual_result, priority, frequency, environment, attachment_data)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(request.user.id, title, preconditions, steps, testData, expectedResult, actualResult, priority, frequency, environment, attachmentData || null);
    const id = Number(result.lastInsertRowid);
    return response.status(201).json({ id, caseId: `BUG-${String(id).padStart(5, '0')}`, status: '待处理' });
  });

  app.get('/api/bug-reports/mine', requireUser, (request, response) => {
    const reports = db.prepare(`
      SELECT ${bugReportColumns} FROM bug_reports
      JOIN users ON users.id = bug_reports.user_id
      WHERE bug_reports.user_id = ? ORDER BY bug_reports.id DESC LIMIT 20
    `).all(request.user.id);
    return response.json({ reports });
  });

  app.get('/api/admin/bug-reports', requireAdmin, (request, response) => {
    const status = cleanText(request.query.status, 20);
    const priority = cleanText(request.query.priority, 10);
    const keyword = cleanText(request.query.q, 80);
    const filters = [];
    const params = [];
    if (BUG_REPORT_STATUSES.includes(status)) { filters.push('bug_reports.status = ?'); params.push(status); }
    if (['P0', 'P1', 'P2', 'P3'].includes(priority)) { filters.push('bug_reports.priority = ?'); params.push(priority); }
    if (keyword) {
      filters.push('(bug_reports.title LIKE ? OR users.display_name LIKE ?)');
      params.push(`%${keyword}%`, `%${keyword}%`);
    }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const total = db.prepare(`SELECT COUNT(*) AS count FROM bug_reports
      JOIN users ON users.id = bug_reports.user_id ${where}`).get(...params).count;
    const pagination = listPage(request.query, total);
    const rows = db.prepare(`
      SELECT ${bugReportColumns} FROM bug_reports
      JOIN users ON users.id = bug_reports.user_id
      ${where}
      ORDER BY bug_reports.id DESC LIMIT ? OFFSET ?
    `).all(...params, pagination.pageSize, pagination.offset);
    // reports 是旧字段名，保留一份以免外部脚本失效。
    return response.json({ rows, reports: rows, total, ...pagination });
  });

  app.patch('/api/admin/bug-reports/:id/status', requireAdmin, (request, response) => {
    const id = Number.parseInt(request.params.id, 10);
    const status = String(request.body?.status || '');
    if (!Number.isInteger(id) || id <= 0) return response.status(400).json({ message: '反馈编号不正确' });
    if (!BUG_REPORT_STATUSES.includes(status)) return response.status(400).json({ message: '反馈状态不正确' });
    const result = db.prepare('UPDATE bug_reports SET status = ? WHERE id = ?').run(status, id);
    if (!result.changes) return response.status(404).json({ message: '反馈不存在' });
    response.json({ ok: true, status });
  });

  app.get('/api/admin/bug-reports/:id/attachment', requireAdmin, (request, response) => {
    const id = Number.parseInt(request.params.id, 10);
    const row = db.prepare('SELECT attachment_data AS attachmentData FROM bug_reports WHERE id = ?').get(id);
    const match = String(row?.attachmentData || '').match(/^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=]+)$/i);
    if (!match) return response.status(404).json({ message: '未找到截图附件' });
    const mime = match[1].toLowerCase().replace('jpg', 'jpeg');
    response.set('Cache-Control', 'private, no-store');
    return response.type(`image/${mime}`).send(Buffer.from(match[2], 'base64'));
  });

  // Portable launcher readiness check; instance identifies this process without exposing configuration.
  // 运行版本：运行包根目录有 version.json，开发环境退回 package.json。
  // 后台和更新器都靠它确认「现在跑的是哪一版」。
  app.get('/api/health', (request, response) => {
    response.set('Cache-Control', 'no-store');
    response.json({ status: 'ok', app: 'hanzi-sprint', version: appVersion(), instance: process.env.TYPING_RUNTIME_INSTANCE || null });
  });
  app.get('/api/auth/me', (request, response) => {
    response.json({ authenticated: Boolean(request.user), user: request.user ? publicUser(request.user) : null });
  });

  app.get('/api/users/:id/avatar', requireUser, (request, response) => {
    const id = Number.parseInt(request.params.id, 10);
    const row = db.prepare('SELECT avatar_data AS avatarData FROM users WHERE id = ? AND is_active = 1').get(id);
    if (!row?.avatarData) return response.status(404).end();
    const match = String(row.avatarData).match(/^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=]+)$/i);
    if (!match) return response.status(404).end();
    const mime = match[1].toLowerCase().replace('jpg', 'jpeg');
    response.set('Cache-Control', 'private, max-age=60');
    return response.type(`image/${mime}`).send(Buffer.from(match[2], 'base64'));
  });

  app.get('/api/account/stats', requireUser, (request, response) => {
    const standing = getUserRank(request.user.id);
    const attempts = db.prepare('SELECT COUNT(*) AS count FROM scores WHERE user_id = ?').get(request.user.id).count;
    const recent = db.prepare(`
      SELECT score, accuracy, created_at AS createdAt FROM scores
      WHERE user_id = ? ORDER BY created_at DESC LIMIT 5
    `).all(request.user.id);
    response.json({
      user: publicUser(request.user),
      attempts,
      personalBest: standing.best?.score || 0,
      rank: standing.rank,
      recent
    });
  });

  function keyDiagnosticsForUser(userId) {
    const rows = db.prepare(`
      SELECT key_code AS keyCode,
             SUM(expected_count) AS expectedCount,
             SUM(correct_count) AS correctCount,
             SUM(wrong_count) AS wrongCount
      FROM typing_key_stats
      WHERE user_id = ?
      GROUP BY key_code
      ORDER BY wrongCount DESC, expectedCount DESC, keyCode ASC
    `).all(userId).map((row) => ({
      ...row,
      expectedCount: Number(row.expectedCount || 0),
      correctCount: Number(row.correctCount || 0),
      wrongCount: Number(row.wrongCount || 0),
      errorRate: row.expectedCount ? Math.round(Number(row.wrongCount || 0) / Number(row.expectedCount) * 1000) / 10 : 0
    }));
    return rows;
  }

  function dateKey(value) {
    return new Date(value).toISOString().slice(0, 10);
  }

  function trainingStreak(rows, currentTime) {
    const activeDays = new Set(rows.map((row) => dateKey(row.completedAt)));
    let cursor = new Date(currentTime);
    if (!activeDays.has(dateKey(cursor))) cursor = new Date(cursor.getTime() - 24 * 60 * 60 * 1000);
    let streak = 0;
    while (activeDays.has(dateKey(cursor))) {
      streak += 1;
      cursor = new Date(cursor.getTime() - 24 * 60 * 60 * 1000);
    }
    return streak;
  }

  function learningLevel(rows) {
    const correctChars = rows.reduce((sum, row) => sum + Number(row.correctChars || 0), 0);
    const bestSpeed = rows.reduce((max, row) => Math.max(max, Number(row.speed || 0)), 0);
    if (correctChars >= 2000 || bestSpeed >= 180) return { code: 'master', label: '稳定输入', next: '挑战更高速度' };
    if (correctChars >= 800 || bestSpeed >= 100) return { code: 'steady', label: '基础熟练', next: '保持准确率并提升速度' };
    return { code: 'start', label: '键位启蒙', next: '完成更多练习，建立输入节奏' };
  }

  app.get('/api/learning/summary', requireUser, (request, response) => {
    const rows = trainingRowsForUsers([request.user.id]);
    const diagnostics = keyDiagnosticsForUser(request.user.id);
    const last7Days = now() - 7 * 24 * 60 * 60 * 1000;
    const recent = rows.slice(-8).reverse().map((row) => ({
      mode: row.mode,
      lessonTitle: row.lessonTitle,
      correctChars: row.correctChars,
      wrongChars: row.wrongChars,
      accuracy: row.accuracy,
      speed: row.speed,
      durationMs: row.durationMs,
      completedAt: row.completedAt
    }));
    const trend = rows.slice(-20).map((row) => ({ completedAt: row.completedAt, speed: row.speed, accuracy: row.accuracy }));
    const totalDurationMs = rows.reduce((sum, row) => sum + Number(row.durationMs || 0), 0);
    const last7 = rows.filter((row) => row.completedAt >= last7Days);
    const topWeakKeys = diagnostics.filter((row) => row.expectedCount >= 2).slice(0, 6);
    response.json({
      user: publicUser(request.user),
      stats: {
        sessions: rows.length,
        totalMinutes: Math.round(totalDurationMs / 60000 * 10) / 10,
        weeklySessions: last7.length,
        weeklyMinutes: Math.round(last7.reduce((sum, row) => sum + Number(row.durationMs || 0), 0) / 60000 * 10) / 10,
        averageSpeed: rows.length ? Math.round(rows.reduce((sum, row) => sum + Number(row.speed || 0), 0) / rows.length * 10) / 10 : 0,
        averageAccuracy: rows.length ? Math.round(rows.reduce((sum, row) => sum + Number(row.accuracy || 0), 0) / rows.length * 10) / 10 : 0,
        bestSpeed: rows.reduce((max, row) => Math.max(max, Number(row.speed || 0)), 0),
        streak: trainingStreak(rows, now())
      },
      level: learningLevel(rows),
      trend,
      recent,
      diagnostics: topWeakKeys,
      hasData: rows.length > 0
    });
  });

  app.get('/api/learning/diagnostics', requireUser, (request, response) => {
    const diagnostics = keyDiagnosticsForUser(request.user.id);
    response.json({
      rows: diagnostics.slice(0, 16),
      recommendedKeys: diagnostics.filter((row) => row.expectedCount >= 2).slice(0, 8),
      hasData: diagnostics.length > 0
    });
  });

  app.get('/api/assignments', requireUser, (request, response) => {
    const assignments = db.prepare(`
      SELECT id, title, description, mode, lesson_title AS lessonTitle,
             target_accuracy AS targetAccuracy, target_speed AS targetSpeed,
             due_at AS dueAt, audience, class_id AS classId, student_ids_json AS studentIdsJson
      FROM assignments
      WHERE is_active = 1
      ORDER BY CASE WHEN due_at IS NULL THEN 1 ELSE 0 END, due_at ASC, id DESC
    `).all();
    const rows = assignments.filter((assignment) => assignmentIncludesStudent(assignment, request.user.id, db)).map((assignment) => {
      const progress = db.prepare(`
        SELECT status, best_accuracy AS bestAccuracy, best_speed AS bestSpeed,
               completed_at AS completedAt, updated_at AS updatedAt
        FROM assignment_progress WHERE assignment_id = ? AND user_id = ?
      `).get(assignment.id, request.user.id);
      const expired = assignment.dueAt && Number(assignment.dueAt) < now();
      const status = progress?.status === 'completed' ? 'completed' : expired ? 'overdue' : progress?.status || 'pending';
      return { ...assignment, studentIdsJson: undefined, status, progress: progress || null };
    });
    response.json({ rows });
  });

  app.get('/api/health', (request, response) => {
    response.json({ ok: true, time: new Date(now()).toISOString() });
  });

  app.post('/api/training-sessions', requireUser, (request, response) => {
    // Offline queues must not be submitted under another student's active session.
    if (request.body?.expectedUserId != null && String(request.body.expectedUserId) !== String(request.user.id)) {
      return response.status(409).json({ message: '当前账号与练习记录所属账号不一致，请登录原账号' });
    }
    const allowedModes = new Set(['beginner', 'english-word', 'english-phrase', 'english-article', 'pinyin-syllable', 'pinyin-word', 'pinyin-article']);
    const mode = cleanText(request.body?.mode, 30);
    const lessonTitle = cleanText(request.body?.lessonTitle, 80);
    const sourceKey = cleanText(request.body?.sourceKey, 180) || null;
    let correctChars = Math.min(10000, Math.max(0, Number.parseInt(request.body?.correctChars, 10) || 0));
    let wrongChars = Math.min(10000, Math.max(0, Number.parseInt(request.body?.wrongChars, 10) || 0));
    const targetText = String(request.body?.targetText ?? '').slice(0, 4000);
    const typedText = String(request.body?.typedText ?? '').slice(0, 4000);
    if (targetText) {
      const calculated = scoreTyping(targetText, typedText);
      correctChars = calculated.score;
      wrongChars = calculated.wrong;
    }
    const durationMs = Math.min(2 * 60 * 60 * 1000, Math.max(1000, Number.parseInt(request.body?.durationMs, 10) || 0));
    if (!allowedModes.has(mode) || !lessonTitle || (correctChars < 1 && wrongChars < 1)) return response.status(400).json({ message: '练习数据不完整，未计入进步记录' });
    const accuracy = Math.round(correctChars / Math.max(1, correctChars + wrongChars) * 1000) / 10;
    const speed = Math.round(correctChars / durationMs * 60_000 * 10) / 10;
    const keyStats = normalizeKeyStats(request.body?.keyStats);
    const completedAt = now();
    const saveTraining = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO training_sessions (user_id, mode, lesson_title, correct_chars, wrong_chars, accuracy, speed, duration_ms, completed_at, source_key, is_finalized)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        ON CONFLICT(source_key) WHERE source_key IS NOT NULL DO NOTHING
      `).run(request.user.id, mode, lessonTitle, correctChars, wrongChars, accuracy, speed, durationMs, completedAt, sourceKey);
      if (result.changes === 0 && sourceKey) {
        const existing = db.prepare('SELECT id FROM training_sessions WHERE source_key = ?').get(sourceKey);
        return { id: existing.id, duplicate: true };
      }
      const sessionId = Number(result.lastInsertRowid);
      const insertKeyStats = db.prepare(`
        INSERT INTO typing_key_stats (training_session_id, user_id, mode, key_code, expected_count, correct_count, wrong_count, actual_errors_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const stat of keyStats) {
        insertKeyStats.run(sessionId, request.user.id, mode, stat.keyCode, stat.expectedCount, stat.correctCount, stat.wrongCount, JSON.stringify(stat.actualErrors), completedAt);
      }
      const assignments = db.prepare(`
        SELECT * FROM assignments
        WHERE is_active = 1 AND (mode = 'all' OR mode = ?)
          AND (lesson_title = '' OR lesson_title = ?)
      `).all(mode, lessonTitle);
      const updateProgress = db.prepare(`
        INSERT INTO assignment_progress (assignment_id, user_id, status, training_session_id, best_accuracy, best_speed, completed_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(assignment_id, user_id) DO UPDATE SET
          status = CASE WHEN excluded.status = 'completed' OR assignment_progress.status = 'completed' THEN 'completed' ELSE excluded.status END,
          training_session_id = CASE WHEN excluded.status = 'completed' THEN excluded.training_session_id ELSE assignment_progress.training_session_id END,
          best_accuracy = MAX(assignment_progress.best_accuracy, excluded.best_accuracy),
          best_speed = MAX(assignment_progress.best_speed, excluded.best_speed),
          completed_at = CASE WHEN excluded.status = 'completed' THEN excluded.completed_at ELSE assignment_progress.completed_at END,
          updated_at = excluded.updated_at
      `);
      for (const assignment of assignments) {
        if (!assignmentIncludesStudent(assignment, request.user.id, db)) continue;
        const meetsAccuracy = Number(assignment.target_accuracy || 0) <= 0 || accuracy >= Number(assignment.target_accuracy);
        const meetsSpeed = Number(assignment.target_speed || 0) <= 0 || speed >= Number(assignment.target_speed);
        const status = meetsAccuracy && meetsSpeed ? 'completed' : 'in_progress';
        updateProgress.run(assignment.id, request.user.id, status, sessionId, accuracy, speed, status === 'completed' ? completedAt : null, completedAt);
      }
      return { id: sessionId, duplicate: false };
    });
    const saved = saveTraining();
    response.status(saved.duplicate ? 200 : 201).json({ id: saved.id, duplicate: saved.duplicate, accuracy, speed, keyStats: keyStats.length });
  });

  app.get('/api/passages', (request, response) => {
    const category = cleanText(request.query.category, 30);
    const params = [];
    let sql = `SELECT id, title, category, content FROM passages WHERE is_active = 1 AND category NOT IN ('一分钟挑战', '英文挑战', '拼音挑战')`;
    if (category) {
      sql += ' AND category = ?';
      params.push(category);
    }
    sql += request.query.random === '1' ? ' ORDER BY RANDOM() LIMIT 1' : ' ORDER BY id ASC';
    const passageRows = db.prepare(sql).all(...params);
    const categories = db.prepare(`SELECT DISTINCT category FROM passages WHERE is_active = 1 AND category NOT IN ('一分钟挑战', '英文挑战', '拼音挑战') ORDER BY category`).all().map((row) => row.category);
    response.json({ passages: passageRows, categories });
  });

  app.post('/api/challenges', requireUser, (request, response) => {
    const requestedMode = cleanText(request.body?.mode, 20);
    const mode = requestedMode === 'english' ? 'english' : 'pinyin';
    const category = requestedMode === 'english'
      ? CHALLENGE_CATEGORIES.english
      : requestedMode === 'pinyin' ? CHALLENGE_CATEGORIES.pinyin : CHALLENGE_CATEGORIES.legacy;
    const passage = db.prepare('SELECT id, title, category, content FROM passages WHERE is_active = 1 AND category = ? ORDER BY RANDOM() LIMIT 1').get(category);
    if (!passage) return response.status(503).json({ message: '暂无可用的竞速文章' });

    const id = crypto.randomUUID();
    // startInMs 让前端可以先放 3 秒倒计时再开始计时；默认 0 = 与旧行为完全一致。
    const startInMs = Math.min(5_000, Math.max(0, Number.parseInt(request.body?.startInMs, 10) || 0));
    const startedAt = now() + startInMs;
    const expiresAt = startedAt + CHALLENGE_DURATION_MS;
    db.prepare('INSERT INTO challenge_sessions (id, passage_id, user_id, started_at, expires_at) VALUES (?, ?, ?, ?, ?)')
      .run(id, passage.id, request.user.id, startedAt, expiresAt);
    db.prepare('DELETE FROM challenge_sessions WHERE started_at < ?').run(startedAt - 24 * 60 * 60 * 1000);
    return response.status(201).json({ sessionId: id, startedAt, expiresAt, startInMs, durationSeconds: 60, mode, passage });
  });

  app.post('/api/challenges/:id/submit', requireUser, (request, response) => {
    const session = db.prepare(`
      SELECT challenge_sessions.*, passages.content, passages.title, passages.category
      FROM challenge_sessions JOIN passages ON passages.id = challenge_sessions.passage_id
      WHERE challenge_sessions.id = ?
    `).get(request.params.id);
    if (!session) return response.status(404).json({ message: '本次挑战不存在或已失效' });
    if (session.user_id !== request.user.id) return response.status(403).json({ message: '这不是你的挑战记录' });
    if (session.submitted_at) {
      const saved = getSavedChallengeResult(session);
      if (saved) return response.json({ ...saved, duplicate: true });
      return response.status(409).json({ message: '本次挑战已经提交过了' });
    }
    if (now() < session.expires_at - SUBMIT_GRACE_MS) return response.status(400).json({ message: '挑战尚未结束，请继续输入' });
    if (now() > session.expires_at + 10 * 60 * 1000) return response.status(410).json({ message: '本次挑战已过期，请重新开始' });

    const typedText = String(request.body.typedText ?? '').slice(0, 2000);

    const result = scoreTyping(session.content, typedText);
    const saveScore = db.transaction(() => {
      const updated = db.prepare('UPDATE challenge_sessions SET submitted_at = ? WHERE id = ? AND submitted_at IS NULL').run(now(), session.id);
      if (updated.changes !== 1) return null;
      return db.prepare('INSERT INTO scores (nickname, score, accuracy, wrong_chars, passage_id, session_id, user_id, category_snapshot, title_snapshot) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(request.user.displayName, result.score, result.accuracy, result.wrong, session.passage_id, session.id, request.user.id, session.category, session.title);
    });
    const insert = saveScore();
    if (!insert) {
      const saved = getSavedChallengeResult(session);
      if (saved) return response.json({ ...saved, duplicate: true });
      return response.status(409).json({ message: '本次挑战已经提交过了' });
    }

    const standing = getUserRank(request.user.id);
    return response.status(201).json({
      ...result,
      rank: standing.rank,
      personalBest: standing.best?.score ?? result.score,
      isPersonalBest: standing.best?.id === Number(insert.lastInsertRowid),
      scoreId: Number(insert.lastInsertRowid)
    });
  });

  app.get('/api/leaderboard', (request, response) => {
    const scope = request.query.scope === 'class' ? 'class' : 'all';
    const limit = Math.min(Math.max(Number.parseInt(request.query.limit, 10) || (scope === 'all' ? 50 : 20), 1), scope === 'all' ? 50 : 20);
    const period = request.query.period === 'today' ? 'today' : 'all';
    const periodFilter = period === 'today' ? `AND date(scores.created_at, 'localtime') = date('now', 'localtime')` : '';
    const mode = request.query.mode === 'english' || request.query.mode === 'pinyin' ? request.query.mode : null;
    const challengeCategory = mode ? CHALLENGE_CATEGORIES[mode] : null;
    // 未传 scope 的旧调用保持全局榜兼容；前台排行榜入口会显式传 class/all。
    const filters = ['scores.user_id IS NOT NULL', 'users.is_active = 1'];
    const params = [];
    if (period === 'today') filters.push("date(scores.created_at, 'localtime') = date('now', 'localtime')");
    if (challengeCategory) { filters.push('COALESCE(scores.category_snapshot, passages.category) = ?'); params.push(challengeCategory); }
    let classId = null;
    let className = null;
    if (scope === 'class') {
      const membership = request.user?.id ? db.prepare(`
        SELECT classes.id AS classId, classes.name AS className
        FROM class_members JOIN classes ON classes.id = class_members.class_id
        WHERE class_members.user_id = ? AND class_members.left_at IS NULL AND classes.is_active = 1
        ORDER BY class_members.joined_at DESC LIMIT 1
      `).get(request.user.id) : null;
      classId = membership?.classId || null;
      className = membership?.className || null;
      if (classId) { filters.push('EXISTS (SELECT 1 FROM class_members cm WHERE cm.user_id = scores.user_id AND cm.class_id = ? AND cm.left_at IS NULL)'); params.push(classId); }
      else filters.push('1 = 0');
    }
    const where = `WHERE ${filters.join(' AND ')}`;
    const rows = db.prepare(`
      WITH attempts AS (
        SELECT scores.id, scores.user_id AS userId, users.display_name AS nickname,
               (SELECT classes.name FROM class_members cm JOIN classes ON classes.id = cm.class_id
                WHERE cm.user_id = scores.user_id AND cm.left_at IS NULL
                ORDER BY cm.joined_at DESC LIMIT 1) AS className,
               scores.score, scores.accuracy, scores.created_at AS createdAt,
               ROW_NUMBER() OVER (
                 PARTITION BY scores.user_id
                 ORDER BY scores.score DESC, scores.accuracy DESC, scores.created_at ASC
               ) AS attemptOrder
        FROM scores JOIN users ON users.id = scores.user_id
          LEFT JOIN passages ON passages.id = scores.passage_id
        ${where}
      ), best AS (
        SELECT id, userId, nickname, className, score, accuracy, createdAt FROM attempts WHERE attemptOrder = 1
      ), ranked AS (
        SELECT *, RANK() OVER (ORDER BY score DESC, accuracy DESC) AS rank FROM best
      )
      SELECT id, userId, nickname, className, score, accuracy, createdAt, rank
      FROM ranked ORDER BY score DESC, accuracy DESC, createdAt ASC LIMIT ?
    `).all(...params, limit).map((row) => ({ ...row, isCurrentUser: request.user?.id === row.userId }));
    const currentRank = request.user?.id ? db.prepare(`
      WITH attempts AS (
        SELECT scores.user_id AS userId, scores.score, scores.accuracy, scores.created_at AS createdAt,
               ROW_NUMBER() OVER (PARTITION BY scores.user_id ORDER BY scores.score DESC, scores.accuracy DESC, scores.created_at ASC) AS attemptOrder
        FROM scores JOIN users ON users.id = scores.user_id
          LEFT JOIN passages ON passages.id = scores.passage_id
        ${where}
      ), best AS (SELECT userId, score, accuracy, createdAt FROM attempts WHERE attemptOrder = 1), ranked AS (
        SELECT userId, RANK() OVER (ORDER BY score DESC, accuracy DESC) AS rank FROM best
      ) SELECT rank FROM ranked WHERE userId = ?
    `).get(...params, request.user.id)?.rank ?? null : null;
    const totals = db.prepare(`
      SELECT COUNT(*) AS attempts, COUNT(DISTINCT scores.user_id) AS participants, COALESCE(MAX(scores.score), 0) AS topScore
      FROM scores JOIN users ON users.id = scores.user_id
        LEFT JOIN passages ON passages.id = scores.passage_id
      ${where}
    `).get(...params);
    response.json({ period, mode, scope, classId, className, currentRank, rows, totals });
  });

  app.post('/api/admin/login', async (request, response, next) => {
    const username = normalizeUsername(request.body.username || 'admin');
    const limitKey = `${requestIp(request)}:${username}`;
    const retryAfter = isFailureLimited(adminLoginFailures, limitKey, 5, 15 * 60 * 1000);
    if (retryAfter) return rateLimited(response, retryAfter);
    const account = db.prepare(`SELECT id, username, display_name AS displayName,
      password_hash AS passwordHash, role, is_active AS isActive
      FROM admin_accounts WHERE username = ?`).get(username);
    const valid = account && account.isActive && await verifyPassword(String(request.body.password ?? ''), account.passwordHash);
    if (!valid) {
      recordFailure(adminLoginFailures, limitKey, 15 * 60 * 1000);
      return response.status(401).json({ message: '后台账号或密码不正确' });
    }
    adminLoginFailures.delete(limitKey);
    db.prepare('UPDATE admin_accounts SET last_login_at = ? WHERE id = ?').run(now(), account.id);
    const token = crypto.randomBytes(32).toString('hex');
    adminSessions.set(token, { id: account.id, username: account.username, displayName: account.displayName, role: account.role, expiresAt: now() + ADMIN_SESSION_TTL_MS });
    response.setHeader('Set-Cookie', sessionCookie('typing_admin', token, ADMIN_SESSION_TTL_MS / 1000));
    return response.json({ ok: true, admin: { id: account.id, username: account.username, displayName: account.displayName, role: account.role } });
  });

  app.post('/api/admin/logout', requireAdmin, (request, response) => {
    const token = parseCookies(request.headers.cookie).typing_admin;
    adminSessions.delete(token);
    response.setHeader('Set-Cookie', sessionCookie('typing_admin', '', 0));
    response.json({ ok: true });
  });

  app.get('/api/admin/me', (request, response) => {
    const token = parseCookies(request.headers.cookie).typing_admin;
    const session = token && adminSessions.get(token);
    const expiresAt = typeof session === 'number' ? session : session?.expiresAt;
    const authenticated = Boolean(expiresAt && expiresAt >= now());
    if (token && !authenticated) adminSessions.delete(token);
    response.json({ authenticated, admin: authenticated && typeof session !== 'number' ? {
      id: session.id, username: session.username, displayName: session.displayName, role: session.role
    } : (authenticated ? { id: 0, username: 'admin', displayName: '超级管理员', role: 'superadmin' } : null) });
  });

  app.get('/api/admin/admins', requireSuperAdmin, (request, response) => {
    const role = cleanText(request.query.role, 20);
    const active = String(request.query.isActive ?? '');
    const keyword = cleanText(request.query.q, 80);
    const filters = [];
    const params = [];
    if (['superadmin', 'manager'].includes(role)) { filters.push('role = ?'); params.push(role); }
    if (active === '1' || active === '0') { filters.push('is_active = ?'); params.push(Number(active)); }
    if (keyword) { filters.push('(username LIKE ? OR display_name LIKE ?)'); params.push(`%${keyword}%`, `%${keyword}%`); }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const total = db.prepare(`SELECT COUNT(*) AS count FROM admin_accounts ${where}`).get(...params).count;
    const pagination = listPage(request.query, total);
    const rows = db.prepare(`SELECT id, username, display_name AS displayName, role,
      is_active AS isActive, created_at AS createdAt, last_login_at AS lastLoginAt
      FROM admin_accounts ${where} ORDER BY created_at ASC LIMIT ? OFFSET ?`)
      .all(...params, pagination.pageSize, pagination.offset);
    response.json({ rows, total, ...pagination });
  });

  app.post('/api/admin/admins', requireSuperAdmin, async (request, response, next) => {
    try {
      const username = normalizeUsername(request.body.username);
      const displayName = normalizeDisplayName(request.body.displayName);
      const password = String(request.body.password || '');
      const usernameError = validateUsername(username);
      const passwordError = validatePassword(password);
      if (usernameError || passwordError || !displayName || Array.from(displayName).length > 20) {
        return response.status(400).json({ message: usernameError || passwordError || '管理员姓名需为 2 至 20 个字符' });
      }
      const role = request.body.role === 'superadmin' ? 'superadmin' : 'manager';
      const result = db.prepare(`INSERT INTO admin_accounts
        (username, display_name, password_hash, role, is_active, created_at)
        VALUES (?, ?, ?, ?, 1, ?)`).run(username, displayName, await hashPassword(password), role, now());
      response.status(201).json({ id: Number(result.lastInsertRowid), username, displayName, role, isActive: 1 });
    } catch (error) {
      if (String(error.code).startsWith('SQLITE_CONSTRAINT')) return response.status(409).json({ message: '管理员账号已存在' });
      next(error);
    }
  });

  app.patch('/api/admin/admins/:id/status', requireSuperAdmin, (request, response) => {
    const id = Number(request.params.id);
    if (id === request.admin.id) return response.status(400).json({ message: '不能停用当前登录账号' });
    const account = db.prepare('SELECT id, role, is_active AS isActive FROM admin_accounts WHERE id = ?').get(id);
    if (!account) return response.status(404).json({ message: '管理员不存在' });
    const active = request.body.isActive ? 1 : 0;
    if (!active && account.role === 'superadmin' && db.prepare("SELECT COUNT(*) AS count FROM admin_accounts WHERE role = 'superadmin' AND is_active = 1").get().count <= 1) {
      return response.status(400).json({ message: '至少保留一个启用中的超级管理员' });
    }
    db.prepare('UPDATE admin_accounts SET is_active = ? WHERE id = ?').run(active, id);
    if (!active) {
      for (const [token, session] of adminSessions) if (session?.id === id) adminSessions.delete(token);
    }
    response.json({ ok: true, isActive: active });
  });

  app.post('/api/admin/admins/:id/reset-password', requireSuperAdmin, async (request, response, next) => {
    try {
      const password = String(request.body.password || '');
      const passwordError = validatePassword(password);
      if (passwordError) return response.status(400).json({ message: passwordError });
      const result = db.prepare('UPDATE admin_accounts SET password_hash = ?, is_active = 1 WHERE id = ?')
        .run(await hashPassword(password), Number(request.params.id));
      if (!result.changes) return response.status(404).json({ message: '管理员不存在' });
      for (const [token, session] of adminSessions) if (session?.id === Number(request.params.id)) adminSessions.delete(token);
      response.json({ ok: true });
    } catch (error) { next(error); }
  });

  app.get('/api/admin/stats', requireAdmin, (request, response) => {
    const stats = db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM scores) AS attempts,
        (SELECT COUNT(DISTINCT user_id) FROM scores WHERE user_id IS NOT NULL) AS participants,
        (SELECT COUNT(*) FROM users) AS registeredUsers,
        (SELECT COALESCE(ROUND(AVG(score), 1), 0) FROM scores) AS averageScore,
        (SELECT COALESCE(MAX(score), 0) FROM scores) AS topScore,
        (SELECT COUNT(*) FROM passages WHERE is_active = 1) AS activePassages
    `).get();
    response.json(stats);
  });

  const assignmentModes = new Set(['all', 'beginner', 'english-word', 'english-phrase', 'english-article', 'pinyin-syllable', 'pinyin-word', 'pinyin-article']);
  function parseAssignmentPayload(body = {}) {
    const title = cleanText(body.title, 80);
    const description = cleanText(body.description, 300);
    const mode = cleanText(body.mode || 'all', 30) || 'all';
    const lessonTitle = cleanText(body.lessonTitle, 80);
    const targetAccuracy = Math.min(100, Math.max(0, Number(body.targetAccuracy) || 0));
    const targetSpeed = Math.min(1000, Math.max(0, Number(body.targetSpeed) || 0));
    const dueAt = body.dueAt === null || body.dueAt === '' || body.dueAt === undefined ? null : Number(body.dueAt);
    const audience = body.audience === 'class' ? 'class' : body.audience === 'selected' ? 'selected' : 'all';
    const classId = audience === 'class' ? Number.parseInt(body.classId, 10) : null;
    const requestedIds = audience === 'selected' && Array.isArray(body.studentIds)
      ? body.studentIds.map((id) => Number.parseInt(id, 10)).filter((id) => id > 0).slice(0, 500)
      : [];
    if (!title || !assignmentModes.has(mode)) return { error: '请填写任务名称并选择有效课程' };
    if (dueAt !== null && !Number.isFinite(dueAt)) return { error: '截止时间格式不正确' };
    if (audience === 'class' && (!Number.isInteger(classId) || classId <= 0 || !db.prepare('SELECT 1 FROM classes WHERE id = ? AND is_active = 1').get(classId))) return { error: '请选择一个启用中的班级' };
    const studentIds = audience === 'selected' && requestedIds.length
      ? [...new Set(db.prepare(`SELECT id FROM users WHERE is_active = 1 AND id IN (${requestedIds.map(() => '?').join(',')})`).all(...requestedIds).map((row) => row.id))]
      : [];
    if (audience === 'selected' && !studentIds.length) return { error: '请至少选择一名已启用学生' };
    return { title, description, mode, lessonTitle, targetAccuracy, targetSpeed, dueAt, audience, classId, studentIds };
  }

  app.get('/api/admin/assignments', requireAdmin, (request, response) => {
    const active = String(request.query.isActive ?? '');
    const mode = cleanText(request.query.mode, 30);
    const keyword = cleanText(request.query.q, 80);
    const filters = [];
    const params = [];
    if (active === '1' || active === '0') { filters.push('assignments.is_active = ?'); params.push(Number(active)); }
    if (mode && assignmentModes.has(mode)) { filters.push('assignments.mode = ?'); params.push(mode); }
    if (keyword) { filters.push('(assignments.title LIKE ? OR assignments.description LIKE ?)'); params.push(`%${keyword}%`, `%${keyword}%`); }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const total = db.prepare(`SELECT COUNT(*) AS count FROM assignments ${where}`).get(...params).count;
    const pagination = listPage(request.query, total);
    const rows = db.prepare(`
      SELECT assignments.id, assignments.title, assignments.description,
             assignments.mode, assignments.lesson_title AS lessonTitle,
             assignments.target_accuracy AS targetAccuracy, assignments.target_speed AS targetSpeed,
             assignments.due_at AS dueAt, assignments.audience, assignments.class_id AS classId,
             classes.name AS className,
             assignments.student_ids_json AS studentIdsJson,
             assignments.is_active AS isActive, assignments.created_at AS createdAt,
             COUNT(assignment_progress.user_id) AS startedCount,
             SUM(CASE WHEN assignment_progress.status = 'completed' THEN 1 ELSE 0 END) AS completedCount
      FROM assignments
      LEFT JOIN assignment_progress ON assignment_progress.assignment_id = assignments.id
      LEFT JOIN classes ON classes.id = assignments.class_id
      ${where}
      GROUP BY assignments.id
      ORDER BY assignments.is_active DESC, assignments.due_at ASC, assignments.id DESC
      LIMIT ? OFFSET ?
    `).all(...params, pagination.pageSize, pagination.offset).map((row) => {
      let studentIds = [];
      try { studentIds = JSON.parse(row.studentIdsJson || '[]').map(Number).filter((id) => id > 0); } catch { studentIds = []; }
      const eligibleIds = row.audience === 'all'
        ? new Set(db.prepare('SELECT id FROM users WHERE is_active = 1').all().map((user) => user.id))
        : row.audience === 'class'
          ? new Set(db.prepare('SELECT user_id AS id FROM class_members JOIN users ON users.id = class_members.user_id WHERE class_id = ? AND left_at IS NULL AND users.is_active = 1').all(row.classId).map((user) => user.id))
          : new Set(studentIds);
      const progressRows = db.prepare('SELECT user_id AS userId, status FROM assignment_progress WHERE assignment_id = ?').all(row.id).filter((progress) => eligibleIds.has(progress.userId));
      const targetCount = eligibleIds.size;
      const completedCount = progressRows.filter((progress) => progress.status === 'completed').length;
      return { ...row, studentIds, targetCount, completedCount, startedCount: progressRows.length, completionRate: targetCount ? Math.round(completedCount / targetCount * 1000) / 10 : 0 };
    });
    response.json({ rows, total, ...pagination });
  });

  app.post('/api/admin/assignments', requireAdmin, (request, response) => {
    const payload = parseAssignmentPayload(request.body);
    if (payload.error) return response.status(400).json({ message: payload.error });
    const { title, description, mode, lessonTitle, targetAccuracy, targetSpeed, dueAt, audience, classId, studentIds } = payload;
    const createdAt = now();
    const result = db.prepare(`
      INSERT INTO assignments (title, description, mode, lesson_title, target_accuracy, target_speed, due_at, audience, class_id, student_ids_json, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(title, description, mode, lessonTitle, targetAccuracy, targetSpeed, dueAt, audience, classId, JSON.stringify(studentIds), createdAt, createdAt);
    response.status(201).json({ id: Number(result.lastInsertRowid) });
  });

  app.put('/api/admin/assignments/:id', requireAdmin, (request, response) => {
    const payload = parseAssignmentPayload(request.body);
    if (payload.error) return response.status(400).json({ message: payload.error });
    const { title, description, mode, lessonTitle, targetAccuracy, targetSpeed, dueAt, audience, classId, studentIds } = payload;
    const result = db.prepare(`
      UPDATE assignments SET title = ?, description = ?, mode = ?, lesson_title = ?, target_accuracy = ?, target_speed = ?, due_at = ?, audience = ?, class_id = ?, student_ids_json = ?, updated_at = ?
      WHERE id = ?
    `).run(title, description, mode, lessonTitle, targetAccuracy, targetSpeed, dueAt, audience, classId, JSON.stringify(studentIds), now(), request.params.id);
    if (!result.changes) return response.status(404).json({ message: '任务不存在' });
    response.json({ ok: true });
  });

  app.patch('/api/admin/assignments/:id/status', requireAdmin, (request, response) => {
    if (typeof request.body?.isActive !== 'boolean') return response.status(400).json({ message: '任务状态参数不正确' });
    const result = db.prepare('UPDATE assignments SET is_active = ?, updated_at = ? WHERE id = ?').run(request.body.isActive ? 1 : 0, now(), request.params.id);
    if (!result.changes) return response.status(404).json({ message: '任务不存在' });
    response.json({ ok: true });
  });

  function adminStudentProgress(users) {
    const grouped = new Map(users.map((user) => [user.id, []]));
    for (const row of trainingRowsForUsers(users.map((user) => user.id))) grouped.get(row.userId)?.push(row);
    return users.map((user) => progressSummary(user, grouped.get(user.id) || []));
  }

  app.get('/api/admin/progress/overview', requireAdmin, (request, response) => {
    const users = db.prepare(`SELECT id, username, display_name AS displayName, is_active AS isActive, created_at AS createdAt, last_login_at AS lastLoginAt FROM users`).all();
    const students = adminStudentProgress(users);
    const trended = students.filter((student) => student.speedChange !== null);
    const last7Days = now() - 7 * 24 * 60 * 60 * 1000;
    const allRows = trainingRowsForUsers(students.map((student) => student.id));
    const modes = {};
    for (const row of allRows) modes[row.mode] = (modes[row.mode] || 0) + 1;
    const dailyMap = new Map();
    for (let offset = 13; offset >= 0; offset -= 1) {
      const date = new Date(now() - offset * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      dailyMap.set(date, []);
    }
    for (const row of allRows) {
      const date = new Date(row.completedAt).toISOString().slice(0, 10);
      if (dailyMap.has(date)) dailyMap.get(date).push(row);
    }
    const daily = [...dailyMap.entries()].map(([date, rows]) => ({ date, sessions: rows.length, speed: average(rows, 'speed'), accuracy: average(rows, 'accuracy') }));
    response.json({
      monitoredStudents: students.filter((student) => student.sessions > 0).length,
      improvingStudents: trended.filter((student) => student.speedChange >= 3 || student.accuracyChange >= 2).length,
      averageSpeedChange: average(trended, 'speedChange'),
      sessionsLast7Days: allRows.filter((row) => row.completedAt >= last7Days).length,
      totalSessions: allRows.length,
      modes,
      daily
    });
  });

  // 学习进步列表：支持按班级筛选 + 按列排序（内存排序，因为指标是算出来的不是表字段）。
  const PROGRESS_SORTERS = {
    name: (a, b) => a.displayName.localeCompare(b.displayName, 'zh-CN'),
    sessions: (a, b) => a.sessions - b.sessions,
    dailyHours: (a, b) => (a.dailyHours || 0) - (b.dailyHours || 0),
    firstSpeed: (a, b) => (a.firstSpeed || 0) - (b.firstSpeed || 0),
    recentSpeed: (a, b) => (a.recentSpeed || 0) - (b.recentSpeed || 0),
    speedChange: (a, b) => (a.speedChange ?? -Infinity) - (b.speedChange ?? -Infinity),
    accuracyChange: (a, b) => (a.accuracyChange ?? -Infinity) - (b.accuracyChange ?? -Infinity),
    latestAt: (a, b) => String(a.latestAt || '').localeCompare(String(b.latestAt || ''))
  };

  app.get('/api/admin/progress/students', requireAdmin, (request, response) => {
    const keyword = cleanText(request.query.q, 80);
    const classId = String(request.query.classId || '');
    const filters = [];
    const params = [];
    if (keyword) {
      filters.push('(users.display_name LIKE ? OR users.username LIKE ?)');
      params.push(`%${keyword}%`, `%${keyword}%`);
    }
    if (classId === 'unassigned') {
      filters.push('NOT EXISTS (SELECT 1 FROM class_members cm WHERE cm.user_id = users.id AND cm.left_at IS NULL)');
    } else if (/^\d+$/.test(classId)) {
      filters.push('EXISTS (SELECT 1 FROM class_members cm WHERE cm.user_id = users.id AND cm.class_id = ? AND cm.left_at IS NULL)');
      params.push(Number(classId));
    }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const users = db.prepare(`SELECT id, username, display_name AS displayName, is_active AS isActive, created_at AS createdAt, last_login_at AS lastLoginAt FROM users ${where} ORDER BY created_at DESC, id DESC`).all(...params);
    const sortKey = PROGRESS_SORTERS[request.query.sort] ? request.query.sort : 'speedChange';
    const descending = request.query.order !== 'asc';
    const compare = PROGRESS_SORTERS[sortKey];
    const allRows = adminStudentProgress(users).sort((a, b) => {
      const result = compare(a, b);
      if (result) return descending ? -result : result;
      // 次级排序固定按姓名，保证翻页顺序稳定
      return a.displayName.localeCompare(b.displayName, 'zh-CN');
    });
    const total = allRows.length;
    const pagination = listPage(request.query, total);
    response.json({ rows: allRows.slice(pagination.offset, pagination.offset + pagination.pageSize), total, sort: sortKey, order: descending ? 'desc' : 'asc', ...pagination });
  });

  // 学习进步周报：按学生和周一汇总全部训练记录，供后台导出 Excel。
  app.get('/api/admin/progress/weekly', requireAdmin, (request, response) => {
    const keyword = cleanText(request.query.q, 80);
    const classId = String(request.query.classId || '');
    if (!classId) return response.status(400).json({ message: '导出周报前请先选择一个班级' });
    const filters = [];
    const params = [];
    if (keyword) {
      filters.push('(users.display_name LIKE ? OR users.username LIKE ?)');
      params.push(`%${keyword}%`, `%${keyword}%`);
    }
    if (classId === 'unassigned') {
      filters.push('NOT EXISTS (SELECT 1 FROM class_members cm WHERE cm.user_id = users.id AND cm.left_at IS NULL)');
    } else if (/^\d+$/.test(classId)) {
      filters.push('EXISTS (SELECT 1 FROM class_members cm WHERE cm.user_id = users.id AND cm.class_id = ? AND cm.left_at IS NULL)');
      params.push(Number(classId));
    }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const users = db.prepare(`
      SELECT users.id, users.username, users.student_id AS studentId, users.display_name AS displayName,
             COALESCE((SELECT classes.name FROM class_members cm JOIN classes ON classes.id = cm.class_id
               WHERE cm.user_id = users.id AND cm.left_at IS NULL AND classes.is_active = 1
               ORDER BY cm.joined_at DESC LIMIT 1), '未分班') AS className
      FROM users ${where} ORDER BY users.display_name COLLATE NOCASE, users.id
    `).all(...params);
    if (!users.length) return response.json({ rows: [], total: 0, classId: classId || null, className: classId === 'unassigned' ? '待分班' : null });

    const usersById = new Map(users.map((user) => [user.id, user]));
    const weekStart = (completedAt) => {
      const date = new Date(Number(completedAt));
      date.setUTCHours(0, 0, 0, 0);
      date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
      return date.toISOString().slice(0, 10);
    };
    const groups = new Map();
    const weeks = new Set();
    for (const training of trainingRowsForUsers(users.map((user) => user.id))) {
      const user = usersById.get(training.userId);
      if (!user) continue;
      const start = weekStart(training.completedAt);
      weeks.add(start);
      const key = `${user.id}:${start}`;
      if (!groups.has(key)) groups.set(key, {
        user, weekStart: start, sessions: 0, correctChars: 0, wrongChars: 0,
        durationMs: 0, bestSpeed: 0, latestAt: 0, activeDays: new Set(), modes: new Set()
      });
      const group = groups.get(key);
      const completedAt = Number(training.completedAt);
      group.sessions += 1;
      group.correctChars += Number(training.correctChars || 0);
      group.wrongChars += Number(training.wrongChars || 0);
      group.durationMs += Number(training.durationMs || 0);
      group.bestSpeed = Math.max(group.bestSpeed, Number(training.speed || 0));
      group.latestAt = Math.max(group.latestAt, completedAt);
      group.activeDays.add(new Date(completedAt).toISOString().slice(0, 10));
      if (training.mode) group.modes.add(training.mode);
    }
    // 只在已有训练记录的周补齐班级内零训练学生，便于教师识别未练习学生。
    for (const start of weeks) {
      for (const user of users) {
        const key = `${user.id}:${start}`;
        if (!groups.has(key)) groups.set(key, {
          user, weekStart: start, sessions: 0, correctChars: 0, wrongChars: 0,
          durationMs: 0, bestSpeed: 0, latestAt: 0, activeDays: new Set(), modes: new Set()
        });
      }
    }
    const rows = [...groups.values()].map((group) => {
      const totalChars = group.correctChars + group.wrongChars;
      const weekEnd = new Date(`${group.weekStart}T00:00:00.000Z`);
      weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
      return {
        weekStart: group.weekStart,
        weekEnd: weekEnd.toISOString().slice(0, 10),
        className: group.user.className,
        displayName: group.user.displayName,
        username: group.user.username,
        studentId: group.user.studentId || '',
        sessions: group.sessions,
        activeDays: group.activeDays.size,
        durationHours: Math.round(group.durationMs / 3_600_000 * 100) / 100,
        correctChars: group.correctChars,
        wrongChars: group.wrongChars,
        totalChars,
        averageSpeed: group.durationMs ? Math.round(group.correctChars / group.durationMs * 60_000 * 10) / 10 : 0,
        bestSpeed: Math.round(group.bestSpeed * 10) / 10,
        accuracy: totalChars ? Math.round(group.correctChars / totalChars * 1000) / 10 : 0,
        modes: [...group.modes].join('、'),
        latestAt: group.latestAt
      };
    }).sort((a, b) => b.weekStart.localeCompare(a.weekStart) || a.displayName.localeCompare(b.displayName, 'zh-CN'));
    if (rows.length > 2000) return response.status(413).json({ message: `当前筛选将导出 ${rows.length} 条周记录，单次最多导出 2000 条，请先搜索学生缩小范围` });
    const selectedClass = classId === 'unassigned' ? '待分班' : classId ? users[0]?.className || null : null;
    response.json({ rows, total: rows.length, classId: classId || null, className: selectedClass });
  });

  app.get('/api/admin/progress/students/:id', requireAdmin, (request, response) => {
    const id = Number.parseInt(request.params.id, 10);
    const user = db.prepare(`SELECT id, username, display_name AS displayName, is_active AS isActive, created_at AS createdAt, last_login_at AS lastLoginAt FROM users WHERE id = ?`).get(id);
    if (!user) return response.status(404).json({ message: '学生账号不存在' });
    const rows = trainingRowsForUsers([id]);
    const daily = new Map();
    for (const row of rows) {
      const day = new Date(row.completedAt).toISOString().slice(0, 10);
      if (!daily.has(day)) daily.set(day, []);
      daily.get(day).push(row);
    }
    response.json({
      student: progressSummary(user, rows),
      daily: [...daily.entries()].map(([date, values]) => ({ date, speed: average(values, 'speed'), accuracy: average(values, 'accuracy'), sessions: values.length })).slice(-30),
      recent: rows.slice(-20).reverse()
    });
  });

  app.get('/api/admin/passages', requireAdmin, (request, response) => {
    const keyword = cleanText(request.query.q, 80);
    const category = cleanText(request.query.category, 30);
    const filters = [];
    const params = [];
    if (keyword) { filters.push('(title LIKE ? OR category LIKE ?)'); params.push(`%${keyword}%`, `%${keyword}%`); }
    if (category) { filters.push('category = ?'); params.push(category); }
    const filter = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const total = db.prepare(`SELECT COUNT(*) AS count FROM passages ${filter}`).get(...params).count;
    const pagination = listPage(request.query, total);
    const rows = db.prepare(`SELECT id, title, category, content, is_active AS isActive, created_at AS createdAt, updated_at AS updatedAt FROM passages ${filter} ORDER BY updated_at DESC, id DESC LIMIT ? OFFSET ?`).all(...params, pagination.pageSize, pagination.offset);
    const categories = db.prepare('SELECT DISTINCT category FROM passages ORDER BY category').all().map((row) => row.category);
    response.json({ rows, total, categories, ...pagination });
  });

  app.post('/api/admin/passages', requireAdmin, (request, response) => {
    const title = cleanText(request.body.title, 60);
    const category = cleanText(request.body.category, 30);
    const content = cleanText(request.body.content, 2000);
    if (!title || !category || content.length < 20) return response.status(400).json({ message: '请填写标题、分类和至少 20 个字符的正文' });
    const result = db.prepare('INSERT INTO passages (title, category, content, is_active) VALUES (?, ?, ?, ?)').run(title, category, content, request.body.isActive === false ? 0 : 1);
    response.status(201).json({ id: Number(result.lastInsertRowid) });
  });

  app.put('/api/admin/passages/:id', requireAdmin, (request, response) => {
    const title = cleanText(request.body.title, 60);
    const category = cleanText(request.body.category, 30);
    const content = cleanText(request.body.content, 2000);
    if (!title || !category || content.length < 20) return response.status(400).json({ message: '请填写标题、分类和至少 20 个字符的正文' });
    const result = db.prepare(`UPDATE passages SET title = ?, category = ?, content = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(title, category, content, request.body.isActive === false ? 0 : 1, request.params.id);
    if (!result.changes) return response.status(404).json({ message: '文章不存在' });
    response.json({ ok: true });
  });

  app.delete('/api/admin/passages/:id', requireAdmin, (request, response) => {
    const result = db.prepare('DELETE FROM passages WHERE id = ?').run(request.params.id);
    if (!result.changes) return response.status(404).json({ message: '文章不存在' });
    response.json({ ok: true });
  });

  app.get('/api/admin/score-categories', requireAdmin, (request, response) => {
    const rows = db.prepare('SELECT DISTINCT category FROM passages WHERE is_active = 1 ORDER BY category').all();
    response.json({ categories: rows.map((row) => row.category) });
  });

  app.get('/api/admin/scores', requireAdmin, (request, response) => {
    const range = String(request.query.range || '');
    const keyword = cleanText(request.query.q, 80);
    const category = cleanText(request.query.category, 40);
    const classId = cleanText(request.query.classId, 40);
    const filters = [];
    const params = [];
    // created_at 有 ISO 和 "YYYY-MM-DD HH:MM:SS" 两种写法，用 julianday 才能都解析。
    if (range === 'today') filters.push("julianday(scores.created_at) >= julianday('now', 'start of day')");
    else if (range === '7d') filters.push("julianday(scores.created_at) >= julianday('now', '-7 days')");
    else if (range === '30d') filters.push("julianday(scores.created_at) >= julianday('now', '-30 days')");
    if (keyword) {
      filters.push('(COALESCE(users.display_name, scores.nickname) LIKE ? OR users.username LIKE ?)');
      params.push(`%${keyword}%`, `%${keyword}%`);
    }
    if (category) { filters.push('COALESCE(scores.category_snapshot, passages.category) = ?'); params.push(category); }
    // 按班级筛选：纯数字按班级成员，unassigned 指当前没有任何有效班级的已注册用户（访客成绩不算未分班）。
    if (/^\d+$/.test(classId)) {
      filters.push('EXISTS (SELECT 1 FROM class_members cm WHERE cm.user_id = scores.user_id AND cm.class_id = ? AND cm.left_at IS NULL)');
      params.push(Number(classId));
    } else if (classId === 'unassigned') {
      filters.push('(users.id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM class_members cm JOIN classes ON classes.id = cm.class_id WHERE cm.user_id = scores.user_id AND cm.left_at IS NULL AND classes.is_active = 1))');
    }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const total = db.prepare(`
      SELECT COUNT(*) AS count FROM scores
      LEFT JOIN users ON users.id = scores.user_id
      LEFT JOIN passages ON passages.id = scores.passage_id
      ${where}
    `).get(...params).count;
    const pagination = listPage(request.query, total);
    const rows = db.prepare(`
      SELECT scores.id, COALESCE(users.display_name, scores.nickname) AS nickname, users.username,
             COALESCE(users.student_id, '') AS studentId,
             CASE WHEN users.id IS NULL THEN '' ELSE COALESCE((SELECT classes.name FROM class_members cm JOIN classes ON classes.id = cm.class_id
               WHERE cm.user_id = users.id AND cm.left_at IS NULL AND classes.is_active = 1 ORDER BY cm.joined_at DESC LIMIT 1), '未分班') END AS className,
             scores.score, scores.accuracy, scores.wrong_chars AS wrongChars,
             scores.created_at AS createdAt, COALESCE(scores.title_snapshot, passages.title) AS passageTitle
      FROM scores LEFT JOIN passages ON passages.id = scores.passage_id
      LEFT JOIN users ON users.id = scores.user_id
      ${where}
      ORDER BY scores.created_at DESC LIMIT ? OFFSET ?
    `).all(...params, pagination.pageSize, pagination.offset);
    response.json({ rows, total, ...pagination });
  });

  app.get('/api/admin/scores/export', requireAdmin, (request, response) => {
    // 筛选条件与 AI 助手共用一份（backend/score-filters.js），避免两边数字对不上。
    const query = { range: request.query.range, q: request.query.q, category: request.query.category, classId: request.query.classId };
    const total = countScoreRows(db, query);
    if (total > 5000) return response.status(413).json({ message: `当前筛选有 ${total} 条成绩，单次最多导出 5000 条，请先缩小筛选范围` });
    const rows = selectScoreRows(db, query);
    // format=csv 给 AI 助手和直接下载用；默认仍返回 JSON，后台页面用它自己生成 xlsx。
    if (String(request.query.format || '') === 'csv') {
      const stamp = new Date(now()).toISOString().slice(0, 10);
      response.setHeader('Content-Type', 'text/csv; charset=utf-8');
      response.setHeader('Content-Disposition', `attachment; filename="typing-scores-${stamp}.csv"`);
      return response.send(scoreRowsToCsv(rows));
    }
    response.json({ rows, total });
  });

  app.delete('/api/admin/scores/:id', requireAdmin, (request, response) => {
    const result = db.prepare('DELETE FROM scores WHERE id = ?').run(request.params.id);
    if (!result.changes) return response.status(404).json({ message: '成绩不存在' });
    response.json({ ok: true });
  });

  app.post('/api/admin/users/import', requireAdmin, async (request, response, next) => {
    try {
      const rawRows = Array.isArray(request.body?.rows) ? request.body.rows : String(request.body?.text || '')
        .split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
          // 粘贴名单兼容逗号、分号、制表符和空格，和后台弹窗提示保持一致。
          const parts = line.split(/[\t,，;；]|\s+/).map((item) => item.trim());
          const looksLikeStudentId = (value) => /^[A-Za-z0-9_-]{4,32}$/.test(value || '');
          const newOrder = looksLikeStudentId(parts[0]) && !looksLikeStudentId(parts[1]);
          return newOrder ? { displayName: parts[1], studentId: parts[0] } : { displayName: parts[0], studentId: parts[1] }
        }).filter((row) => !['姓名', '姓名/姓名'].includes(String(row.displayName).replace(/\s/g, '')));
      if (!rawRows.length) return response.status(400).json({ message: '请粘贴“学号,姓名”数据后再导入' });
      if (rawRows.length > 2000) return response.status(400).json({ message: '单次最多导入 2000 名学生' });
      // 可选：导入后直接分到某个班级。班级必须存在且启用。
      const classId = Number.parseInt(request.body?.classId, 10);
      let targetClass = null;
      if (Number.isInteger(classId) && classId > 0) {
        targetClass = db.prepare('SELECT id, name, is_active AS isActive FROM classes WHERE id = ?').get(classId);
        if (!targetClass) return response.status(400).json({ message: '所选班级不存在' });
        if (!targetClass.isActive) return response.status(400).json({ message: '所选班级已停用，请先启用再导入' });
      }
      const errors = [], prepared = [], seenNames = new Map(), seenStudentIds = new Map();
      for (let index = 0; index < rawRows.length; index += 1) {
        const displayName = normalizeDisplayName(rawRows[index]?.displayName);
        const studentId = String(rawRows[index]?.studentId || '').trim();
        const line = index + 1;
        const nameError = validateDisplayName(displayName);
        if (nameError || !/^[A-Za-z0-9_-]{4,32}$/.test(studentId)) {
          errors.push({ line, kind: 'invalid', message: nameError || '学号需为 4-32 位字母、数字、下划线或短横线' }); continue;
        }
        const key = displayName.toLowerCase();
        if (seenNames.has(key)) { errors.push({ line, kind: 'duplicate-name', message: `本次数据中姓名重复（与第${seenNames.get(key)}行相同）` }); continue; }
        seenNames.set(key, line);
        const studentIdKey = studentId.toLowerCase();
        if (seenStudentIds.has(studentIdKey)) { errors.push({ line, kind: 'duplicate-student-id', message: `本次数据中学号重复（与第${seenStudentIds.get(studentIdKey)}行相同）` }); continue; }
        seenStudentIds.set(studentIdKey, line);
        const existing = db.prepare('SELECT display_name AS displayName, student_id AS studentId FROM users WHERE lower(display_name) = lower(?) OR lower(username) = lower(?) OR lower(student_id) = lower(?)').get(displayName, displayName, studentId);
        if (existing) {
          const kind = existing.studentId && existing.studentId.toLowerCase() === studentId.toLowerCase() ? 'duplicate-student-id' : 'duplicate-name';
          const message = kind === 'duplicate-student-id' ? '学号已存在，请先处理已有账号' : '姓名已存在，请先处理已有账号';
          errors.push({ line, kind, message }); continue;
        }
        prepared.push({ displayName, studentId, passwordHash: await hashPassword(studentId) });
      }
      const insert = db.prepare(`INSERT INTO users
        (username, display_name, student_id, password_hash, is_active, last_login_at)
        VALUES (?, ?, ?, ?, 1, NULL)`);
      // 建账号和分班放同一个事务：不会出现「账号建好了但没进班」的半成品。
      const add = db.transaction(() => {
        const ids = prepared.map((item) => insert.run(item.displayName, item.displayName, item.studentId, item.passwordHash).lastInsertRowid);
        if (targetClass && ids.length) {
          const saveMember = db.prepare(`INSERT INTO class_members (class_id, user_id, joined_at, left_at)
            VALUES (?, ?, ?, NULL)
            ON CONFLICT(class_id, user_id) DO UPDATE SET left_at = NULL`);
          const timestamp = now();
          for (const userId of ids) saveMember.run(targetClass.id, userId, timestamp);
        }
        return ids;
      });
      const ids = add();
      response.status(201).json({
        imported: ids.length, failed: errors.length, errors,
        classId: targetClass?.id || null, className: targetClass?.name || null
      });
    } catch (error) { next(error); }
  });

  // 单独创建学生账号：与批量导入保持同一套姓名、学号和分班规则。
  // 未填写初始密码时默认使用学号，方便老师现场快速建号。
  app.post('/api/admin/users', requireAdmin, async (request, response, next) => {
    try {
      const displayName = normalizeDisplayName(request.body?.displayName);
      const nameError = validateDisplayName(displayName);
      if (nameError) return response.status(400).json({ message: nameError });
      const studentId = String(request.body?.studentId || '').trim();
      if (!/^[A-Za-z0-9_-]{4,32}$/.test(studentId)) return response.status(400).json({ message: '学号需为 4-32 位字母、数字、下划线或短横线' });
      const providedPassword = String(request.body?.password ?? '').trim();
      const password = providedPassword || studentId;
      // 留空时沿用批量导入规则，学号本身可以是 4-32 位；手动填写密码时走登录密码校验。
      const passwordError = providedPassword ? validatePassword(password) : null;
      if (passwordError) return response.status(400).json({ message: `初始密码无效：${passwordError}` });
      const classIdValue = request.body?.classId;
      const classId = classIdValue === '' || classIdValue === null || classIdValue === undefined ? null : Number.parseInt(classIdValue, 10);
      let targetClass = null;
      if (classId !== null) {
        if (!Number.isInteger(classId) || classId <= 0) return response.status(400).json({ message: '请选择有效的启用班级' });
        targetClass = db.prepare('SELECT id, name, is_active AS isActive FROM classes WHERE id = ?').get(classId);
        if (!targetClass || !targetClass.isActive) return response.status(400).json({ message: '请选择有效的启用班级' });
      }
      const duplicate = db.prepare(`
        SELECT display_name AS displayName, student_id AS studentId, username
        FROM users
        WHERE lower(display_name) = lower(?) OR lower(username) = lower(?) OR lower(student_id) = lower(?)
        LIMIT 1
      `).get(displayName, displayName, studentId);
      if (duplicate) {
        const field = duplicate.studentId && duplicate.studentId.toLowerCase() === studentId.toLowerCase() ? '学号' : '姓名';
        return response.status(409).json({ message: `${field}已存在，请先处理已有账号` });
      }
      const passwordHash = await hashPassword(password);
      const create = db.transaction(() => {
        const result = db.prepare(`
          INSERT INTO users (username, display_name, student_id, password_hash, is_active, last_login_at)
          VALUES (?, ?, ?, ?, 1, NULL)
        `).run(displayName, displayName, studentId, passwordHash);
        const userId = Number(result.lastInsertRowid);
        if (targetClass) db.prepare(`
          INSERT INTO class_members (class_id, user_id, joined_at, left_at)
          VALUES (?, ?, ?, NULL)
          ON CONFLICT(class_id, user_id) DO UPDATE SET left_at = NULL
        `).run(targetClass.id, userId, now());
        return userId;
      });
      const userId = create();
      return response.status(201).json({
        user: { id: userId, username: displayName, displayName, studentId, isActive: true },
        initialPassword: password,
        classId: targetClass?.id || null,
        className: targetClass?.name || null
      });
    } catch (error) {
      if (String(error.code || '').includes('SQLITE_CONSTRAINT')) return response.status(409).json({ message: '姓名或学号已存在，请先处理已有账号' });
      return next(error);
    }
  });

  app.get('/api/admin/users', requireAdmin, (request, response) => {
    const keyword = cleanText(request.query.q, 80);
    const classFilter = cleanText(request.query.classId, 30);
    const filters = [];
    const params = [];
    if (keyword) { filters.push('(users.display_name LIKE ? OR users.username LIKE ? OR users.student_id LIKE ?)'); params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`); }
    if (classFilter === 'unassigned') filters.push('NOT EXISTS (SELECT 1 FROM class_members WHERE class_members.user_id = users.id AND class_members.left_at IS NULL)');
    else if (/^\d+$/.test(classFilter)) { filters.push('EXISTS (SELECT 1 FROM class_members WHERE class_members.user_id = users.id AND class_members.class_id = ? AND class_members.left_at IS NULL)'); params.push(Number(classFilter)); }
    const filter = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const total = db.prepare(`SELECT COUNT(*) AS count FROM users ${filter}`).get(...params).count;
    const pagination = listPage(request.query, total);
    const rows = db.prepare(`
      SELECT users.id, users.username, users.student_id AS studentId, users.display_name AS displayName, users.avatar_data AS avatarData, users.is_active AS isActive,
             users.created_at AS createdAt, users.last_login_at AS lastLoginAt,
             COALESCE((SELECT classes.name FROM class_members cm JOIN classes ON classes.id = cm.class_id
               WHERE cm.user_id = users.id AND cm.left_at IS NULL AND classes.is_active = 1
               ORDER BY cm.joined_at DESC LIMIT 1), '未分班') AS className,
             (SELECT classes.id FROM class_members cm JOIN classes ON classes.id = cm.class_id
               WHERE cm.user_id = users.id AND cm.left_at IS NULL
               ORDER BY cm.joined_at DESC LIMIT 1) AS classId,
             COUNT(scores.id) AS attempts, COALESCE(MAX(scores.score), 0) AS personalBest
      FROM users LEFT JOIN scores ON scores.user_id = users.id ${filter}
      GROUP BY users.id ORDER BY users.created_at DESC, users.id DESC LIMIT ? OFFSET ?
    `).all(...params, pagination.pageSize, pagination.offset);
    response.json({ rows: rows.map((row) => ({ ...row, avatarUrl: avatarUrlForUser(row), avatarData: undefined })), total, ...pagination });
  });

  app.patch('/api/admin/users/:id/profile', requireAdmin, (request, response) => {
    const userId = Number.parseInt(request.params.id, 10);
    if (!Number.isInteger(userId) || userId <= 0) return response.status(400).json({ message: '学生账号参数不正确' });
    const displayName = normalizeDisplayName(request.body?.displayName);
    const nameError = validateDisplayName(displayName);
    if (nameError) return response.status(400).json({ message: nameError });
    const studentId = String(request.body?.studentId || '').trim();
    if (studentId && !/^[A-Za-z0-9_-]{4,32}$/.test(studentId)) return response.status(400).json({ message: '学号需为 4-32 位字母、数字、下划线或短横线' });
    const classIdValue = request.body?.classId;
    const classId = classIdValue === '' || classIdValue === null || classIdValue === undefined ? null : Number.parseInt(classIdValue, 10);
    if (classId !== null && (!Number.isInteger(classId) || classId <= 0 || !db.prepare('SELECT 1 FROM classes WHERE id = ? AND is_active = 1').get(classId))) return response.status(400).json({ message: '请选择有效的启用班级' });
    const avatarData = String(request.body?.avatarData || '').trim();
    if (avatarData && (!/^data:image\/(?:png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/i.test(avatarData) || avatarData.length > 220_000)) return response.status(413).json({ message: '头像格式不支持或文件过大，请选择较小的 PNG/JPG/WEBP 图片' });
    try {
      const save = db.transaction(() => {
        const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
        if (!existing) return { error: '学生账号不存在' };
        const duplicateName = db.prepare('SELECT id FROM users WHERE lower(display_name) = lower(?) AND id <> ?').get(displayName, userId);
        if (duplicateName) return { error: '姓名已被其他学生使用' };
        if (studentId) {
          const duplicateStudentId = db.prepare('SELECT id FROM users WHERE lower(student_id) = lower(?) AND id <> ?').get(studentId, userId);
          if (duplicateStudentId) return { error: '学号已被其他学生使用' };
        }
        const fields = avatarData ? 'display_name = ?, student_id = ?, avatar_data = ?' : 'display_name = ?, student_id = ?';
        const values = avatarData ? [displayName, studentId || null, avatarData, userId] : [displayName, studentId || null, userId];
        db.prepare(`UPDATE users SET ${fields} WHERE id = ?`).run(...values);
        db.prepare('UPDATE class_members SET left_at = ? WHERE user_id = ? AND left_at IS NULL').run(now(), userId);
        if (classId !== null) db.prepare('INSERT INTO class_members (class_id, user_id, joined_at, left_at) VALUES (?, ?, ?, NULL) ON CONFLICT(class_id, user_id) DO UPDATE SET left_at = NULL').run(classId, userId, now());
        return { ok: true };
      })();
      if (save.error) return response.status(save.error === '学生账号不存在' ? 404 : 409).json({ message: save.error });
      response.json({ ok: true });
    } catch (error) { response.status(String(error.code || '').includes('SQLITE_CONSTRAINT') ? 409 : 500).json({ message: '保存学生资料失败' }); }
  });

  app.patch('/api/admin/users/:id/status', requireAdmin, (request, response) => {
    if (typeof request.body.isActive !== 'boolean') return response.status(400).json({ message: '账号状态参数不正确' });
    const result = db.prepare('UPDATE users SET is_active = ? WHERE id = ?').run(request.body.isActive ? 1 : 0, request.params.id);
    if (!result.changes) return response.status(404).json({ message: '学生账号不存在' });
    if (!request.body.isActive) db.prepare('DELETE FROM user_sessions WHERE user_id = ?').run(request.params.id);
    response.json({ ok: true });
  });

  app.post('/api/admin/users/:id/reset-password', requireAdmin, async (request, response, next) => {
    try {
      const password = String(request.body.password ?? '');
      const validationError = validatePassword(password);
      if (validationError) return response.status(400).json({ message: validationError });
      const passwordHash = await hashPassword(password);
      const resetPassword = db.transaction(() => {
        const result = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, request.params.id);
        if (result.changes) db.prepare('DELETE FROM user_sessions WHERE user_id = ?').run(request.params.id);
        return result.changes;
      });
      if (!resetPassword()) return response.status(404).json({ message: '学生账号不存在' });
      return response.json({ ok: true });
    } catch (error) {
      return next(error);
    }
  });

  function parseClassPayload(body = {}) {
    const name = cleanText(body.name, 80);
    const term = cleanText(body.term, 40);
    const description = cleanText(body.description, 300);
    if (!name) return { error: '请填写班级名称' };
    return { name, term, description };
  }

  app.get('/api/admin/classes', requireAdmin, (request, response) => {
    // all=true 给下拉用，不分页也不套筛选（否则"选班级"下拉会跟着列表筛选一起变少）
    if (request.query.all === 'true') {
      const rows = db.prepare(`
        SELECT classes.id, classes.name, classes.term, classes.description,
               classes.is_active AS isActive, classes.created_at AS createdAt,
               classes.updated_at AS updatedAt,
               SUM(CASE WHEN class_members.left_at IS NULL AND users.is_active = 1 THEN 1 ELSE 0 END) AS memberCount
        FROM classes
        LEFT JOIN class_members ON class_members.class_id = classes.id
        LEFT JOIN users ON users.id = class_members.user_id
        GROUP BY classes.id
        ORDER BY classes.is_active DESC, classes.created_at DESC, classes.id DESC
      `).all().map((row) => ({ ...row, memberCount: Number(row.memberCount || 0) }));
      return response.json({ rows, total: rows.length, page: 1, pageSize: rows.length || 1, pages: 1 });
    }
    const active = String(request.query.isActive ?? '');
    const term = cleanText(request.query.term, 40);
    const keyword = cleanText(request.query.q, 80);
    const filters = [];
    const params = [];
    if (active === '1' || active === '0') { filters.push('classes.is_active = ?'); params.push(Number(active)); }
    if (term) { filters.push('classes.term = ?'); params.push(term); }
    if (keyword) { filters.push('(classes.name LIKE ? OR classes.description LIKE ?)'); params.push(`%${keyword}%`, `%${keyword}%`); }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const total = db.prepare(`SELECT COUNT(*) AS count FROM classes ${where}`).get(...params).count;
    const pagination = listPage(request.query, total);
    const rows = db.prepare(`
      SELECT classes.id, classes.name, classes.term, classes.description,
             classes.is_active AS isActive, classes.created_at AS createdAt,
             classes.updated_at AS updatedAt,
             SUM(CASE WHEN class_members.left_at IS NULL AND users.is_active = 1 THEN 1 ELSE 0 END) AS memberCount
      FROM classes
      LEFT JOIN class_members ON class_members.class_id = classes.id
      LEFT JOIN users ON users.id = class_members.user_id
      ${where}
      GROUP BY classes.id
      ORDER BY classes.is_active DESC, classes.created_at DESC, classes.id DESC
      LIMIT ? OFFSET ?
    `).all(...params, pagination.pageSize, pagination.offset).map((row) => ({ ...row, memberCount: Number(row.memberCount || 0) }));
    response.json({ rows, total, ...pagination });
  });

  app.get('/api/admin/classes/unassigned/students', requireAdmin, (request, response) => {
    const keyword = cleanText(request.query.q, 80);
    const where = keyword ? 'AND (users.display_name LIKE ? OR users.username LIKE ? OR users.student_id LIKE ?)' : '';
    const params = keyword ? [`%${keyword}%`, `%${keyword}%`, `%${keyword}%`] : [];
    const total = db.prepare(`
      SELECT COUNT(*) AS count FROM users
      WHERE users.is_active = 1
        AND NOT EXISTS (SELECT 1 FROM class_members WHERE class_members.user_id = users.id AND class_members.left_at IS NULL)
        ${where}
    `).get(...params).count;
    if (request.query.all === 'true') {
      const rows = db.prepare(`
        SELECT users.id, users.username, users.student_id AS studentId, users.display_name AS displayName,
               users.created_at AS createdAt, users.last_login_at AS lastLoginAt
        FROM users
        WHERE users.is_active = 1
          AND NOT EXISTS (SELECT 1 FROM class_members WHERE class_members.user_id = users.id AND class_members.left_at IS NULL)
          ${where}
        ORDER BY users.created_at DESC, users.id DESC
      `).all(...params);
      return response.json({ rows, total, page: 1, pageSize: total, pages: 1 });
    }
    const pagination = listPage(request.query, total);
    const rows = db.prepare(`
      SELECT users.id, users.username, users.student_id AS studentId, users.display_name AS displayName,
             users.created_at AS createdAt, users.last_login_at AS lastLoginAt
      FROM users
      WHERE users.is_active = 1
        AND NOT EXISTS (SELECT 1 FROM class_members WHERE class_members.user_id = users.id AND class_members.left_at IS NULL)
        ${where}
      ORDER BY users.created_at DESC, users.id DESC
      LIMIT ? OFFSET ?
    `).all(...params, pagination.pageSize, pagination.offset);
    response.json({ rows, total, ...pagination });
  });

  // 分班弹框的候选学生：默认只看未分班，scope=all 时列出全部（带当前班级名，方便调班）。
  // 已经在目标班级里的学生不再出现。
  app.get('/api/admin/classes/:id/candidates', requireAdmin, (request, response) => {
    const classId = Number.parseInt(request.params.id, 10);
    if (!Number.isInteger(classId) || classId <= 0) return response.status(400).json({ message: '班级参数不正确' });
    if (!db.prepare('SELECT 1 FROM classes WHERE id = ?').get(classId)) return response.status(404).json({ message: '班级不存在' });
    const scope = request.query.scope === 'all' ? 'all' : 'unassigned';
    const keyword = cleanText(request.query.q, 80);
    const filters = [
      'users.is_active = 1',
      'NOT EXISTS (SELECT 1 FROM class_members cm WHERE cm.user_id = users.id AND cm.class_id = ? AND cm.left_at IS NULL)'
    ];
    const params = [classId];
    if (scope === 'unassigned') {
      filters.push('NOT EXISTS (SELECT 1 FROM class_members cm WHERE cm.user_id = users.id AND cm.left_at IS NULL)');
    }
    if (keyword) {
      filters.push('(users.display_name LIKE ? OR users.username LIKE ?)');
      params.push(`%${keyword}%`, `%${keyword}%`);
    }
    const rows = db.prepare(`
      SELECT users.id, users.display_name AS displayName, users.username,
             (SELECT classes.name FROM class_members cm JOIN classes ON classes.id = cm.class_id
              WHERE cm.user_id = users.id AND cm.left_at IS NULL
              ORDER BY cm.joined_at DESC LIMIT 1) AS className
      FROM users
      WHERE ${filters.join(' AND ')}
      ORDER BY users.display_name COLLATE NOCASE, users.id
      LIMIT 500
    `).all(...params);
    response.json({ rows, total: rows.length, scope });
  });

  app.get('/api/admin/classes/:id/members', requireAdmin, (request, response) => {
    const classId = Number.parseInt(request.params.id, 10);
    if (!Number.isInteger(classId) || classId <= 0) return response.status(400).json({ message: '班级参数不正确' });
    const classRow = db.prepare('SELECT id, name, term, description, is_active AS isActive FROM classes WHERE id = ?').get(classId);
    if (!classRow) return response.status(404).json({ message: '班级不存在' });
    const keyword = cleanText(request.query.q, 80);
    const keywordFilter = keyword ? ' AND (users.display_name LIKE ? OR users.username LIKE ?)' : '';
    const keywordParams = keyword ? [`%${keyword}%`, `%${keyword}%`] : [];
    const total = db.prepare(`
      SELECT COUNT(*) AS count FROM class_members
      JOIN users ON users.id = class_members.user_id
      WHERE class_members.class_id = ? AND class_members.left_at IS NULL${keywordFilter}
    `).get(classId, ...keywordParams).count;
    const pagination = listPage(request.query, total);
    const rows = db.prepare(`
      SELECT users.id, users.username, users.display_name AS displayName,
             class_members.joined_at AS joinedAt
      FROM class_members JOIN users ON users.id = class_members.user_id
      WHERE class_members.class_id = ? AND class_members.left_at IS NULL${keywordFilter}
      ORDER BY users.display_name COLLATE NOCASE, users.id
      LIMIT ? OFFSET ?
    `).all(classId, ...keywordParams, pagination.pageSize, pagination.offset);
    response.json({ class: classRow, rows, total, ...pagination });
  });

  app.get('/api/admin/classes/:id/overview', requireAdmin, (request, response) => {
    const classId = Number.parseInt(request.params.id, 10);
    if (!Number.isInteger(classId) || classId <= 0) return response.status(400).json({ message: '班级参数不正确' });
    const classRow = db.prepare('SELECT id, name, term, description, is_active AS isActive FROM classes WHERE id = ?').get(classId);
    if (!classRow) return response.status(404).json({ message: '班级不存在' });
    const users = db.prepare(`
      SELECT users.id, users.username, users.display_name AS displayName,
             users.is_active AS isActive, users.created_at AS createdAt, users.last_login_at AS lastLoginAt
      FROM class_members JOIN users ON users.id = class_members.user_id
      WHERE class_members.class_id = ? AND class_members.left_at IS NULL
      ORDER BY users.display_name COLLATE NOCASE, users.id
    `).all(classId);
    const memberIds = users.map((user) => user.id);
    const allRows = memberIds.length ? trainingRowsForUsers(memberIds) : [];
    const weekStart = now() - 7 * 24 * 60 * 60 * 1000;
    const today = dateKey(now());
    const weekRows = allRows.filter((row) => row.completedAt >= weekStart);
    const activeToday = new Set(allRows.filter((row) => dateKey(row.completedAt) === today).map((row) => row.userId)).size;
    const students = adminStudentProgress(users).map((student) => ({
      ...student,
      risk: !student.latestAt ? '未开始' : student.latestAt < weekStart ? '长期未练习' : student.latestAccuracy < 85 ? '准确率偏低' : student.speedChange !== null && student.speedChange < 0 ? '速度下降' : ''
    }));
    const riskStudents = students.filter((student) => student.risk).sort((a, b) => {
      const order = { 未开始: 0, 长期未练习: 1, 准确率偏低: 2, 速度下降: 3 };
      return order[a.risk] - order[b.risk] || a.displayName.localeCompare(b.displayName, 'zh-CN');
    }).slice(0, 8);
    const taskRows = db.prepare(`
      SELECT assignments.id, assignments.title, assignments.due_at AS dueAt,
             assignments.target_accuracy AS targetAccuracy, assignments.target_speed AS targetSpeed
      FROM assignments WHERE assignments.is_active = 1 AND assignments.audience = 'class' AND assignments.class_id = ?
      ORDER BY assignments.due_at ASC, assignments.id DESC
    `).all(classId).map((assignment) => {
      const progressRows = db.prepare('SELECT status FROM assignment_progress WHERE assignment_id = ? AND user_id IN (' + (memberIds.length ? memberIds.map(() => '?').join(',') : 'NULL') + ')').all(assignment.id, ...memberIds);
      const completed = progressRows.filter((row) => row.status === 'completed').length;
      return { ...assignment, completedCount: completed, targetCount: memberIds.length, completionRate: memberIds.length ? Math.round(completed / memberIds.length * 1000) / 10 : 0 };
    });
    const ranking = students.slice().sort((a, b) => b.recentSpeed - a.recentSpeed || b.latestAccuracy - a.latestAccuracy || a.displayName.localeCompare(b.displayName, 'zh-CN')).slice(0, 10);
    response.json({
      class: classRow,
      metrics: {
        memberCount: users.length,
        activeToday,
        sessionsWeek: weekRows.length,
        minutesWeek: Math.round(weekRows.reduce((sum, row) => sum + Number(row.durationMs || 0), 0) / 60000 * 10) / 10,
        averageSpeed: average(allRows, 'speed'),
        averageAccuracy: average(allRows, 'accuracy')
      },
      tasks: taskRows,
      risks: riskStudents,
      ranking
    });
  });

  app.post('/api/admin/classes', requireAdmin, (request, response) => {
    const payload = parseClassPayload(request.body);
    if (payload.error) return response.status(400).json({ message: payload.error });
    const timestamp = now();
    const result = db.prepare(`
      INSERT INTO classes (name, term, description, is_active, created_at, updated_at)
      VALUES (?, ?, ?, 1, ?, ?)
    `).run(payload.name, payload.term, payload.description, timestamp, timestamp);
    response.status(201).json({ id: Number(result.lastInsertRowid) });
  });

  app.put('/api/admin/classes/:id', requireAdmin, (request, response) => {
    const classId = Number.parseInt(request.params.id, 10);
    const payload = parseClassPayload(request.body);
    if (!Number.isInteger(classId) || classId <= 0) return response.status(400).json({ message: '班级参数不正确' });
    if (payload.error) return response.status(400).json({ message: payload.error });
    const result = db.prepare('UPDATE classes SET name = ?, term = ?, description = ?, updated_at = ? WHERE id = ?').run(payload.name, payload.term, payload.description, now(), classId);
    if (!result.changes) return response.status(404).json({ message: '班级不存在' });
    response.json({ ok: true });
  });

  app.patch('/api/admin/classes/:id/status', requireAdmin, (request, response) => {
    const classId = Number.parseInt(request.params.id, 10);
    if (!Number.isInteger(classId) || classId <= 0 || typeof request.body?.isActive !== 'boolean') return response.status(400).json({ message: '班级状态参数不正确' });
    const result = db.prepare('UPDATE classes SET is_active = ?, updated_at = ? WHERE id = ?').run(request.body.isActive ? 1 : 0, now(), classId);
    if (!result.changes) return response.status(404).json({ message: '班级不存在' });
    response.json({ ok: true });
  });

  app.post('/api/admin/classes/:id/members', requireAdmin, (request, response) => {
    const classId = Number.parseInt(request.params.id, 10);
    const requestedIds = Array.isArray(request.body?.studentIds)
      ? [...new Set(request.body.studentIds.map((id) => Number.parseInt(id, 10)).filter((id) => Number.isInteger(id) && id > 0))].slice(0, 500)
      : [];
    if (!Number.isInteger(classId) || classId <= 0) return response.status(400).json({ message: '班级参数不正确' });
    if (!requestedIds.length) return response.status(400).json({ message: '请至少选择一名学生' });
    if (!db.prepare('SELECT 1 FROM classes WHERE id = ?').get(classId)) return response.status(404).json({ message: '班级不存在' });
    const placeholders = requestedIds.map(() => '?').join(',');
    const validIds = db.prepare(`SELECT id FROM users WHERE id IN (${placeholders}) AND is_active = 1`).all(...requestedIds).map((row) => row.id);
    if (!validIds.length) return response.status(400).json({ message: '没有可分班的已启用学生' });
    const timestamp = now();
    db.transaction(() => {
      const leaveOtherClasses = db.prepare('UPDATE class_members SET left_at = ? WHERE user_id = ? AND class_id <> ? AND left_at IS NULL');
      const saveMember = db.prepare(`
        INSERT INTO class_members (class_id, user_id, joined_at, left_at) VALUES (?, ?, ?, NULL)
        ON CONFLICT(class_id, user_id) DO UPDATE SET joined_at = CASE WHEN class_members.left_at IS NULL THEN class_members.joined_at ELSE excluded.joined_at END, left_at = NULL
      `);
      for (const userId of validIds) { leaveOtherClasses.run(timestamp, userId, classId); saveMember.run(classId, userId, timestamp); }
    })();
    response.json({ ok: true, assigned: validIds.length });
  });

  app.delete('/api/admin/classes/:id/members/:userId', requireAdmin, (request, response) => {
    const classId = Number.parseInt(request.params.id, 10);
    const userId = Number.parseInt(request.params.userId, 10);
    if (!Number.isInteger(classId) || !Number.isInteger(userId) || classId <= 0 || userId <= 0) return response.status(400).json({ message: '参数不正确' });
    const result = db.prepare('UPDATE class_members SET left_at = ? WHERE class_id = ? AND user_id = ? AND left_at IS NULL').run(now(), classId, userId);
    if (!result.changes) return response.status(404).json({ message: '班级成员不存在' });
    response.json({ ok: true });
  });

  const publicPath = path.join(__dirname, '..', 'public');
  // 赛事进行中（检录 / 比赛 / 暂停）临时关闭其他玩法的入场接口：
  // 全班几十台机器同时开房间轮询会抢掉比赛需要的并发，老师也顾不上处理。
  // 只拦「进入房间」这一类 POST，不影响已在对局里的读写和后台操作。
  const GAME_ENTRY_ROUTES = [
    /^\/api\/battle\/join$/,
    /^\/api\/battle\/competition\/join$/,
    /^\/api\/boss\/join$/,
    /^\/api\/arena\/[^/]+\/join$/,
    /^\/api\/arena\/[^/]+\/join-code$/,
    /^\/api\/arena\/[^/]+\/create$/,
    /^\/api\/chase\/create$/,
    /^\/api\/chase\/join-code$/,
    /^\/api\/runner\/start$/,
    /^\/api\/lobby\/invitations(?:\/[^/]+\/join)?$/
  ];
  let competitionEvent = null;
  app.use((request, response, next) => {
    if (request.method !== 'POST' || !competitionEvent) return next();
    const path = request.path.replace(/\/+$/, '') || '/';
    if (!GAME_ENTRY_ROUTES.some((pattern) => pattern.test(path))) return next();
    if (!competitionEvent.hasActive()) return next();
    response.status(423).json({ message: '比赛正在进行，其他玩法暂时关闭，请回到比赛页面。' });
  });
  require('./battle').installBattle(app, { db, requireUser, requireAdmin, now });
  require('./boss').installBoss(app, { db, requireUser, now });
  require('./competition').installCompetition(app, { db, requireUser, requireAdmin, now });
  competitionEvent = require('./competition-event').installCompetitionEvent(app, { db, requireUser, requireAdmin, now });
  require('./arena').installArena(app, { db, requireUser, now });
  require('./customer-service').installCustomerService(app, { db, requireUser, requireAdmin, now });
  require('./agent').installAgent(app, { db, requireAdmin, now });
  require('./chase').installChase(app, { db, requireUser, now });
  require('./runner').installRunner(app, { db, requireUser, now });
  require('./lobby').installLobby(app, { requireUser, now });
  app.use('/vendor/lucide', express.static(path.join(__dirname, '..', 'node_modules', 'lucide', 'dist', 'umd')));
  app.use(express.static(publicPath));
  app.get('/admin', (request, response) => response.sendFile(path.join(publicPath, 'admin.html')));
  // 比赛大屏：投影机直接开这个地址，不需要登录。数据接口只返回公开字段。
  app.get('/board', (request, response) => response.sendFile(path.join(publicPath, 'board.html')));

  app.use('/api', (request, response) => response.status(404).json({ message: '接口不存在' }));
  app.use((error, request, response, next) => {
    console.error(error);
    response.status(500).json({ message: '服务器暂时无法处理请求' });
  });

  return app;
}

module.exports = { createApp, CHALLENGE_DURATION_MS };



