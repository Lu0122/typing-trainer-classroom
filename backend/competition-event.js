// 比赛赛事引擎：统一单场引擎（M1–M3）
//
// 与旧 competition.js 的区别
//   旧：90 秒内比谁打对的字多（字数赛），房间只在内存里。
//   新：打完整篇比谁快（用时赛），赛事/轮次/成绩/队伍全部落库，进程重启能恢复。
//
// 赛程（单日快赛）
//   draft 建赛 → registration 检录 → running 第 N 轮 → … → finished
//   每轮按用时排名，保留 ceil(人数 × 保留比例)，剩 3 人及以下进入决赛轮不再淘汰。
//
// 完成判定
//   speed 个人赛打完整篇即记录完成时间，准确率用于同字数排序；
//   旧版淘汰/团队同题赛仍按配置的准确率门槛完成。
//
// 参数全部来自 config，代码里不写死任何时长。

const crypto = require('node:crypto');
const { textAt, speedTextAt, passageCatalog, passagesByIds, speedTextFromPassage, segmentText, SPEED_TARGET_CHARS } = require('./competition-texts');
const { listPage } = require('./pagination');

const DEFAULT_CONFIG = Object.freeze({
  registrationMs: 10 * 60_000, // 检录时长
  countdownMs: 3_000, // 开赛前全屏倒计时
  roundMs: 4 * 60_000, // 每轮时长上限
  gapMs: 60_000, // 轮间间隔
  resultMs: 30_000, // 成绩展示
  accuracyThreshold: 95, // 完成所需准确率
  keepRatio: 0.5, // 每轮保留比例
  level: 'standard', // 题库档位
  capacity: 60, // 报名上限
  maxBatch: 16, // 单次提交上限
  teamSize: 5, // 多 v 多每方固定出场人数
  series: 'single', // team: single / league
  passageIds: [], // 老师指定的候选文章（练习文章 id），空数组 = 按轮次自动取题
  textMinLength: SPEED_TARGET_CHARS // 速度赛抽中文章后补足到的中文字数
});

const FINAL_ROUND_SIZE = 3; // 剩 3 人及以下进决赛轮
const MIN_PLAYERS = 2;

function accuracyOf(correct, attempted) {
  return attempted ? Math.round((correct / attempted) * 100) : 100;
}

function fail(message, status = 400) {
  throw Object.assign(new Error(message), { status });
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

class CompetitionEvent {
  constructor(db, { now = Date.now, random = Math.random } = {}) {
    this.db = db;
    this.now = now;
    this.random = random;
    this.ensureSchema();
  }

  ensureSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS competitions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        kind TEXT NOT NULL,
        schedule TEXT NOT NULL,
        status TEXT NOT NULL,
        config_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        started_at INTEGER,
        ended_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS competition_rounds (
        id TEXT PRIMARY KEY,
        competition_id TEXT NOT NULL,
        round_no INTEGER NOT NULL,
        text TEXT NOT NULL,
        level TEXT NOT NULL,
        duration_ms INTEGER NOT NULL,
        keep_count INTEGER NOT NULL,
        is_final INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL,
        planned_at INTEGER,
        started_at INTEGER,
        ended_at INTEGER
        ,paused_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS competition_entries (
        competition_id TEXT NOT NULL,
        user_id INTEGER NOT NULL,
        seat TEXT NOT NULL,
        team_id TEXT,
        joined_at INTEGER NOT NULL,
        reached_round INTEGER NOT NULL DEFAULT 0,
        final_rank INTEGER,
        status TEXT NOT NULL DEFAULT 'active',
        PRIMARY KEY (competition_id, user_id)
      );
      CREATE TABLE IF NOT EXISTS competition_sides (
        id TEXT PRIMARY KEY,
        competition_id TEXT NOT NULL,
        name TEXT NOT NULL,
        color TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        score INTEGER NOT NULL DEFAULT 0,
        UNIQUE (competition_id, name)
      );
      CREATE TABLE IF NOT EXISTS competition_matches (
        id TEXT PRIMARY KEY,
        competition_id TEXT NOT NULL,
        round_id TEXT NOT NULL,
        side_a_id TEXT NOT NULL,
        side_b_id TEXT NOT NULL,
        status TEXT NOT NULL,
        winner_side_id TEXT,
        decision_source TEXT,
        decision_reason TEXT,
        started_at INTEGER NOT NULL,
        ended_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS competition_events (
        id TEXT PRIMARY KEY,
        competition_id TEXT NOT NULL,
        action TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS competition_round_results (
        round_id TEXT NOT NULL,
        user_id INTEGER NOT NULL,
        typed TEXT NOT NULL DEFAULT '',
        correct INTEGER NOT NULL DEFAULT 0,
        attempted INTEGER NOT NULL DEFAULT 0,
        elapsed_ms INTEGER,
        finished_at INTEGER,
        rank INTEGER,
        advanced INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (round_id, user_id)
      );
    `);
    try { this.db.exec('ALTER TABLE competition_rounds ADD COLUMN paused_at INTEGER'); } catch { /* 已存在 */ }
  }

  // ------------------------------------------------------------ 建赛与检录

  create({ name = '打字比赛', mode = 'individual', schedule = 'single', config = {}, sides = [] } = {}) {
    const id = crypto.randomUUID();
    const merged = { ...DEFAULT_CONFIG, ...(config || {}), mode, schedule };
    if (!['individual', 'duel', 'team', 'speed'].includes(mode)) fail('比赛模式不正确');
    if (mode === 'speed' && !['zh', 'en'].includes(merged.language)) fail('个人赛请选择中文或英文');
    if (!['single', 'multi_day'].includes(schedule)) fail('赛程形式不正确');
    if (mode === 'duel' && !Object.prototype.hasOwnProperty.call(config || {}, 'capacity')) merged.capacity = 2;
    if (mode === 'speed' && !Object.prototype.hasOwnProperty.call(config || {}, 'capacity')) merged.capacity = 60;
    if (mode === 'speed' && !Object.prototype.hasOwnProperty.call(config || {}, 'countdownMs')) merged.countdownMs = 5_000;
    if (mode === 'team' && !Object.prototype.hasOwnProperty.call(config || {}, 'capacity')) merged.capacity = Math.max(2, merged.teamSize * 2);
    const normalizedSides = mode === 'team'
      ? (Array.isArray(sides) ? sides : []).slice(0, 8).map((side, index) => ({
        name: String(side?.name || `参赛方 ${index + 1}`).trim().slice(0, 40),
        color: String(side?.color || ['#4a8fe0', '#e05b5b'][index]).slice(0, 16)
      })).filter((side) => side.name)
      : [];
    if (!['single', 'league'].includes(merged.series)) fail('赛事赛制不正确');
    if (mode === 'team' && (merged.series === 'league'
      ? normalizedSides.length < 2 || normalizedSides.length > 8
      : normalizedSides.length !== 2)) fail(merged.series === 'league' ? '循环赛需要 2–8 个参赛方' : '多 v 多必须设置两个参赛方');
    // 老师指定的候选文章：来自「练习文章」表，必须存在且语言与赛事一致。
    const idInput = Array.isArray(merged.passageIds) ? merged.passageIds : [];
    if (idInput.length > 40) fail('最多指定 40 篇文章');
    const wantedIds = [...new Set(idInput.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
    const picked = passagesByIds(this.db, wantedIds);
    if (picked.length !== wantedIds.length) fail('指定的文章已被删除或停用，请重新选择');
    const expectedLanguage = mode === 'speed' ? merged.language : 'zh';
    if (picked.some((passage) => passage.language !== expectedLanguage)) fail('指定的文章语言与比赛语言不一致');
    merged.passageIds = picked.map((passage) => passage.id);
    const minLength = Number(merged.textMinLength);
    merged.textMinLength = Number.isFinite(minLength)
      ? Math.min(2000, Math.max(100, Math.round(minLength)))
      : SPEED_TARGET_CHARS;
    const create = this.db.transaction(() => {
      this.db.prepare(`INSERT INTO competitions (id, name, kind, schedule, status, config_json, created_at)
        VALUES (?, ?, ?, ?, 'draft', ?, ?)`)
        .run(id, String(name).slice(0, 40), mode, schedule, JSON.stringify(merged), this.now());
      const insertSide = this.db.prepare('INSERT INTO competition_sides (id, competition_id, name, color, created_at) VALUES (?, ?, ?, ?, ?)');
      for (const side of normalizedSides) insertSide.run(crypto.randomUUID(), id, side.name, side.color, this.now());
    });
    create();
    this.recordEvent(id, 'created', { mode, schedule, series: merged.series, sides: normalizedSides.map((side) => side.name) });
    return { id, name, mode, schedule, config: merged, sides: normalizedSides, status: 'draft' };
  }

  get(id) {
    const row = this.db.prepare('SELECT * FROM competitions WHERE id = ?').get(id);
    if (!row) fail('赛事不存在', 404);
    return row;
  }

  configOf(row) {
    return { ...DEFAULT_CONFIG, ...JSON.parse(row.config_json) };
  }

  sidesOf(id) {
    return this.db.prepare(`SELECT id, name, color, score
      FROM competition_sides WHERE competition_id = ? ORDER BY created_at, id`).all(id);
  }

  recordEvent(id, action, payload = {}) {
    this.db.prepare(`INSERT INTO competition_events (id, competition_id, action, payload_json, created_at)
      VALUES (?, ?, ?, ?, ?)`).run(crypto.randomUUID(), id, action, JSON.stringify(payload), this.now());
  }

  eventsOf(id) {
    return this.db.prepare(`SELECT id, action, payload_json AS payloadJson, created_at AS createdAt
      FROM competition_events WHERE competition_id = ? ORDER BY created_at DESC LIMIT 30`).all(id)
      .map((event) => ({ ...event, payload: JSON.parse(event.payloadJson) }));
  }

  standingsOf(id, sides = this.sidesOf(id)) {
    const rows = this.db.prepare(`SELECT side_a_id AS sideAId, side_b_id AS sideBId, winner_side_id AS winnerSideId
      FROM competition_matches WHERE competition_id = ? AND status = 'settled'`).all(id);
    const wins = new Map(sides.map((side) => [side.id, 0]));
    const losses = new Map(sides.map((side) => [side.id, 0]));
    for (const match of rows) {
      if (!match.winnerSideId) continue;
      wins.set(match.winnerSideId, (wins.get(match.winnerSideId) || 0) + 1);
      const loser = match.winnerSideId === match.sideAId ? match.sideBId : match.sideAId;
      losses.set(loser, (losses.get(loser) || 0) + 1);
    }
    return sides.map((side) => ({ ...side, wins: wins.get(side.id) || 0, losses: losses.get(side.id) || 0 }))
      .sort((a, b) => b.score - a.score || b.wins - a.wins || a.losses - b.losses || a.name.localeCompare(b.name, 'zh-CN'));
  }

  seriesOf(row) {
    return this.configOf(row).series || 'single';
  }

  pairingsFor(sides, roundNo) {
    const slots = sides.length % 2 ? [...sides, null] : [...sides];
    const fixed = slots[0];
    const rotating = slots.slice(1);
    const shift = (roundNo - 1) % Math.max(1, rotating.length);
    const order = [fixed, ...(shift ? rotating.slice(-shift) : []), ...(shift ? rotating.slice(0, -shift) : rotating)];
    const pairs = [];
    for (let index = 0; index < Math.floor(order.length / 2); index += 1) {
      const sideA = order[index];
      const sideB = order[order.length - 1 - index];
      if (sideA && sideB) pairs.push({ sideA, sideB });
    }
    return pairs;
  }

  openRegistration(id) {
    const row = this.get(id);
    if (row.status !== 'draft') fail('只有草稿状态的赛事可以开启检录');
    this.db.prepare('UPDATE competitions SET status = ? WHERE id = ?').run('registration', id);
    this.recordEvent(id, 'registration_opened');
    return this.state(id);
  }

  join(id, user, { sideId = null } = {}) {
    const row = this.get(id);
    if (row.status !== 'registration') fail('赛事不在检录阶段，无法加入');
    const config = this.configOf(row);
    const existing = this.db.prepare('SELECT * FROM competition_entries WHERE competition_id = ? AND user_id = ?').get(id, user.id);
    if (existing) return existing;
    const total = this.db.prepare('SELECT COUNT(*) AS n FROM competition_entries WHERE competition_id = ?').get(id).n;
    if (total >= config.capacity) fail('报名人数已满', 409);
    let selectedSide = null;
    if (row.kind === 'team') {
      if (!sideId) fail('请先选择参赛方');
      selectedSide = this.db.prepare('SELECT * FROM competition_sides WHERE id = ? AND competition_id = ?').get(sideId, id);
      if (!selectedSide) fail('参赛方不存在', 404);
      const sideCount = this.db.prepare(`SELECT COUNT(*) AS n FROM competition_entries
        WHERE competition_id = ? AND team_id = ? AND status = 'active'`).get(id, sideId).n;
      if (sideCount >= config.teamSize) fail('该参赛方出场名额已满', 409);
    }
    const seat = crypto.randomUUID();
    this.db.prepare(`INSERT INTO competition_entries (competition_id, user_id, seat, joined_at, status)
      VALUES (?, ?, ?, ?, 'active')`).run(id, user.id, seat, this.now());
    if (selectedSide) this.db.prepare('UPDATE competition_entries SET team_id = ? WHERE competition_id = ? AND user_id = ?')
      .run(selectedSide.id, id, user.id);
    this.recordEvent(id, 'joined', { userId: user.id, sideId: selectedSide?.id || null });
    return this.db.prepare('SELECT * FROM competition_entries WHERE competition_id = ? AND user_id = ?').get(id, user.id);
  }

  // ------------------------------------------------------------ 轮次

  activeEntries(id) {
    return this.db.prepare(`SELECT * FROM competition_entries
      WHERE competition_id = ? AND status = 'active' ORDER BY joined_at, user_id`).all(id);
  }

  runningRound(id) {
    return this.db.prepare(`SELECT * FROM competition_rounds
      WHERE competition_id = ? AND status IN ('countdown', 'running', 'paused', 'scheduled') ORDER BY round_no DESC LIMIT 1`).get(id);
  }

  latestRound(id) {
    return this.db.prepare(`SELECT * FROM competition_rounds
      WHERE competition_id = ? ORDER BY round_no DESC LIMIT 1`).get(id);
  }

  roundOf(id, roundId) {
    const round = this.db.prepare('SELECT * FROM competition_rounds WHERE id = ? AND competition_id = ?').get(roundId, id);
    if (!round) fail('轮次不存在', 404);
    return round;
  }

  // 本轮题面：老师指定了候选文章就从候选里随机抽（优先抽本场还没用过的），
  // 否则沿用原来的按轮次自动取题。速度赛抽中的文章只作开头，后面自动衔接同分类篇目补足长度。
  pickText(row, config, roundNo) {
    const automatic = () => ({
      text: row.kind === 'speed' ? speedTextAt(config.language, roundNo - 1) : textAt(config.level, roundNo - 1),
      level: row.kind === 'speed' ? 'standard' : config.level
    });
    const ids = Array.isArray(config.passageIds) ? config.passageIds : [];
    if (!ids.length) return automatic();
    // 停用不拦：老师停用某篇只是不想它出现在新赛事里，已排好的赛事照旧用它。
    // 真的被删掉才报错——静默换成内置题库会让老师以为在打自己选的文章。
    const passages = passagesByIds(this.db, ids, { includeInactive: true });
    if (!passages.length) fail('指定的文章已被删除，请重新建赛并重新选择文章');
    const built = passages.map((passage) => ({
      level: config.level,
      text: row.kind === 'speed'
        ? speedTextFromPassage(this.db, passage, { minLength: config.textMinLength })
        : passage.content
    }));
    // 同一场尽量不重复出同一篇；候选都用过了才允许重复。
    const used = new Set(this.db.prepare('SELECT text FROM competition_rounds WHERE competition_id = ?')
      .all(row.id).map((item) => item.text));
    const fresh = built.filter((item) => !used.has(item.text));
    const source = fresh.length ? fresh : built;
    return source[Math.min(source.length - 1, Math.floor(this.random() * source.length))];
  }

  beginRound(id, { plannedAt = null } = {}) {
    const row = this.get(id);
    if (row.status === 'finished') fail('赛事已结束');
    if (!['registration', 'running'].includes(row.status)) fail('当前不能开始新一轮');
    if (this.runningRound(id)) fail('本轮还在进行中，请先结算');

    const active = this.activeEntries(id);
    if (active.length < MIN_PLAYERS) fail(`至少需要 ${MIN_PLAYERS} 名选手`);
    if (row.kind === 'duel' && active.length !== 2) fail('1v1 必须正好有 2 名选手');

    const config = this.configOf(row);
    const sides = row.kind === 'team' ? this.sidesOf(id) : [];
    if (row.kind === 'team') {
      const series = this.seriesOf(row);
      if (series === 'league' ? (sides.length < 2 || sides.length > 8) : sides.length !== 2) fail('参赛方数量不符合当前赛制');
      const sideCounts = sides.map((side) => active.filter((entry) => entry.team_id === side.id).length);
      if (sideCounts.some((count) => count !== config.teamSize)) fail(`每方必须正好有 ${config.teamSize} 名出场选手`);
    }
    const previous = this.latestRound(id);
    const roundNo = (previous?.round_no || 0) + 1;
    const isFinal = row.kind === 'team' || row.kind === 'speed' || active.length <= FINAL_ROUND_SIZE ? 1 : 0;
    const keepCount = isFinal ? active.length : Math.max(MIN_PLAYERS, Math.ceil(active.length * config.keepRatio));
    const picked = this.pickText(row, config, roundNo);
    const text = picked.text;
    const roundId = crypto.randomUUID();
    const now = this.now();

    const planned = plannedAt == null ? null : Number(plannedAt);
    const scheduled = row.schedule === 'multi_day' && Number.isFinite(planned) && planned > now;
    const countdown = row.kind === 'speed' && !scheduled;
    const startsAt = scheduled ? null : now + (countdown ? config.countdownMs : 0);
    this.db.prepare(`INSERT INTO competition_rounds
      (id, competition_id, round_no, text, level, duration_ms, keep_count, is_final, status, planned_at, started_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(roundId, id, roundNo, text, picked.level || config.level, config.roundMs, keepCount, isFinal, scheduled ? 'scheduled' : countdown ? 'countdown' : 'running', scheduled ? planned : null, startsAt);

    if (row.kind === 'team') {
      const pairings = this.seriesOf(row) === 'league' ? this.pairingsFor(sides, roundNo) : [{ sideA: sides[0], sideB: sides[1] }];
      const insertMatch = this.db.prepare(`INSERT INTO competition_matches
        (id, competition_id, round_id, side_a_id, side_b_id, status, started_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`);
      for (const pairing of pairings) insertMatch.run(crypto.randomUUID(), id, roundId, pairing.sideA.id, pairing.sideB.id, scheduled ? 'scheduled' : 'running', now);
    }

    this.db.prepare(`UPDATE competitions SET status = ?, started_at = COALESCE(started_at, ?) WHERE id = ?`)
      .run(scheduled ? 'paused' : 'running', now, id);

    for (const entry of active) {
      this.db.prepare(`INSERT INTO competition_round_results (round_id, user_id) VALUES (?, ?)
        ON CONFLICT(round_id, user_id) DO NOTHING`).run(roundId, entry.user_id);
    }
    this.recordEvent(id, scheduled ? 'round_scheduled' : countdown ? 'round_countdown' : 'round_started', { roundNo, plannedAt: scheduled ? planned : null });
    return this.state(id);
  }

  // ------------------------------------------------------------ 作答

  pause(id) {
    const row = this.get(id);
    if (row.status !== 'running') fail('只有进行中的赛事可以暂停');
    const round = this.runningRound(id);
    if (!round) fail('当前没有进行中的轮次');
    if (round.status !== 'running') fail('请等待倒计时结束后再暂停');
    this.db.transaction(() => {
      this.db.prepare("UPDATE competitions SET status = 'paused' WHERE id = ?").run(id);
      this.db.prepare("UPDATE competition_rounds SET status = 'paused', paused_at = ? WHERE id = ?").run(this.now(), round.id);
    })();
    this.recordEvent(id, 'paused', { roundId: round.id });
    return this.state(id);
  }

  resume(id) {
    const row = this.get(id);
    if (row.status !== 'paused') fail('只有暂停中的赛事可以继续');
    const round = this.runningRound(id);
    if (!round || !['paused', 'scheduled'].includes(round.status)) fail('当前没有可恢复的轮次');
    const now = this.now();
    const startedAt = round.status === 'scheduled'
      ? now
      : round.started_at + Math.max(0, now - (round.paused_at || now));
    this.db.transaction(() => {
      this.db.prepare("UPDATE competitions SET status = 'running' WHERE id = ?").run(id);
      this.db.prepare("UPDATE competition_rounds SET status = 'running', started_at = ?, planned_at = NULL, paused_at = NULL WHERE id = ?").run(startedAt, round.id);
      this.db.prepare("UPDATE competition_matches SET status = 'running', started_at = ? WHERE round_id = ? AND status IN ('scheduled', 'running')").run(now, round.id);
    })();
    this.recordEvent(id, 'resumed', { roundId: round.id });
    return this.state(id);
  }

  assignSide(id, userId, sideId) {
    const row = this.get(id);
    if (row.kind !== 'team' || row.status !== 'registration') fail('只有检录中的多 v 多赛事可以改派');
    const entry = this.db.prepare('SELECT * FROM competition_entries WHERE competition_id = ? AND user_id = ?').get(id, userId);
    const side = this.db.prepare('SELECT * FROM competition_sides WHERE competition_id = ? AND id = ?').get(id, sideId);
    if (!entry || !side) fail('选手或参赛方不存在', 404);
    const config = this.configOf(row);
    const count = this.db.prepare(`SELECT COUNT(*) AS n FROM competition_entries
      WHERE competition_id = ? AND team_id = ? AND status = 'active' AND user_id <> ?`).get(id, sideId, userId).n;
    if (count >= config.teamSize) fail('该参赛方出场名额已满', 409);
    this.db.prepare('UPDATE competition_entries SET team_id = ? WHERE competition_id = ? AND user_id = ?').run(sideId, id, userId);
    this.recordEvent(id, 'side_assigned', { userId, sideId });
    return this.state(id);
  }

  removeEntry(id, userId, reason = 'teacher_removed') {
    const row = this.get(id);
    if (!['registration', 'running', 'paused'].includes(row.status)) fail('当前不能移出选手');
    const result = this.db.prepare(`UPDATE competition_entries SET status = 'removed'
      WHERE competition_id = ? AND user_id = ? AND status = 'active'`).run(id, userId);
    if (!result.changes) fail('选手不在当前赛事中', 404);
    this.recordEvent(id, 'entry_removed', { userId, reason: String(reason || '').slice(0, 200) });
    return this.state(id);
  }

  addTime(id, extraMs) {
    const row = this.get(id);
    if (row.kind === 'speed') fail('个人限时赛开始后不可加时');
    if (!['running', 'paused'].includes(row.status)) fail('当前不能加时');
    const round = this.runningRound(id);
    const amount = Math.min(10 * 60_000, Math.max(10_000, Number(extraMs) || 0));
    if (!round || !amount) fail('加时时长不正确');
    this.db.prepare('UPDATE competition_rounds SET duration_ms = duration_ms + ? WHERE id = ?').run(amount, round.id);
    this.recordEvent(id, 'time_added', { roundId: round.id, extraMs: amount });
    return this.state(id);
  }

  submit(id, userId, text, seat = null) {
    const row = this.get(id);
    if (row.status !== 'running') fail('赛事不在进行中');
    const round = this.runningRound(id);
    if (!round) fail('当前没有进行中的轮次');
    if (round.status !== 'running') fail('倒计时尚未结束', 409);
    const config = this.configOf(row);
    const now = this.now();
    if (now >= round.started_at + round.duration_ms) fail('本轮时间已到', 409);

    const entry = this.db.prepare('SELECT * FROM competition_entries WHERE competition_id = ? AND user_id = ?').get(id, userId);
    if (!entry || entry.status !== 'active') fail('你不在本轮参赛名单中', 403);
    if (seat !== null && entry.seat !== seat) fail('座位令牌无效', 409);

    const result = this.db.prepare('SELECT * FROM competition_round_results WHERE round_id = ? AND user_id = ?').get(round.id, userId);
    if (!result) fail('本轮成绩记录缺失', 409);
    if (result.finished_at) return this.state(id, userId);

    const previous = result.typed || '';
    const isSpeed = row.kind === 'speed';
    if (typeof text !== 'string' || text.length > round.text.length) fail('输入内容超出文章长度');
    if (!isSpeed && (!text.startsWith(previous) || text.length - previous.length > config.maxBatch)) {
      fail('请按顺序输入当前段落');
    }
    if (text === previous) return this.state(id, userId);

    let correct = result.correct;
    let attempted = result.attempted;
    if (isSpeed) {
      // Personal speed races allow Backspace corrections. Re-score the current
      // draft so a corrected character can improve the final accuracy.
      attempted = text.length;
      correct = 0;
      for (let index = 0; index < text.length; index += 1) {
        if (text[index] === round.text[index]) correct += 1;
      }
    } else {
      for (let index = previous.length; index < text.length; index += 1) {
        attempted += 1;
        if (text[index] === round.text[index]) correct += 1;
      }
    }

    const accuracy = accuracyOf(correct, attempted);
    // Speed competitions rank everyone by correct characters at the common
    // deadline. A full article at or above the configured accuracy records an
    // early completion; otherwise the player can keep correcting with Backspace.
    const complete = text.length === round.text.length && accuracy >= config.accuracyThreshold;
    const finishedAt = complete ? now : null;
    const elapsedMs = complete ? Math.max(0, now - round.started_at) : null;

    this.db.prepare(`UPDATE competition_round_results
      SET typed = ?, correct = ?, attempted = ?, finished_at = ?, elapsed_ms = ?
      WHERE round_id = ? AND user_id = ?`)
      .run(text, correct, attempted, finishedAt, elapsedMs, round.id, userId);

    // 注意：一个人打完**不结算整轮**，本轮继续到时限或全员完成（由 tick 处理）
    return this.state(id, userId);
  }

  // 时限到，或本轮所有人都已打完 → 自动结算
  tick(id) {
    const round = this.runningRound(id);
    if (!round) return;
    const row = this.get(id);
    if (row.status === 'running' && round.status === 'countdown' && this.now() >= round.started_at) {
      this.db.prepare("UPDATE competition_rounds SET status = 'running' WHERE id = ?").run(round.id);
      this.recordEvent(id, 'round_started', { roundNo: round.round_no });
      round.status = 'running';
    }
    if (row.status !== 'running' || round.status !== 'running') return;
    const active = this.activeEntries(id);
    if (!active.length) return;
    const done = this.db.prepare('SELECT COUNT(*) AS n FROM competition_round_results WHERE round_id = ? AND finished_at IS NOT NULL')
      .get(round.id).n;
    const expected = row.kind === 'team' && this.seriesOf(row) === 'league'
      ? this.db.prepare(`SELECT COUNT(*) AS n FROM competition_entries
          WHERE competition_id = ? AND status = 'active' AND team_id IN (
            SELECT side_a_id FROM competition_matches WHERE round_id = ?
            UNION SELECT side_b_id FROM competition_matches WHERE round_id = ?
          )`).get(id, round.id, round.id).n
      : active.length;
    const timeUp = this.now() >= round.started_at + round.duration_ms;
    if (timeUp || (row.kind !== 'speed' && done >= expected)) this.settle(id);
  }

  // ------------------------------------------------------------ 结算与晋级

  settleSpeed(id, round) {
    const now = this.now();
    const entries = this.activeEntries(id);
    const results = new Map(this.db.prepare('SELECT * FROM competition_round_results WHERE round_id = ?').all(round.id)
      .map((result) => [result.user_id, result]));
    const rows = entries.map((entry) => {
      const result = results.get(entry.user_id);
      return { entry, correct: result?.correct || 0, attempted: result?.attempted || 0,
        elapsedMs: result?.elapsed_ms ?? null, finishedAt: result?.finished_at ?? null };
    });
    rows.sort((a, b) => b.correct - a.correct
      || (b.attempted ? accuracyOf(b.correct, b.attempted) : 0) - (a.attempted ? accuracyOf(a.correct, a.attempted) : 0)
      || (a.elapsedMs ?? round.duration_ms) - (b.elapsedMs ?? round.duration_ms)
      || a.entry.joined_at - b.entry.joined_at || a.entry.user_id - b.entry.user_id);
    const settle = this.db.transaction(() => {
      rows.forEach((item, index) => {
        this.db.prepare('UPDATE competition_round_results SET rank = ? WHERE round_id = ? AND user_id = ?')
          .run(index + 1, round.id, item.entry.user_id);
        this.db.prepare('UPDATE competition_entries SET reached_round = 1, final_rank = ? WHERE competition_id = ? AND user_id = ?')
          .run(index + 1, id, item.entry.user_id);
      });
      this.db.prepare("UPDATE competition_rounds SET status = 'settled', ended_at = ? WHERE id = ?").run(now, round.id);
      this.db.prepare("UPDATE competitions SET status = 'finished', ended_at = ? WHERE id = ?").run(now, id);
    });
    settle();
    this.recordEvent(id, 'speed_finished', { roundId: round.id, participants: rows.length });
    return this.state(id);
  }

  settleTeam(id, row, round) {
    const now = this.now();
    const entries = this.activeEntries(id);
    const results = new Map(
      this.db.prepare('SELECT * FROM competition_round_results WHERE round_id = ?').all(round.id)
        .map((item) => [item.user_id, item])
    );
    const rows = entries.map((entry) => {
      const result = results.get(entry.user_id) || { typed: '', correct: 0, attempted: 0, elapsed_ms: null, finished_at: null };
      return {
        entry,
        correct: result.correct,
        attempted: result.attempted,
        accuracy: accuracyOf(result.correct, result.attempted),
        elapsedMs: result.elapsed_ms,
        finished: result.finished_at !== null
      };
    });
    rows.sort((a, b) => (a.finished !== b.finished ? (a.finished ? -1 : 1)
      : a.finished ? a.elapsedMs - b.elapsedMs || b.accuracy - a.accuracy : b.correct - a.correct || b.accuracy - a.accuracy));
    rows.forEach((item, index) => {
      this.db.prepare('UPDATE competition_round_results SET rank = ?, advanced = 1 WHERE round_id = ? AND user_id = ?')
        .run(index + 1, round.id, item.entry.user_id);
      this.db.prepare('UPDATE competition_entries SET reached_round = ?, final_rank = ? WHERE competition_id = ? AND user_id = ?')
        .run(round.round_no, index + 1, id, item.entry.user_id);
    });

    const sides = this.sidesOf(id);
    const matches = this.db.prepare('SELECT * FROM competition_matches WHERE round_id = ? AND competition_id = ? ORDER BY started_at, id').all(round.id, id);
    const sideResult = (sideId) => {
      const side = sides.find((item) => item.id === sideId);
      const members = rows.filter((item) => item.entry.team_id === sideId);
      const completed = members.filter((item) => item.finished);
      return {
        id: side.id,
        name: side.name,
        color: side.color,
        members: members.length,
        completed: completed.length,
        correct: members.reduce((sum, item) => sum + item.correct, 0),
        averageElapsedMs: completed.length ? Math.round(completed.reduce((sum, item) => sum + item.elapsedMs, 0) / completed.length) : null,
        averageAccuracy: members.length ? Math.round(members.reduce((sum, item) => sum + item.accuracy, 0) / members.length * 10) / 10 : 0
      };
    };
    const compareSides = (a, b) => b.completed - a.completed
      || (a.averageElapsedMs ?? Number.MAX_SAFE_INTEGER) - (b.averageElapsedMs ?? Number.MAX_SAFE_INTEGER)
      || b.averageAccuracy - a.averageAccuracy;
    for (const match of matches) {
      const matchSides = [sideResult(match.side_a_id), sideResult(match.side_b_id)];
      const ordered = matchSides.slice().sort(compareSides);
      const tied = compareSides(ordered[0], ordered[1]) === 0;
      const winner = tied ? null : ordered[0];
      this.db.prepare(`UPDATE competition_matches SET status = 'settled', winner_side_id = ?, decision_source = 'system', ended_at = ? WHERE id = ?`)
        .run(winner?.id || null, now, match.id);
      if (winner) this.db.prepare('UPDATE competition_sides SET score = score + 1 WHERE id = ?').run(winner.id);
    }
    this.db.prepare('UPDATE competition_rounds SET status = ?, ended_at = ? WHERE id = ?')
      .run('settled', now, round.id);
    this.recordEvent(id, 'round_settled', { roundNo: round.round_no, matches: matches.length });
    const totalRounds = this.seriesOf(row) === 'league' ? (sides.length % 2 ? sides.length : sides.length - 1) : 1;
    if (round.round_no >= totalRounds) this.db.prepare(`UPDATE competitions SET status = 'finished', ended_at = ? WHERE id = ?`).run(now, id);
    return this.state(id);
  }

  decideTeam(id, winnerSideId, reason = '', matchId = null) {
    const row = this.get(id);
    if (row.kind !== 'team') fail('只有多 v 多赛事可以修改队伍结果');
    const match = matchId
      ? this.db.prepare('SELECT * FROM competition_matches WHERE id = ? AND competition_id = ?').get(matchId, id)
      : this.db.prepare('SELECT * FROM competition_matches WHERE competition_id = ? ORDER BY started_at DESC LIMIT 1').get(id);
    if (!match || match.status !== 'settled') fail('本场还没有结算');
    if (![match.side_a_id, match.side_b_id].includes(winnerSideId)) fail('胜方不属于本场参赛方');
    if (match.winner_side_id === winnerSideId && match.decision_source === 'teacher') return this.state(id);
    const update = this.db.transaction(() => {
      if (match.winner_side_id) this.db.prepare('UPDATE competition_sides SET score = MAX(0, score - 1) WHERE id = ?').run(match.winner_side_id);
      this.db.prepare('UPDATE competition_sides SET score = score + 1 WHERE id = ?').run(winnerSideId);
      this.db.prepare(`UPDATE competition_matches
        SET winner_side_id = ?, decision_source = 'teacher', decision_reason = ?
        WHERE id = ?`).run(winnerSideId, String(reason || '').slice(0, 300), match.id);
    });
    update();
    this.recordEvent(id, 'result_decided', { matchId: match.id, winnerSideId, reason: String(reason || '').slice(0, 300) });
    return this.state(id);
  }

  settle(id) {
    const row = this.get(id);
    const round = this.runningRound(id);
    if (!round) fail('当前没有进行中的轮次');
    if (round.status !== 'running') fail('本轮尚未开始作答');
    if (row.kind === 'speed' && this.now() < round.started_at + round.duration_ms) fail('个人赛须等统一时限结束');

    if (row.kind === 'team') return this.settleTeam(id, row, round);
    if (row.kind === 'speed') return this.settleSpeed(id, round);

    const now = this.now();
    const entries = this.activeEntries(id);
    const results = new Map(
      this.db.prepare('SELECT * FROM competition_round_results WHERE round_id = ?').all(round.id)
        .map((item) => [item.user_id, item])
    );

    const rows = entries.map((entry) => {
      const result = results.get(entry.user_id) || { typed: '', correct: 0, attempted: 0, elapsed_ms: null, finished_at: null };
      return {
        entry,
        correct: result.correct,
        attempted: result.attempted,
        accuracy: accuracyOf(result.correct, result.attempted),
        elapsedMs: result.elapsed_ms,
        finished: result.finished_at !== null
      };
    });

    // 完成者按用时升序，未完成者排在后面按字数降序
    rows.sort((a, b) => {
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      if (a.finished) return a.elapsedMs - b.elapsedMs || b.accuracy - a.accuracy;
      return b.correct - a.correct || b.accuracy - a.accuracy;
    });

    const keepCount = round.keep_count;
    const advance = (entry) => this.db.prepare(`UPDATE competition_entries
      SET status = ?, reached_round = ?, final_rank = ? WHERE competition_id = ? AND user_id = ?`);

    rows.forEach((item, index) => {
      const rank = index + 1;
      const advanced = rank <= keepCount ? 1 : 0;
      this.db.prepare(`UPDATE competition_round_results SET rank = ?, advanced = ? WHERE round_id = ? AND user_id = ?`)
        .run(rank, advanced, round.id, item.entry.user_id);
      if (advanced) advance().run('active', round.round_no, null, id, item.entry.user_id);
      else advance().run('eliminated', round.round_no, null, id, item.entry.user_id);
    });

    this.db.prepare('UPDATE competition_rounds SET status = ?, ended_at = ? WHERE id = ?')
      .run('settled', now, round.id);
    this.recordEvent(id, 'round_settled', { roundNo: round.round_no, matches: 0 });

    if (round.is_final) this.finish(id);
    return this.state(id);
  }

  finish(id) {
    const row = this.get(id);
    if (row.status === 'finished') return this.state(id);
    const round = this.latestRound(id);
    if (!round || round.status !== 'settled') fail('还没有已结算的轮次');

    // 全部参赛者一起排：打到更后面的轮次优先，同轮按该轮名次
    const ranked = this.db.prepare(`
      SELECT e.user_id, e.reached_round, rr.rank
      FROM competition_entries e
      LEFT JOIN competition_rounds r
        ON r.competition_id = e.competition_id AND r.round_no = e.reached_round
      LEFT JOIN competition_round_results rr
        ON rr.round_id = r.id AND rr.user_id = e.user_id
      WHERE e.competition_id = ?
      ORDER BY e.reached_round DESC, COALESCE(rr.rank, 999) ASC, e.joined_at ASC
    `).all(id);

    const setRank = this.db.prepare('UPDATE competition_entries SET final_rank = ? WHERE competition_id = ? AND user_id = ?');
    ranked.forEach((item, index) => setRank.run(index + 1, id, item.user_id));

    this.db.prepare(`UPDATE competitions SET status = 'finished', ended_at = ? WHERE id = ?`).run(this.now(), id);
    return this.state(id);
  }

  // ------------------------------------------------------------ 对外状态

  state(id, viewerId = null) {
    this.tick(id);
    const row = this.get(id);
    const config = this.configOf(row);
    const round = this.runningRound(id) || this.latestRound(id);
    const entries = this.db.prepare(`SELECT e.*, u.display_name AS name
      FROM competition_entries e LEFT JOIN users u ON u.id = e.user_id
      WHERE e.competition_id = ? ORDER BY e.joined_at, e.user_id`).all(id);
    const results = round
      ? new Map(this.db.prepare('SELECT * FROM competition_round_results WHERE round_id = ?').all(round.id)
        .map((item) => [item.user_id, item]))
      : new Map();

    const players = entries.map((entry) => {
      const result = results.get(entry.user_id) || null;
      return {
        userId: entry.user_id,
        name: entry.name || `选手${entry.user_id}`,
        sideId: entry.team_id || null,
        ...(viewerId !== null && entry.user_id === viewerId ? { seat: entry.seat } : {}),
        status: entry.status,
        reachedRound: entry.reached_round,
        finalRank: entry.final_rank,
        typed: result?.typed || '',
        correct: result?.correct || 0,
        attempted: result?.attempted || 0,
        accuracy: row.kind === 'speed' && !result?.attempted ? 0 : accuracyOf(result?.correct || 0, result?.attempted || 0),
        elapsedMs: result?.elapsed_ms ?? null,
        timeMs: row.kind === 'speed' && round
          ? (result?.elapsed_ms ?? Math.min(round.duration_ms, Math.max(0, (round.ended_at || this.now()) - round.started_at)))
          : null,
        speed: row.kind === 'speed' && round
          ? Math.round((result?.correct || 0) / Math.max(1000, result?.elapsed_ms ?? Math.min(round.duration_ms, Math.max(1000, (round.ended_at || this.now()) - round.started_at))) * 60_000)
          : null,
        finished: result?.finished_at != null,
        rank: result?.rank ?? null,
        advanced: result?.advanced === 1
      };
    });

    const ranking = players
      .filter((player) => player.rank !== null)
      .sort((a, b) => a.rank - b.rank);
    const sides = row.kind === 'team'
      ? this.sidesOf(id).map((side) => ({
        ...side,
        members: players.filter((player) => player.sideId === side.id).length,
        completed: players.filter((player) => player.sideId === side.id && player.finished).length,
        correct: players.filter((player) => player.sideId === side.id).reduce((sum, player) => sum + player.correct, 0)
      }))
      : [];
    const matches = row.kind === 'team' && round
      ? this.db.prepare(`SELECT m.id, m.status, m.side_a_id AS sideAId, a.name AS sideAName,
          m.side_b_id AS sideBId, b.name AS sideBName, m.winner_side_id AS winnerSideId,
          m.decision_source AS decisionSource, m.decision_reason AS decisionReason,
          m.started_at AS startedAt, m.ended_at AS endedAt
        FROM competition_matches m
        JOIN competition_sides a ON a.id = m.side_a_id
        JOIN competition_sides b ON b.id = m.side_b_id
        WHERE m.competition_id = ? AND m.round_id = ? ORDER BY m.started_at, m.id`).all(id, round.id)
      : [];
    const match = matches.length === 1 ? matches[0] : (matches.at(-1) || null);
    const standings = row.kind === 'team' ? this.standingsOf(id, sides) : [];

    return {
      id: row.id,
      name: row.name,
      mode: row.kind,
      schedule: row.schedule,
      status: row.status,
      config,
      round: round
        ? {
          id: round.id,
          no: round.round_no,
          status: round.status,
          text: round.status === 'countdown' && viewerId !== null ? null : round.text,
          level: round.level,
          durationMs: round.duration_ms,
          keepCount: round.keep_count,
          isFinal: round.is_final === 1,
          plannedAt: round.planned_at,
          startsAt: round.started_at,
          endsAt: round.started_at === null ? null : round.started_at + round.duration_ms
        }
        : null,
      serverNow: this.now(),
      playerCount: players.filter((player) => player.status === 'active').length,
      players,
      ranking,
      sides,
      standings,
      match,
      matches,
      events: this.eventsOf(id),
      me: viewerId === null ? null : players.find((player) => player.userId === viewerId) || null
    };
  }

  boardState(id) {
    const state = this.state(id);
    return {
      ...state,
      round: state.round?.status === 'countdown' ? { ...state.round, text: null } : state.round,
      players: state.players.map(({ userId, ...player }) => player),
      events: state.events.map((event) => ({
        ...event,
        payload: Object.fromEntries(Object.entries(event.payload || {}).filter(([key]) => key !== 'userId'))
      })),
      me: null
    };
  }
}

function installCompetitionEvent(app, { db, requireUser, requireAdmin, now }) {
  const engine = new CompetitionEvent(db, { now });
  const route = (handler) => (request, response, next) => {
    try {
      return response.json(handler(request));
    } catch (error) {
      if (error.status) return response.status(error.status).json({ message: error.message });
      return next(error);
    }
  };

  app.get('/api/competitions', requireAdmin, route((request) => {
    const status = String(request.query.status || '');
    const language = String(request.query.language || '');
    const keyword = String(request.query.q || '').trim().slice(0, 80);
    const filters = [];
    const params = [];
    if (['draft', 'registration', 'running', 'paused', 'finished'].includes(status)) {
      filters.push('status = ?'); params.push(status);
    }
    if (['zh', 'en'].includes(language)) {
      filters.push("json_extract(config_json, '$.language') = ?"); params.push(language);
    }
    if (keyword) { filters.push('name LIKE ?'); params.push(`%${keyword}%`); }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const total = db.prepare(`SELECT COUNT(*) AS count FROM competitions ${where}`).get(...params).count;
    const pagination = listPage(request.query, total);
    const rows = db.prepare(`
    SELECT id, name, kind AS mode, json_extract(config_json, '$.language') AS language, schedule, status, created_at AS createdAt,
           started_at AS startedAt, ended_at AS endedAt
    FROM competitions ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?
  `).all(...params, pagination.pageSize, pagination.offset);
    return { rows, total, ...pagination };
  }));

  // 学生端只看到可报名或进行中的赛事，不暴露参数 JSON 和内部时间字段。
  app.get('/api/competitions/available', requireUser, route((request) => {
    const rows = db.prepare(`
    SELECT id, name, kind AS mode, json_extract(config_json, '$.language') AS language, schedule, status, created_at AS createdAt
    FROM competitions
    WHERE status IN ('registration', 'running', 'paused')
      OR (status = 'finished' AND EXISTS (
        SELECT 1 FROM competition_entries WHERE competition_id = competitions.id AND user_id = ?
      ))
    ORDER BY created_at DESC LIMIT 30
    `).all(request.user.id);
    return request.query.mode === 'speed' ? rows.filter((item) => item.mode === 'speed') : rows;
  }));

  app.post('/api/competitions', requireAdmin, route((request) => {
    const mode = request.body?.mode || 'duel';
    const schedule = request.body?.schedule || 'single';
    return engine.create({
      name: request.body?.name,
      mode,
      schedule,
      config: request.body?.config || {},
      sides: request.body?.sides || []
    });
  }));

  // 后台「指定文章」列表：直接读「练习文章」表，带语言标记供前端按中/英文过滤。
  // 必须注册在 /api/competitions/:id 之前，否则会被当成赛事 id。
  app.get('/api/competitions/text-catalog', requireAdmin, route(() => ({
    rows: passageCatalog(db)
  })));

  app.get('/api/competitions/:id', requireUser, route((request) =>
    engine.state(request.params.id, request.user.id)));
  app.get('/api/competitions/:id/admin', requireAdmin, route((request) =>
    engine.state(request.params.id)));
  app.get('/api/competitions/:id/board', route((request) =>
    engine.boardState(request.params.id)));
  app.post('/api/competitions/:id/registration', requireAdmin, route((request) =>
    engine.openRegistration(request.params.id)));
  app.post('/api/competitions/:id/join', requireUser, route((request) =>
    engine.join(request.params.id, request.user, { sideId: request.body?.sideId || null })));
  app.post('/api/competitions/:id/start', requireAdmin, route((request) =>
    engine.beginRound(request.params.id, { plannedAt: request.body?.plannedAt ?? null })));
  app.post('/api/competitions/:id/submit', requireUser, route((request) =>
    engine.submit(request.params.id, request.user.id, request.body?.text, request.body?.seat ?? null)));
  app.post('/api/competitions/:id/settle', requireAdmin, route((request) =>
    engine.settle(request.params.id)));
  app.post('/api/competitions/:id/pause', requireAdmin, route((request) =>
    engine.pause(request.params.id)));
  app.post('/api/competitions/:id/resume', requireAdmin, route((request) =>
    engine.resume(request.params.id)));
  app.patch('/api/competitions/:id/entries/:userId/side', requireAdmin, route((request) =>
    engine.assignSide(request.params.id, Number(request.params.userId), request.body?.sideId)));
  app.delete('/api/competitions/:id/entries/:userId', requireAdmin, route((request) =>
    engine.removeEntry(request.params.id, Number(request.params.userId), request.body?.reason)));
  app.post('/api/competitions/:id/overtime', requireAdmin, route((request) =>
    engine.addTime(request.params.id, request.body?.extraMs)));
  app.post('/api/competitions/:id/result', requireAdmin, route((request) =>
    engine.decideTeam(request.params.id, request.body?.winnerSideId, request.body?.reason, request.body?.matchId || null)));
  app.get('/api/competitions/:id/export.csv', requireAdmin, (request, response, next) => {
    try {
      const state = engine.state(request.params.id);
      if (state.status !== 'finished') return response.status(409).json({ message: '赛事尚未结束，暂不能导出' });
      const sideNames = new Map((state.sides || []).map((side) => [side.id, side.name]));
      const lines = [
        ['最终名次', '姓名', '参赛方', '正确字数', '尝试字数', '准确率', '速度(字/分)', '用时(秒)', '状态'].join(',')
      ];
      for (const player of [...state.players].sort((a, b) => (a.finalRank || 999) - (b.finalRank || 999))) {
        lines.push([
          player.finalRank || '', player.name, sideNames.get(player.sideId) || '', player.correct,
          player.attempted, `${player.accuracy}%`, player.speed ?? '', player.timeMs == null ? (player.elapsedMs == null ? '' : (player.elapsedMs / 1000).toFixed(1)) : (player.timeMs / 1000).toFixed(1),
          player.finished ? '完成' : player.status === 'eliminated' ? '淘汰' : '未完成'
        ].map(csvCell).join(','));
      }
      const stamp = new Date(state.serverNow).toISOString().slice(0, 19).replace(/[:T]/g, '-');
      response.setHeader('Content-Type', 'text/csv; charset=utf-8');
      response.setHeader('Content-Disposition', `attachment; filename="competition-event-${stamp}.csv"`);
      return response.send(`\uFEFF${lines.join('\r\n')}\r\n`);
    } catch (error) { return next(error); }
  });

  return engine;
}

module.exports = { CompetitionEvent, DEFAULT_CONFIG, FINAL_ROUND_SIZE, MIN_PLAYERS, accuracyOf, installCompetitionEvent };
